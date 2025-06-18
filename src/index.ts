import { OpenAPIHono, z } from "@hono/zod-openapi";
import { geneRoute } from "./utils/openapi";
import { cors } from "hono/cors";
import { auth } from "./utils/auth";
import {
  projectSchema,
  expSchema,
  respErrSchema,
  Project,
  Exp,
} from "./schema";
import {
  createProject,
  getProjectsByUserId,
  updateProject,
  deleteProject,
  createExp,
  getExpsByProjectId,
  updateExp,
  deleteExp,
  getExpById,
  getProjectById,
} from "./service/project";
import llmService from "./service/llm";
import { Context } from "hono";

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

app.openapi(
  geneRoute({
    path: "/project/create",
    reqSchema: z.object({}),
    resSchema: z.object({
      project: projectSchema.optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const project = await createProject({ userId });
    return c.json({ project });
  }
);

app.openapi(
  geneRoute({
    path: "/project/get",
    reqSchema: z.object({}),
    resSchema: z.object({
      projects: z.array(projectSchema).optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const projects = await getProjectsByUserId(userId);
    return c.json({ projects });
  }
);

app.openapi(
  geneRoute({
    path: "/project/getById",
    reqSchema: z.object({
      projectId: z.string(),
    }),
    resSchema: z.object({
      project: projectSchema.optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { projectId } = c.req.valid("json");
    const project = await getProjectById({ userId, projectId });
    return c.json({ project });
  }
);

app.openapi(
  geneRoute({
    path: "/project/update",
    reqSchema: z.object({
      project: projectSchema,
    }),
    resSchema: z.object({
      project: projectSchema.optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { project } = c.req.valid("json");
    const updatedProject = await updateProject({
      userId,
      project,
    });
    return c.json({ project: updatedProject });
  }
);

app.openapi(
  geneRoute({
    path: "/project/delete",
    reqSchema: z.object({
      projectId: z.string().uuid(),
    }),
    resSchema: z.object({
      success: z.boolean().optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { projectId } = c.req.valid("json");
    const success = await deleteProject({ userId, projectId });
    return c.json({ success });
  }
);

app.openapi(
  geneRoute({
    path: "/exp/create",
    reqSchema: z.object({
      projectId: z.string().uuid(),
    }),
    resSchema: z.object({
      exp: expSchema.optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { projectId } = c.req.valid("json");
    const newExp = await createExp({ userId, projectId });
    return c.json({ exp: newExp });
  }
);

app.openapi(
  geneRoute({
    path: "/exp/create",
    reqSchema: z.object({
      projectId: z.string().uuid(),
    }),
    resSchema: z.object({
      exp: expSchema.optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { projectId } = c.req.valid("json");
    const newExp = await createExp({ userId, projectId });
    return c.json({ exp: newExp });
  }
);

app.openapi(
  geneRoute({
    path: "/exp/get",
    reqSchema: z.object({
      projectId: z.string(),
    }),
    resSchema: z.object({
      exps: z.array(expSchema).optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { projectId } = c.req.valid("json");
    const exps = await getExpsByProjectId({ userId, projectId });
    return c.json({ exps });
  }
);

app.openapi(
  geneRoute({
    path: "/exp/update",
    reqSchema: z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      content: z.string().optional(),
    }),
    resSchema: z.object({
      exp: expSchema.optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { id, title, content } = c.req.valid("json");
    const updatedExp = await updateExp({ userId, expId: id, title, content });
    return c.json({ exp: updatedExp });
  }
);

app.openapi(
  geneRoute({
    path: "/exp/update",
    reqSchema: z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      content: z.string().optional(),
    }),
    resSchema: z.object({
      exp: expSchema.optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { id, title, content } = c.req.valid("json");
    const updatedExp = await updateExp({ userId, expId: id, title, content });
    return c.json({ exp: updatedExp });
  }
);

app.openapi(
  geneRoute({
    path: "/exp/delete",
    reqSchema: z.object({
      expId: z.string().uuid(),
    }),
    resSchema: z.object({
      success: z.boolean().optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { expId } = c.req.valid("json");
    const success = await deleteExp({ userId, expId });
    return c.json({ success });
  }
);

app.openapi(
  geneRoute({
    path: "/predict/title",
    reqSchema: z.object({
      projectId: z.string(),
      expId: z.string(),
      expTitle: z.string(),
    }),
    resSchema: z.object({
      title: z.string().optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { projectId, expId, expTitle } = c.req.valid("json");

    // 1. Get Project Title
    const project = await getProjectById({ userId, projectId });
    if (!project) {
      throw { code: 404, message: "Project not found" };
    }
    const projectTitle = project.title;

    // 2. Get existing experiment titles for this project
    const exps = await getExpsByProjectId({ userId, projectId });
    const expTitles = exps
      .filter((exp) => exp.id !== expId)
      .map((exp) => exp.title);

    // 3. Predict new title
    const title = await llmService.predictTitle({ projectTitle, expTitles });
    return c.json({ title });
  }
);

app.openapi(
  geneRoute({
    path: "/predict/content",
    reqSchema: z.object({
      projectId: z.string(),
      title: z.string(),
      content: z.string(),
    }),
    resSchema: z.object({
      extraContent: z.string().optional(),
    }),
  }),
  async (c) => {
    const userId = getUserId(c);
    const { projectId, title, content } = c.req.valid("json");
    const project = await getProjectById({ userId, projectId });
    if (!project) {
      throw { code: 404, message: "Project not found" };
    }
    // Avoid variable shadowing and ensure correct usage of llmService
    const predictedContent = await llmService.predictContent({
      title,
      content,
    });
    return c.json({ extraContent: predictedContent });
  }
);

app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Note API",
  },
});

export default {
  port: 8000,
  fetch: app.fetch,
};
