import { z } from "@hono/zod-openapi";

export const pollOptionSchema = z
  .object({
    id: z.string().optional(),
    index: z.number(),
    text: z.string(),
    pollId: z.string(),
    count: z.number(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .openapi("PollOption");

export const tagSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    userId: z.string().optional(),
    createdAt: z.string().optional(),
  })
  .openapi("Tag");

export const pollSchema = z
  .object({
    id: z.string().optional(),
    question: z.string(),
    pollOptions: z.array(pollOptionSchema),
    extraInfo: z.string().optional(),
    tags: z.array(tagSchema),
    userId: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .openapi("Poll");

export const voteSchema = z
  .object({
    id: z.string().optional(),
    pollId: z.string(),
    optionId: z.string(),
    userId: z.string().optional(),
    diff: z.number(),
    createdAt: z.string().optional(),
  })
  .openapi("PollVote");

export const respErrSchema = z
  .object({
    code: z.number(),
    message: z.string(),
  })
  .openapi("RespErr");

export type RespErr = z.infer<typeof respErrSchema>;
export type Poll = z.infer<typeof pollSchema>;
export type PollOption = z.infer<typeof pollOptionSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type Vote = z.infer<typeof voteSchema>;
