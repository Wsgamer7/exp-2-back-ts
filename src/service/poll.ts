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
  SQL,
  asc,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Helper to convert DB date to ISO string or undefined
const toISOStringOptional = (date: Date | null): string | undefined => {
  return date ? date.toISOString() : undefined;
};

async function getOptionsByPollId(pollId: string): Promise<PollOption[]> {
  const pollOptionsTableData = await db.query.pollOption.findMany({
    where: and(
      eq(schemaDb.pollOption.pollId, pollId),
      eq(schemaDb.pollOption.isDeleted, false)
    ),
    orderBy: [asc(schemaDb.pollOption.index)],
  });
  const pollOptions = pollOptionsTableData.map((opt) => ({
    ...opt,
    pollId: pollId,
    createdAt: toISOStringOptional(opt.createdAt),
    updatedAt: toISOStringOptional(opt.updatedAt),
  }));
  return pollOptions;
}

export async function listPolls(
  userId: string,
  limit: number = 10,
  offset: number = 0
): Promise<Poll[]> {
  const pollsTableRows = await db.query.poll.findMany({
    where: and(
      eq(schemaDb.poll.userId, userId),
      eq(schemaDb.poll.isDeleted, false)
    ),
    limit: limit,
    offset: offset,
    orderBy: [desc(schemaDb.poll.createdAt)],
  });
  const pollsPromise = pollsTableRows.map(async (simplePollRow) => {
    const tags = await getPollTags(simplePollRow.id, userId);
    const pollOptions = await getOptionsByPollId(simplePollRow.id);
    const poll: Poll = {
      ...simplePollRow,
      extraInfo: simplePollRow.extraInfo ?? undefined,
      createdAt: toISOStringOptional(simplePollRow.createdAt),
      updatedAt: toISOStringOptional(simplePollRow.updatedAt),
      pollOptions,
      tags,
    };
    return poll;
  });
  const polls = await Promise.all(pollsPromise);
  return polls;
}

export async function getPollTags(
  pollId: string,
  userId: string
): Promise<Tag[]> {
  // 查询该 poll 下所有未删除的 tag，按 name 去重
  const tagsData = await db
    .select({
      name: schemaDb.pollTag.name,
      createdAt: schemaDb.pollTag.createdAt,
      userId: schemaDb.pollTag.userId,
    })
    .from(schemaDb.pollTag)
    .where(
      and(
        eq(schemaDb.pollTag.pollId, pollId),
        eq(schemaDb.pollTag.isDeleted, false),
        eq(schemaDb.pollTag.userId, userId)
      )
    )
    .orderBy(desc(schemaDb.pollTag.createdAt));

  // 转换为 Tag[]
  const tags: Tag[] = tagsData.map((tag) => {
    return {
      name: tag.name,
      createdAt: toISOStringOptional(tag.createdAt),
      userId: tag.userId || undefined,
    };
  });
  return tags;
}

export async function getAllTags(userId: string): Promise<Tag[]> {
  const tagsData = await db
    .select({
      name: schemaDb.pollTag.name,
      createdAt: sql`MAX(${schemaDb.pollTag.createdAt})`.as("createdAt"),
    })
    .from(schemaDb.pollTag)
    .where(
      and(
        eq(schemaDb.pollTag.isDeleted, false),
        eq(schemaDb.pollTag.userId, userId)
      )
    )
    .groupBy(schemaDb.pollTag.name);

  // 转换为 Tag[]
  const tags: Tag[] = tagsData.map((tag) => ({
    name: tag.name,
    createdAt: toISOStringOptional(new Date(tag.createdAt as string)),
    userId,
  }));
  return tags;
}

export async function createPoll(poll: Poll, userId: string): Promise<Poll> {
  const pollData = await db
    .insert(schemaDb.poll)
    .values({
      question: poll.question,
      userId: userId,
      extraInfo: poll.extraInfo,
    })
    .returning();
  // insert poll options by pollId
  const pollId = pollData[0].id!;
  const pollOptionsPromises = poll.pollOptions.map(async (opt) => {
    const pollOptionData = await db
      .insert(schemaDb.pollOption)
      .values({
        pollId: pollId,
        index: opt.index,
        text: opt.text,
        count: opt.count,
      })
      .returning();
    return pollOptionData[0];
  });

  // insert poll tags by pollId
  const pollTagsPromises = poll.tags.map(async (tag) => {
    const pollTagData = await db
      .insert(schemaDb.pollTag)
      .values({
        pollId: pollId,
        name: tag.name,
        userId: userId,
      })
      .returning();
    return pollTagData[0];
  });
  const pollOptions = await Promise.all(pollOptionsPromises);
  const pollTags = await Promise.all(pollTagsPromises);
  const newPoll: Poll = {
    id: pollData[0].id,
    question: pollData[0].question,
    extraInfo: pollData[0].extraInfo ?? undefined,
    userId: pollData[0].userId,
    createdAt: toISOStringOptional(pollData[0].createdAt),
    updatedAt: toISOStringOptional(pollData[0].updatedAt),
    pollOptions: pollOptions.map((opt) => ({
      ...opt,
      pollId: pollId,
      createdAt: toISOStringOptional(opt.createdAt),
      updatedAt: toISOStringOptional(opt.updatedAt),
    })),
    tags: pollTags.map((tag) => ({
      ...tag,
      createdAt: toISOStringOptional(tag.createdAt),
      updatedAt: toISOStringOptional(tag.updatedAt),
    })),
  };
  return newPoll;
}

