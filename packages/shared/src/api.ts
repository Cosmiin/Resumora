import { z } from "zod";
import { CvContentSchema } from "./cv.ts";

export const CvResponseSchema = z.object({
  content: CvContentSchema,
  version: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type CvResponse = z.infer<typeof CvResponseSchema>;

export const SaveResponseSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string(),
});
export type SaveResponse = z.infer<typeof SaveResponseSchema>;

export const HistoryItemSchema = z.object({
  id: z.string(),
  reason: z.enum(["autosave", "restore", "import", "ai"]),
  createdAt: z.string(),
});
export type HistoryItem = z.infer<typeof HistoryItemSchema>;

export const ErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;
