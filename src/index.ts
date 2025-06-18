import { OpenAPIHono, z } from "@hono/zod-openapi";
import { geneRoute } from "./utils/openapi";
import { cors } from "hono/cors";
import { auth } from "./utils/auth";
import { Context } from "hono";

// Import poll service functions
import {
  createPoll,
  updatePoll,
  deletePoll,
  listPolls,
  votePoll,
  tagPoll,
  untagPoll,
  getPollTags,
  getAllTags,
  searchPollsByTag,
  searchPolls,
  addPollOption,
  deletePollOption,
} from "./service/poll";

// Import schemas
import { pollSchema, voteSchema, tagSchema, pollOptionSchema } from "./schema";

const app = new OpenAPIHono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL!;
app.use(
  "*",
  cors({
    origin: [BETTER_AUTH_URL],
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["POST", "GET", "OPTIONS", "PUT", "DELETE"],
    exposeHeaders: ["Content-Length", "Set-Cookie"],
    maxAge: 600,
    credentials: true,
  }),
  async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session?.user ?? null);
    c.set("session", session?.session ?? null);
    await next();
  }
);

app.use("*", async (c, next) => {
  try {
    return await next();
  } catch (e: any) {
    return c.json({
      err: {
        code: e?.code,
        message: e?.message || "Unknown error",
      },
    });
  }
});

// Auth endpoints handler
app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

const getUserId = (c: Context): string => {
  const userId = c.var?.user?.id;
  if (!userId) {
    throw { code: 401, message: "Unauthorized" };
  }
  return userId;
};

// Poll API Routes

// Create a poll
app.openapi(
  geneRoute({
    path: "/poll/create",
    reqSchema: z.object({
      poll: pollSchema,
    }),
    resSchema: z.object({
      poll: pollSchema.optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { poll } = c.req.valid("json");
    // Ensure userId is set in the poll
    poll.userId = userId;
    const createdPoll = await createPoll(poll);
    return c.json({ poll: createdPoll });
  }
);

// Update a poll
app.openapi(
  geneRoute({
    path: "/poll/update",
    reqSchema: z.object({
      poll: pollSchema,
    }),
    resSchema: z.object({
      poll: pollSchema.optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { poll } = c.req.valid("json");
    // Ensure userId is set in the poll
    poll.userId = userId;
    const updatedPoll = await updatePoll(poll);
    return c.json({ poll: updatedPoll });
  }
);

// Delete a poll
app.openapi(
  geneRoute({
    path: "/poll/delete",
    reqSchema: z.object({
      pollId: z.string(),
    }),
    resSchema: z.object({
      success: z.boolean().optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { pollId } = c.req.valid("json");
    const success = await deletePoll(pollId, userId);
    return c.json({ success });
  }
);

// List polls
app.openapi(
  geneRoute({
    path: "/poll/list",
    reqSchema: z.object({
      limit: z.number().optional(),
      offset: z.number().optional(),
    }),
    resSchema: z.object({
      polls: z.array(pollSchema).optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { limit, offset } = c.req.valid("json");
    const polls = await listPolls(userId, limit, offset);
    return c.json({ polls });
  }
);

//add option for a poll
app.openapi(
  geneRoute({
    path: "/poll/addOption",
    reqSchema: z.object({
      pollId: z.string(),
      option: pollOptionSchema,
    }),
    resSchema: z.object({}),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { pollId, option } = c.req.valid("json");
    await addPollOption({ pollId, option, userId });
    return c.json({});
  }
);

//delete option for a poll
app.openapi(
  geneRoute({
    path: "/poll/deleteOption",
    reqSchema: z.object({
      pollId: z.string(),
      optionId: z.string(),
    }),
    resSchema: z.object({
      success: z.boolean().optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { pollId, optionId } = c.req.valid("json");
    await deletePollOption({ pollId, optionId, userId });
    return c.json({});
  }
);

// Vote on a poll
app.openapi(
  geneRoute({
    path: "/poll/vote",
    reqSchema: z.object({
      vote: voteSchema,
    }),
    resSchema: z.object({
      success: z.boolean().optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { vote } = c.req.valid("json");
    // Ensure userId is set in the vote
    vote.userId = userId;
    const success = await votePoll(vote);
    return c.json({ success });
  }
);

// Tag a poll
app.openapi(
  geneRoute({
    path: "/poll/tag",
    reqSchema: z.object({
      pollId: z.string(),
      tag: tagSchema,
    }),
    resSchema: z.object({}),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { tag, pollId } = c.req.valid("json");
    // Ensure userId is set in the tag, if schema expects it or tag object is reused
    tag.userId = userId;
    await tagPoll(pollId, tag.name, userId);
    return c.json({});
  }
);

// Untag a poll
app.openapi(
  geneRoute({
    path: "/poll/untag",
    reqSchema: z.object({
      pollId: z.string(),
      tag: tagSchema,
    }),
    resSchema: z.object({
      success: z.boolean().optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { tag, pollId } = c.req.valid("json");
    tag.userId = userId; // Ensure userId is set in the tag, if schema expects it or tag object is reused
    if (!tag.id || typeof tag.id !== "string" || tag.id.trim() === "") {
      // TODO: Consider using HonoHttpException for a more standard error response.
      // For now, return 200 with success:false to match the defined resSchema type.
      return c.json({ success: false });
    }
    const success = await untagPoll(pollId, tag.id, userId);
    return c.json({ success });
  }
);

// Get poll tags
app.openapi(
  geneRoute({
    path: "/poll/getTags",
    reqSchema: z.object({
      pollId: z.string(),
    }),
    resSchema: z.object({
      tags: z.array(tagSchema).optional(),
    }),
  }),
  async (c) => {
    const { pollId } = c.req.valid("json");
    const tags = await getPollTags(pollId);
    return c.json({ tags });
  }
);

// Get all tags
app.openapi(
  geneRoute({
    path: "/getAllTags",
    reqSchema: z.object({}),
    resSchema: z.object({
      tags: z.array(tagSchema).optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const tags = await getAllTags(userId);
    return c.json({ tags });
  }
);

// Search polls by tag
app.openapi(
  geneRoute({
    path: "/poll/searchByTag",
    reqSchema: z.object({
      tagId: z.string(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }),
    resSchema: z.object({
      polls: z.array(pollSchema),
    }),
  }),
  async (c) => {
    const { tagId, limit, offset } = c.req.valid("json");
    const polls = await searchPollsByTag(tagId, limit, offset);
    return c.json({ polls });
  }
);

// Search polls by question or option text
app.openapi(
  geneRoute({
    path: "/poll/search",
    reqSchema: z.object({
      query: z.string(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }),
    resSchema: z.object({
      polls: z.array(pollSchema),
    }),
  }),
  async (c) => {
    const { query, limit, offset } = c.req.valid("json");
    const polls = await searchPolls(query, limit, offset);
    return c.json({ polls });
  }
);

app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Poll API",
  },
});

export default {
  port: 8000,
  fetch: app.fetch,
};
