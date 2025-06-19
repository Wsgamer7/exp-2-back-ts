import { db } from "../db";
import * as schemaDb from "../db/schema";
import type { Poll, PollOption, Tag, Vote } from "../schema";
import {
  eq,
  and,
  or,
  sql,
  inArray,
  desc,
  count as dslCount,
  isNull,
  ilike,
  not,
  SQL,
  isNotNull, // Added import for isNotNull
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Helper to convert DB date to ISO string or undefined
const toISOStringOptional = (date: Date | null): string | undefined => {
  return date ? date.toISOString() : undefined;
};

async function getPollWithRelations(pollId: string): Promise<Poll | null> {
  const result = await db.query.poll.findFirst({
    where: and(
      eq(schemaDb.poll.id, pollId),
      eq(schemaDb.poll.isDeleted, false)
    ),
    with: {
      pollOptions: {
        where: eq(schemaDb.pollOption.isDeleted, false),
        orderBy: desc(schemaDb.pollOption.createdAt), // Consistent ordering
      },
      pollTagMaps: {
        where: eq(schemaDb.pollTagMap.isDeleted, false),
        with: {
          tag: {
            where: eq(schemaDb.pollTag.isDeleted, false),
          },
        },
      },
    },
  });

  if (!result) return null;

  return {
    id: result.id,
    question: result.question,
    extraInfo: result.extraInfo ?? undefined,
    userId: result.userId,
    createdAt: toISOStringOptional(result.createdAt),
    updatedAt: toISOStringOptional(result.updatedAt),
    pollOptions: (result.pollOptions || []).map(
      (opt: typeof schemaDb.pollOption.$inferSelect) => ({
        id: opt.id,
        optionKey: opt.optionKey,
        text: opt.text,
        confidence: opt.confidence,
        count: opt.count,
        createdAt: toISOStringOptional(opt.createdAt),
        updatedAt: toISOStringOptional(opt.updatedAt),
      })
    ),
    tags: (result.pollTagMaps || [])
      .map(
        (ptm: { tag: typeof schemaDb.pollTag.$inferSelect | null }) => ptm.tag
      )
      .filter(
        (
          tag: typeof schemaDb.pollTag.$inferSelect | null | undefined
        ): tag is typeof schemaDb.pollTag.$inferSelect =>
          tag !== null && tag !== undefined
      )
      .map((t: typeof schemaDb.pollTag.$inferSelect) => ({
        id: t.id,
        name: t.name,
        userId: t.userId,
        createdAt: toISOStringOptional(t.createdAt),
        updatedAt: toISOStringOptional(t.updatedAt),
      })),
  };
}

// Poll的增删改查
export async function createPoll(pollData: Poll): Promise<Poll> {
  return db.transaction(async (tx) => {
    if (!pollData.userId) {
      throw new Error("userId is required to create a poll");
    }
    const [newPollDb] = await tx
      .insert(schemaDb.poll)
      .values({
        question: pollData.question,
        extraInfo: pollData.extraInfo,
        userId: pollData.userId,
      })
      .returning();

    const createdPollOptions: PollOption[] = [];
    if (pollData.pollOptions && pollData.pollOptions.length > 0) {
      for (const opt of pollData.pollOptions) {
        const [newOptionDb] = await tx
          .insert(schemaDb.pollOption)
          .values({
            pollId: newPollDb.id,
            optionKey: opt.optionKey,
            text: opt.text,
            confidence: opt.confidence,
            count: opt.count || 0,
          })
          .returning();
        createdPollOptions.push({
          ...newOptionDb,
          createdAt: toISOStringOptional(newOptionDb.createdAt),
          updatedAt: toISOStringOptional(newOptionDb.updatedAt),
        });
      }
    }

    const createdTags: Tag[] = [];
    if (pollData.tags && pollData.tags.length > 0) {
      for (const tagData of pollData.tags) {
        let tagDb = await tx.query.pollTag.findFirst({
          where: and(
            eq(schemaDb.pollTag.name, tagData.name),
            eq(schemaDb.pollTag.userId, newPollDb.userId)
          ),
        });

        if (tagDb) {
          if (tagDb.isDeleted) {
            [tagDb] = await tx
              .update(schemaDb.pollTag)
              .set({ isDeleted: false, updatedAt: new Date() })
              .where(eq(schemaDb.pollTag.id, tagDb.id))
              .returning();
          }
        } else {
          [tagDb] = await tx
            .insert(schemaDb.pollTag)
            .values({ name: tagData.name, userId: newPollDb.userId })
            .returning();
        }
        if (tagDb) {
          createdTags.push({
            ...tagDb,
            createdAt: toISOStringOptional(tagDb.createdAt),
            updatedAt: toISOStringOptional(tagDb.updatedAt),
          });

          await tx
            .insert(schemaDb.pollTagMap)
            .values({
              pollId: newPollDb.id,
              tagId: tagDb.id,
              userId: newPollDb.userId,
            })
            .onConflictDoUpdate({
              target: [
                schemaDb.pollTagMap.pollId,
                schemaDb.pollTagMap.tagId,
                schemaDb.pollTagMap.userId,
              ],
              set: { isDeleted: false, createdAt: new Date() },
            });
        }
      }
    }

    return {
      id: newPollDb.id,
      question: newPollDb.question,
      extraInfo: newPollDb.extraInfo ?? undefined,
      userId: newPollDb.userId,
      createdAt: toISOStringOptional(newPollDb.createdAt),
      updatedAt: toISOStringOptional(newPollDb.updatedAt),
      pollOptions: createdPollOptions,
      tags: createdTags,
    };
  });
}

export async function getPollById(id: string): Promise<Poll | null> {
  return getPollWithRelations(id);
}

export async function updatePoll(poll: Poll): Promise<Poll | null> {
  return db.transaction(async (tx) => {
    if (!poll.userId) {
      throw new Error("userId is required for update operation verification");
    }
    const currentPoll = await tx.query.poll.findFirst({
      where: and(
        eq(schemaDb.poll.id, poll.id),
        eq(schemaDb.poll.userId, poll.userId),
        eq(schemaDb.poll.isDeleted, false)
      ),
    });

    if (!currentPoll) return null;

    const {
      pollOptions: newPollOptions,
      tags: newTagsData,
      userId,
      ...simplePollUpdateFields
    } = poll;

    if (Object.keys(simplePollUpdateFields).length > 0) {
      await tx
        .update(schemaDb.poll)
        .set({ ...simplePollUpdateFields, updatedAt: new Date() })
        .where(eq(schemaDb.poll.id, poll.id));
    }

    if (newPollOptions) {
      // Soft delete existing options not in the new list (or just all and re-add)
      // For simplicity, soft-delete all and re-add. More sophisticated logic could update existing ones.
      await tx
        .update(schemaDb.pollOption)
        .set({ isDeleted: true })
        .where(eq(schemaDb.pollOption.pollId, id));

      for (const opt of newPollOptions) {
        await tx.insert(schemaDb.pollOption).values({
          pollId: id,
          optionKey: opt.optionKey,
          text: opt.text,
          confidence: opt.confidence,
          count: opt.count || 0,
          isDeleted: false, // Explicitly set to false for new/updated options
        });
      }
    }

    if (newTagsData) {
      await tx
        .update(schemaDb.pollTagMap)
        .set({ isDeleted: true })
        .where(eq(schemaDb.pollTagMap.pollId, id));

      for (const tagData of newTagsData) {
        let tagDb = await tx.query.pollTag.findFirst({
          where: and(
            eq(schemaDb.pollTag.name, tagData.name),
            eq(schemaDb.pollTag.userId, pollUpdate.userId!)
          ),
        });

        if (tagDb) {
          if (tagDb.isDeleted) {
            [tagDb] = await tx
              .update(schemaDb.pollTag)
              .set({ isDeleted: false, updatedAt: new Date() })
              .where(eq(schemaDb.pollTag.id, tagDb.id))
              .returning();
          }
        } else {
          [tagDb] = await tx
            .insert(schemaDb.pollTag)
            .values({ name: tagData.name, userId: pollUpdate.userId! })
            .returning();
        }
        if (tagDb) {
          await tx
            .insert(schemaDb.pollTagMap)
            .values({
              pollId: id,
              tagId: tagDb.id,
              userId: pollUpdate.userId!,
            })
            .onConflictDoUpdate({
              target: [
                schemaDb.pollTagMap.pollId,
                schemaDb.pollTagMap.tagId,
                schemaDb.pollTagMap.userId,
              ],
              set: { isDeleted: false, createdAt: new Date() },
            });
        }
      }
    }
    return getPollWithRelations(id);
  });
}

export async function deletePoll(id: string, userId: string): Promise<boolean> {
  const result = await db
    .update(schemaDb.poll)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(and(eq(schemaDb.poll.id, id), eq(schemaDb.poll.userId, userId)));
  return result.rowCount > 0;
}

export async function listPolls(
  userIdInput?: string,
  limit: number = 10,
  offset: number = 0
): Promise<Poll[]> {
  const conditions: SQL[] = [eq(schemaDb.poll.isDeleted, false)];
  if (userIdInput) {
    conditions.push(eq(schemaDb.poll.userId, userIdInput));
  }

  const pollsData = await db.query.poll.findMany({
    where: and(...conditions),
    limit: limit,
    offset: offset,
    orderBy: [desc(schemaDb.poll.createdAt)],
    with: {
      pollOptions: {
        where: eq(schemaDb.pollOption.isDeleted, false),
        orderBy: desc(schemaDb.pollOption.createdAt),
      },
      pollTagMaps: {
        where: eq(schemaDb.pollTagMap.isDeleted, false),
        with: {
          tag: {
            where: eq(schemaDb.pollTag.isDeleted, false),
          },
        },
      },
    },
  });

  return pollsData.map(
    (
      p: typeof schemaDb.poll.$inferSelect & {
        pollOptions: (typeof schemaDb.pollOption.$inferSelect)[];
        pollTagMaps: (typeof schemaDb.pollTagMap.$inferSelect & {
          tag: typeof schemaDb.pollTag.$inferSelect | null;
        })[];
      }
    ) => ({
      id: p.id,
      question: p.question,
      extraInfo: p.extraInfo ?? undefined,
      userId: p.userId,
      createdAt: toISOStringOptional(p.createdAt),
      updatedAt: toISOStringOptional(p.updatedAt),
      pollOptions: p.pollOptions.map(
        (opt: typeof schemaDb.pollOption.$inferSelect) => ({
          id: opt.id,
          optionKey: opt.optionKey,
          text: opt.text,
          confidence: opt.confidence,
          count: opt.count,
          createdAt: toISOStringOptional(opt.createdAt),
          updatedAt: toISOStringOptional(opt.updatedAt),
        })
      ),
      tags: p.pollTagMaps
        .map((ptm) => ptm.tag)
        .filter(
          (
            tag: typeof schemaDb.pollTag.$inferSelect | null | undefined
          ): tag is typeof schemaDb.pollTag.$inferSelect =>
            tag !== null && tag !== undefined
        )
        .map((t: typeof schemaDb.pollTag.$inferSelect) => ({
          id: t.id,
          name: t.name,
          userId: t.userId,
          createdAt: toISOStringOptional(t.createdAt),
          updatedAt: toISOStringOptional(t.updatedAt),
        })),
    })
  );
}

//为一个poll添加option
export async function addPollOption({
  pollId,
  option,
  userId,
}: {
  pollId: string;
  option: Omit<PollOption, "id" | "createdAt" | "updatedAt" | "count"> & {
    count?: number;
  };
  userId: string;
}): Promise<PollOption> {
  const poll = await db.query.poll.findFirst({
    where: and(
      eq(schemaDb.poll.id, pollId),
      eq(schemaDb.poll.userId, userId),
      eq(schemaDb.poll.isDeleted, false)
    ),
  });
  if (!poll) {
    throw new Error("Poll not found or access denied for adding option");
  }

  const [newOptionDb] = await db
    .insert(schemaDb.pollOption)
    .values({
      pollId: pollId,
      optionKey: option.optionKey,
      text: option.text,
      confidence: option.confidence,
      count: option.count || 0,
    })
    .returning();
  return {
    ...newOptionDb,
    createdAt: toISOStringOptional(newOptionDb.createdAt),
    updatedAt: toISOStringOptional(newOptionDb.updatedAt),
  };
}

//为一个poll删除option
export async function deletePollOption({
  pollId,
  optionId,
  userId,
}: {
  pollId: string;
  optionId: string;
  userId: string;
}): Promise<boolean> {
  const poll = await db.query.poll.findFirst({
    columns: { id: true }, // Only need to check existence and ownership
    where: and(
      eq(schemaDb.poll.id, pollId),
      eq(schemaDb.poll.userId, userId),
      eq(schemaDb.poll.isDeleted, false)
    ),
  });

  if (!poll) {
    throw new Error("Poll not found or access denied for deleting option");
  }

  const result = await db
    .update(schemaDb.pollOption)
    .set({ isDeleted: true })
    .where(
      and(
        eq(schemaDb.pollOption.id, optionId),
        eq(schemaDb.pollOption.pollId, pollId)
      )
    );
  return result.rowCount > 0;
}

// Vote一个poll
export async function voteOption(voteData: Vote): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (!voteData.userId) {
      throw new Error("userId is required to vote");
    }
    // Check if poll and option exist and are not deleted
    const option = await tx.query.pollOption.findFirst({
      where: and(
        eq(schemaDb.pollOption.id, voteData.optionId),
        eq(schemaDb.pollOption.pollId, voteData.pollId),
        eq(schemaDb.pollOption.isDeleted, false)
      ),
      with: {
        poll: {
          where: eq(schemaDb.poll.isDeleted, false),
        },
      },
    });

    if (!option || !option.poll) {
      throw new Error("Poll or option not found, or poll is deleted.");
    }

    // Soft delete previous vote by this user for this poll if exists
    await tx
      .update(schemaDb.pollVote)
      .set({ isDeleted: true })
      .where(
        and(
          eq(schemaDb.pollVote.pollId, voteData.pollId),
          eq(schemaDb.pollVote.userId, voteData.userId!),
          eq(schemaDb.pollVote.isDeleted, false)
        )
      );

    // Decrement count for the previously voted option if any
    // This part is complex as it requires knowing the previous vote's optionId.
    // For simplicity, this example doesn't decrement previous vote count.
    // A more robust solution might store previous vote or handle this differently.

    const [newVoteDb] = await tx
      .insert(schemaDb.pollVote)
      .values({
        pollId: voteData.pollId,
        optionId: voteData.optionId,
        userId: voteData.userId,
      })
      .returning();

    await tx
      .update(schemaDb.pollOption)
      .set({ count: sql`${schemaDb.pollOption.count} + 1` })
      .where(eq(schemaDb.pollOption.id, voteData.optionId));

    return !!newVoteDb;
  });
}