export async function updatePoll(poll: Poll, userId: string) {
  // update poll
  await db
    .update(schemaDb.poll)
    .set({
      question: poll.question,
      extraInfo: poll.extraInfo,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schemaDb.poll.id, poll.id!),
        eq(schemaDb.poll.isDeleted, false),
        eq(schemaDb.poll.userId, userId)
      )
    );

  //update poll options
  poll.pollOptions.forEach(async (opt) => {
    await db
      .update(schemaDb.pollOption)
      .set({
        index: opt.index,
        text: opt.text,
        count: opt.count,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schemaDb.pollOption.id, opt.id!),
          eq(schemaDb.pollOption.isDeleted, false)
        )
      );
  });

  //update poll tags
  //find all tag name in this poll
  const pollTags = await db.query.pollTag.findMany({
    where: and(
      eq(schemaDb.pollTag.pollId, poll.id!),
      eq(schemaDb.pollTag.isDeleted, false)
    ),
  });

  //get should insert tag names
  const shouldInsertTagNames = poll.tags
    .filter((tag) => !pollTags.some((t) => t.name === tag.name))
    .map((tag) => tag.name);
  //insert should delete tag names
  const shouldDeleteTagNames = pollTags
    .filter((tag) => !poll.tags.some((t) => t.name === tag.name))
    .map((tag) => tag.name);

  //insert should insert tag names
  const insertTagPromises = shouldInsertTagNames.map(async (name) => {
    await db.insert(schemaDb.pollTag).values({
      pollId: poll.id!,
      name: name,
      userId: userId,
    });
  });
  //delete should delete tag names
  const deleteTagPromises = shouldDeleteTagNames.map(async (name) => {
    await db
      .update(schemaDb.pollTag)
      .set({
        isDeleted: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schemaDb.pollTag.name, name),
          eq(schemaDb.pollTag.pollId, poll.id!)
        )
      );
  });
  await Promise.all(insertTagPromises);
  await Promise.all(deleteTagPromises);
}

export async function deletePoll(pollId: string, userId: string) {
  // delete poll
  const pollsPromise = db
    .update(schemaDb.poll)
    .set({
      isDeleted: true,
      updatedAt: new Date(),
    })
    .where(and(eq(schemaDb.poll.id, pollId), eq(schemaDb.poll.userId, userId)));

  // delete poll options
  const pollOptionsPromise = db
    .update(schemaDb.pollOption)
    .set({
      isDeleted: true,
      updatedAt: new Date(),
    })
    .where(eq(schemaDb.pollOption.pollId, pollId));

  // delete poll tags
  const pollTagsPromise = db
    .update(schemaDb.pollTag)
    .set({
      isDeleted: true,
      updatedAt: new Date(),
    })
    .where(eq(schemaDb.pollTag.pollId, pollId));

  await Promise.all([pollsPromise, pollOptionsPromise, pollTagsPromise]);
}

export async function voteOption(vote: Vote) {
  // insert poll vote
  await db.insert(schemaDb.pollVote).values({
    pollId: vote.pollId,
    optionId: vote.optionId,
    userId: vote.userId!,
    diff: vote.diff,
  });
  // update poll option count
  await db
    .update(schemaDb.pollOption)
    .set({
      count: sql`GREATEST(count + ${vote.diff}, 0)`,
    })
    .where(eq(schemaDb.pollOption.id, vote.optionId));
}

export async function searchPollsByTagNames(
  userId: string,
  tagNames: string[],
  limit: number = 20
): Promise<Poll[]> {
  //find tag that user created and tag name in tagNames
  const tagsData = await db.query.pollTag.findMany({
    where: and(
      eq(schemaDb.pollTag.userId, userId),
      inArray(schemaDb.pollTag.name, tagNames),
      eq(schemaDb.pollTag.isDeleted, false)
    ),
  });
  const pollsPromise = tagsData.map(async (tag) => {
    const pollId = tag.pollId!;
    const tags = await getPollTags(pollId, userId);
    const pollOptions = await getOptionsByPollId(pollId);
    const pollData = await db.query.poll.findFirst({
      where: eq(schemaDb.poll.id, pollId),
    });
    const poll: Poll = {
      id: pollId,
      question: pollData?.question ?? "",
      extraInfo: pollData?.extraInfo ?? undefined,
      userId: tag.userId,
      createdAt: toISOStringOptional(pollData?.createdAt ?? null),
      updatedAt: toISOStringOptional(pollData?.updatedAt ?? null),
      pollOptions,
      tags,
    };
    return poll;
  });
  const polls = await Promise.all(pollsPromise);
  return polls;
}
