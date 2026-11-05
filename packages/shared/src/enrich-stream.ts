import { z } from "zod";

/** Why a finished proposal was left out. */
export const DropReasonSchema = z.enum(["number", "length", "unknownBullet", "unchanged", "newWithoutNote"]);

/** The events of a streamed rewrite. The API validates each one before sending it, and the web parses the same shapes. */
export const StartEventSchema = z.object({ index: z.number().int().min(0), replaces: z.string().nullable() });
export const DeltaEventSchema = z.object({ index: z.number().int().min(0), text: z.string() });
export const ReadyEventSchema = z.object({ index: z.number().int().min(0), text: z.string() });
export const DroppedEventSchema = z.object({ index: z.number().int().min(0), reason: DropReasonSchema });
export const ErrorEventSchema = z.object({ code: z.string(), message: z.string() });
export const DoneEventSchema = z.object({});

export const RewriteEventSchemas = {
  start: StartEventSchema,
  delta: DeltaEventSchema,
  ready: ReadyEventSchema,
  dropped: DroppedEventSchema,
  error: ErrorEventSchema,
  done: DoneEventSchema,
} as const;

export type DropReason = z.infer<typeof DropReasonSchema>;
export type RewriteEvent = {
  [K in keyof typeof RewriteEventSchemas]: { event: K; data: z.infer<(typeof RewriteEventSchemas)[K]> };
}[keyof typeof RewriteEventSchemas];