export async function getUserVote(
  pollId: string,
  userId: string
): Promise<Vote | null> {
  const voteDb = await db.query.pollVote.findFirst({
    where: and(
      eq(schemaDb.pollVote.pollId, pollId),
      eq(schemaDb.pollVote.userId, userId),
      eq(schemaDb.pollVote.isDeleted, false)
    ),
  });
  if (!voteDb) return null;
  return {
    ...voteDb,
    diff: 0, // diff is not in db schema, returning default or derive if needed
    createdAt: toISOStringOptional(voteDb.createdAt),
  };
}

// Tag一个poll
export async function tagPoll(
  pollId: string,
  tagName: string,
  userId: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const poll = await tx.query.poll.findFirst({
      columns: { id: true, userId: true },
      where: and(
        eq(schemaDb.poll.id, pollId),
        eq(schemaDb.poll.userId, userId),
        eq(schemaDb.poll.isDeleted, false)
      ),
    });
    if (!poll) throw new Error("Poll not found or access denied for tagging");

    let tagDb = await tx.query.pollTag.findFirst({
      where: and(
        eq(schemaDb.pollTag.name, tagName),
        eq(schemaDb.pollTag.userId, userId)
      ),
    });

    if (tagDb) {
      if (tagDb.isDeleted) {
        [tagDb] = await tx
          .update(schemaDb.pollTag)
          .set({ isDeleted: false, updatedAt: new Date() })
          .where(eq(schemaDb.pollTag.id, tagDb.id))
          .returning();
      }
    } else {
      [tagDb] = await tx
        .insert(schemaDb.pollTag)
        .values({ name: tagName, userId: userId })
        .returning();
    }
    if (!tagDb) {
      throw new Error("Failed to create or find tag");
    }

    const [mapping] = await tx
      .insert(schemaDb.pollTagMap)
      .values({ pollId: pollId, tagId: tagDb.id, userId: userId })
      .onConflictDoUpdate({
        target: [
          schemaDb.pollTagMap.pollId,
          schemaDb.pollTagMap.tagId,
          schemaDb.pollTagMap.userId,
        ],
        set: { isDeleted: false, createdAt: new Date() },
      })
      .returning();
    return !!mapping;
  });
}

