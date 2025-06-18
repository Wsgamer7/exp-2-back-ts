import { z } from "@hono/zod-openapi";

export const projectSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .openapi("Project");

export const expSchema = z
  .object({
    id: z.string(),
    projectId: z.string().uuid("Invalid project ID format"), // Added projectId
    title: z.string(),
    content: z.string(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .openapi("Exp");

export const respErrSchema = z
  .object({
    code: z.number(),
    message: z.string(),
  })
  .openapi("RespErr");

export type Project = z.infer<typeof projectSchema>;
export type Exp = z.infer<typeof expSchema>;
export type RespErr = z.infer<typeof respErrSchema>;
