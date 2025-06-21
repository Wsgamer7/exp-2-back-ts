import { OpenAPIHono, z } from "@hono/zod-openapi";
import { geneRoute } from "./utils/openapi";
import { cors } from "hono/cors";
import { auth } from "./utils/auth";
import { Context } from "hono";

// Import poll service functions
import {
  listPolls,
  getAllTags,
  createPoll,
  updatePoll,
  deletePoll,
  voteOption,
  searchPollsByTagNames,
} from "./service/poll";
import { pollSchema, tagSchema, voteSchema } from "./schema";

// Import schemas

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

app.openapi(
  geneRoute({
    path: "/login/check",
    reqSchema: z.object({}),
    resSchema: z.object({
      hasLogin: z.boolean(),
    }),
  }),
  async (c) => {
    const userId = c.var.user?.id;
    if (!userId) {
      return c.json({ hasLogin: false });
    }
    return c.json({ hasLogin: true });
  }
);

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
      poll: pollSchema,
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { poll } = c.req.valid("json");
    // Ensure userId is set in the poll
    poll.userId = userId;
    const createdPoll = await createPoll(poll, userId);
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
    resSchema: z.object({}),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { poll } = c.req.valid("json");
    // Ensure userId is set in the poll
    poll.userId = userId;
    await updatePoll(poll, userId);
    return c.json({});
  }
);

// Delete a poll
app.openapi(
  geneRoute({
    path: "/poll/delete",
    reqSchema: z.object({
      pollId: z.string(),
    }),
    resSchema: z.object({}),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { pollId } = c.req.valid("json");
    await deletePoll(pollId, userId);
    return c.json({});
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

// Vote on a poll
app.openapi(
  geneRoute({
    path: "/poll/voteOption",
    reqSchema: z.object({
      vote: voteSchema,
    }),
    resSchema: z.object({}),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { vote } = c.req.valid("json");
    // Ensure userId is set in the vote
    vote.userId = userId;
    await voteOption(vote);
    return c.json({});
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
      tagNames: z.array(z.string()),
    }),
    resSchema: z.object({
      polls: z.array(pollSchema),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { tagNames } = c.req.valid("json");
    const polls = await searchPollsByTagNames(userId, tagNames);
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