export async function untagPoll(
  pollId: string,
  tagId: string,
  userId: string
): Promise<boolean> {
  const poll = await db.query.poll.findFirst({
    columns: { id: true },
    where: and(
      eq(schemaDb.poll.id, pollId),
      eq(schemaDb.poll.userId, userId),
      eq(schemaDb.poll.isDeleted, false)
    ),
  });
  if (!poll) throw new Error("Poll not found or access denied for untagging");

  const result = await db
    .update(schemaDb.pollTagMap)
    .set({ isDeleted: true })
    .where(
      and(
        eq(schemaDb.pollTagMap.pollId, pollId),
        eq(schemaDb.pollTagMap.tagId, tagId),
        eq(schemaDb.pollTagMap.userId, userId)
      )
    );
  return result.rowCount > 0;
}

export async function getPollTags(pollId: string): Promise<Tag[]> {
  const tagMaps = await db.query.pollTagMap.findMany({
    where: and(
      eq(schemaDb.pollTagMap.pollId, pollId),
      eq(schemaDb.pollTagMap.isDeleted, false)
    ),
    with: {
      tag: {
        where: eq(schemaDb.pollTag.isDeleted, false),
      },
    },
  });
  return tagMaps
    .map((tm) => tm.tag)
    .filter(Boolean)
    .map((t: typeof schemaDb.pollTag.$inferSelect) => ({
      id: t.id,
      name: t.name,
      userId: t.userId,
      createdAt: toISOStringOptional(t.createdAt),
      updatedAt: toISOStringOptional(t.updatedAt),
    }));
}

