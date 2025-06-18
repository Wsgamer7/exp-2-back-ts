import { createRoute, z } from "@hono/zod-openapi";
import { respErrSchema } from "../schema";

export const pathToOperationId = (path: string) => {
  return path
    .replace(/^\//, "") // 移除开头的斜杠
    .replace(/\/(\w)/g, (_, c) => c.toUpperCase()) // 把/note/create转成noteCreate
    .replace(/[-_](\w)/g, (_, c) => c.toUpperCase()); // 处理可能的横杠和下划线
};

export const geneRoute = <T extends z.ZodObject<any>>({
  path,
  reqSchema,
  resSchema,
}: {
  path: string;
  reqSchema: T;
  resSchema: z.ZodObject<any>;
}) => {
  const operationId = pathToOperationId(path);
  return createRoute({
    method: "post",
    path,
    request: {
      body: {
        content: {
          "application/json": {
            schema: reqSchema.openapi(`${operationId}Req`),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z
              .object({
                err: respErrSchema.optional(),
                ...resSchema.shape,
              })
              .openapi(`${operationId}Res`),
          },
        },
        description: "",
      },
    },
    operationId,
  });
};
