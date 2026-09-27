import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { privateData } from "./private-data.server";
const schema = z.object({
  token: z.string().min(1).max(4096),
  table: z.string().max(64),
  query: z.string().max(100000),
  method: z.enum(["GET", "HEAD", "POST", "PATCH", "DELETE"]),
  body: z.string().max(8_000_000).optional(),
  headers: z.record(z.string().max(100), z.string().max(1000)),
});
export const requestPrivateData = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(({ data }) => privateData(data));