export async function getAllTags(
  userId: string
): Promise<Array<Tag & { count: number }>> {
  const result = await db
    .select({
      id: schemaDb.pollTag.id,
      name: schemaDb.pollTag.name,
      userId: schemaDb.pollTag.userId,
      createdAt: schemaDb.pollTag.createdAt,
      updatedAt: schemaDb.pollTag.updatedAt,
      count: dslCount(schemaDb.pollTagMap.tagId),
    })
    .from(schemaDb.pollTag)
    .leftJoin(
      schemaDb.pollTagMap,
      and(
        eq(schemaDb.pollTag.id, schemaDb.pollTagMap.tagId),
        eq(schemaDb.pollTagMap.isDeleted, false)
      )
    )
    .where(
      and(
        eq(schemaDb.pollTag.userId, userId),
        eq(schemaDb.pollTag.isDeleted, false)
      )
    )
    .groupBy(schemaDb.pollTag.id)
    .orderBy(desc(dslCount(schemaDb.pollTagMap.tagId)), schemaDb.pollTag.name);

  return result.map((r: any) => ({
    id: r.id,
    name: r.name,
    userId: r.userId,
    createdAt: toISOStringOptional(r.createdAt),
    updatedAt: toISOStringOptional(r.updatedAt),
    count: Number(r.count),
  }));
}

