import {
  sseData,
  proposalTextPreview,
} from "@resumora/contracts/intelligence/stream";
import { object } from "./accounting.ts";

/** Assemble the same response shape as nonstreaming chat; validation/accounting remain downstream. */
export async function readChatStream(
  response: Response,
  limit: number,
  signal?: AbortSignal,
  onText?: (text: string) => void,
) {
  let content = "",
    lastPreview = "",
    finish: unknown = null,
    done = false;
  let id: unknown,
    model: unknown,
    provider: unknown,
    usage: unknown,
    refusal: unknown;
  for await (const event of sseData(response, limit, signal)) {
    if (event === "[DONE]") {
      done = true;
      break;
    }
    const value = object(JSON.parse(event));
    if (value.error != null) throw Error("STREAM_PROVIDER_ERROR");
    if (value.id != null) {
      if (id && value.id !== id) throw Error("STREAM_ID");
      id = value.id;
    }
    if (value.model != null) model = value.model;
    if (value.provider != null) provider = value.provider;
    if (value.usage != null) usage = value.usage;
    if (!Array.isArray(value.choices) || value.choices.length > 1)
      throw Error("STREAM_CHOICES");
    const choice = object(value.choices[0]);
    const delta = object(choice.delta);
    if (delta.refusal != null) refusal = delta.refusal;
    if (typeof delta.content === "string") {
      if (finish && delta.content) throw Error("STREAM_AFTER_FINISH");
      content += delta.content;
      const preview = proposalTextPreview(content);
      if (preview !== lastPreview) {
        lastPreview = preview;
        try {
          onText?.(preview);
        } catch {
          /* Observer cannot change paid work. */
        }
      }
    }
    if (choice.finish_reason != null) {
      if (finish && finish !== choice.finish_reason)
        throw Error("STREAM_FINISH");
      finish = choice.finish_reason;
    }
  }
  if (!done || finish !== "stop" || !id) throw Error("STREAM_INCOMPLETE");
  return {
    id,
    model,
    provider,
    usage,
    choices: [
      {
        finish_reason: finish,
        message: { content, ...(refusal != null ? { refusal } : {}) },
      },
    ],
  };
}