// 通过tag搜索poll
export async function searchPollsByTag(
  tagId: string,
  limit: number = 10,
  offset: number = 0
): Promise<Poll[]> {
  const pollTagMapAlias = alias(schemaDb.pollTagMap, "ptm_search_tag");

  const pollsData = await db.query.poll.findMany({
    where: and(
      eq(schemaDb.poll.isDeleted, false),
      sql`EXISTS (SELECT 1 FROM ${pollTagMapAlias} WHERE ${eq(
        pollTagMapAlias.pollId,
        schemaDb.poll.id
      )} AND ${eq(pollTagMapAlias.tagId, tagId)} AND ${eq(
        pollTagMapAlias.isDeleted,
        false
      )})`
    ),
    limit: limit,
    offset: offset,
    orderBy: [desc(schemaDb.poll.createdAt)],
    with: {
      pollOptions: {
        where: eq(schemaDb.pollOption.isDeleted, false),
        orderBy: desc(schemaDb.pollOption.createdAt),
      },
      pollTagMaps: {
        where: eq(schemaDb.pollTagMap.isDeleted, false),
        with: {
          tag: {
            where: eq(schemaDb.pollTag.isDeleted, false),
          },
        },
      },
    },
  });

  return pollsData.map(
    (
      p: typeof schemaDb.poll.$inferSelect & {
        pollOptions: (typeof schemaDb.pollOption.$inferSelect)[];
        pollTagMaps: (typeof schemaDb.pollTagMap.$inferSelect & {
          tag: typeof schemaDb.pollTag.$inferSelect | null;
        })[];
      }
    ) => ({
      id: p.id,
      question: p.question,
      extraInfo: p.extraInfo ?? undefined,
      userId: p.userId,
      createdAt: toISOStringOptional(p.createdAt),
      updatedAt: toISOStringOptional(p.updatedAt),
      pollOptions: p.pollOptions.map(
        (opt: typeof schemaDb.pollOption.$inferSelect) => ({
          id: opt.id,
          optionKey: opt.optionKey,
          text: opt.text,
          confidence: opt.confidence,
          count: opt.count,
          createdAt: toISOStringOptional(opt.createdAt),
          updatedAt: toISOStringOptional(opt.updatedAt),
        })
      ),
      tags: p.pollTagMaps
        .map((ptm) => ptm.tag)
        .filter(
          (
            tag: typeof schemaDb.pollTag.$inferSelect | null | undefined
          ): tag is typeof schemaDb.pollTag.$inferSelect =>
            tag !== null && tag !== undefined
        )
        .map((t: typeof schemaDb.pollTag.$inferSelect) => ({
          id: t.id,
          name: t.name,
          userId: t.userId,
          createdAt: toISOStringOptional(t.createdAt),
          updatedAt: toISOStringOptional(t.updatedAt),
        })),
    })
  );
}

// 通过poll问题或者poll_option搜索poll
export async function searchPolls(
  query: string,
  limit: number = 10,
  offset: number = 0
): Promise<Poll[]> {
  const pollOptionAlias = alias(schemaDb.pollOption, "po_search_text");
  const searchTerm = `%${query}%`;

  const matchingPollIdsQuery = db
    .selectDistinct({ id: schemaDb.poll.id })
    .from(schemaDb.poll)
    .leftJoin(
      pollOptionAlias,
      and(
        eq(schemaDb.poll.id, pollOptionAlias.pollId),
        eq(pollOptionAlias.isDeleted, false)
      )
    )
    .where(
      and(
        eq(schemaDb.poll.isDeleted, false),
        or(
          ilike(schemaDb.poll.question, searchTerm),
          ilike(pollOptionAlias.text, searchTerm)
        )
      )
    )
    .limit(limit)
    .offset(offset)
    .orderBy(desc(schemaDb.poll.createdAt));

  const matchingPollsSub = await matchingPollIdsQuery;
  const pollIds = matchingPollsSub.map((p) => p.id);

  if (pollIds.length === 0) {
    return [];
  }

  const pollsData = await db.query.poll.findMany({
    where: inArray(schemaDb.poll.id, pollIds),
    orderBy: [desc(schemaDb.poll.createdAt)],
    with: {
      pollOptions: {
        where: eq(schemaDb.pollOption.isDeleted, false),
        orderBy: desc(schemaDb.pollOption.createdAt),
      },
      pollTagMaps: {
        where: eq(schemaDb.pollTagMap.isDeleted, false),
        with: {
          tag: {
            where: eq(schemaDb.pollTag.isDeleted, false),
          },
        },
      },
    },
  });

  const pollsDataMap = new Map(pollsData.map((p) => [p.id, p]));
  const orderedPollsData = pollIds
    .map((id) => pollsDataMap.get(id))
    .filter(Boolean) as Array<NonNullable<(typeof pollsData)[number]>>;

  return orderedPollsData.map(
    (
      p: typeof schemaDb.poll.$inferSelect & {
        pollOptions: (typeof schemaDb.pollOption.$inferSelect)[];
        pollTagMaps: (typeof schemaDb.pollTagMap.$inferSelect & {
          tag: typeof schemaDb.pollTag.$inferSelect | null;
        })[];
      }
    ) => ({
      id: p.id,
      question: p.question,
      extraInfo: p.extraInfo ?? undefined,
      userId: p.userId,
      createdAt: toISOStringOptional(p.createdAt),
      updatedAt: toISOStringOptional(p.updatedAt),
      pollOptions: p.pollOptions.map(
        (opt: typeof schemaDb.pollOption.$inferSelect) => ({
          id: opt.id,
          optionKey: opt.optionKey,
          text: opt.text,
          confidence: opt.confidence,
          count: opt.count,
          createdAt: toISOStringOptional(opt.createdAt),
          updatedAt: toISOStringOptional(opt.updatedAt),
        })
      ),
      tags: p.pollTagMaps
        .map((ptm) => ptm.tag)
        .filter(
          (
            tag: typeof schemaDb.pollTag.$inferSelect | null | undefined
          ): tag is typeof schemaDb.pollTag.$inferSelect =>
            tag !== null && tag !== undefined
        )
        .map((t: typeof schemaDb.pollTag.$inferSelect) => ({
          id: t.id,
          name: t.name,
          userId: t.userId,
          createdAt: toISOStringOptional(t.createdAt),
          updatedAt: toISOStringOptional(t.updatedAt),
        })),
    })
  );
}
