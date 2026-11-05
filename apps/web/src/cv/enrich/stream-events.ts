import type { DropReason, RewriteEvent } from "@resumora/shared";

export type Proposal = {
  /** Unique across retries: the run, then the stream's index. */
  key: string;
  index: number;
  replaces: string | null;
  text: string;
  state: "streaming" | "ready" | "dropped" | "used" | "kept";
  reason?: DropReason;
};

/** Ready or used: a proposal that a retry keeps, and that a new one for the same bullet would repeat. */
const settled = (p: Proposal) => p.state === "ready" || p.state === "used";

function update(list: Proposal[], key: string, change: (p: Proposal) => Proposal): Proposal[] {
  return list.map((p) => (p.key === key ? change(p) : p));
}

/** How the proposals change with one event of stream `run`. Only streaming proposals take new text. */
export function onEvent(list: Proposal[], run: number, e: RewriteEvent): Proposal[] {
  if (e.event === "error" || e.event === "done") return list;
  const key = `${run}:${e.data.index}`;
  const streaming = (change: (p: Proposal) => Proposal) => update(list, key, (p) => (p.state === "streaming" ? change(p) : p));
  switch (e.event) {
    case "start": {
      const { replaces } = e.data;
      if (list.some((p) => p.key === key)) return list;
      // After a retry, a bullet that already has a ready or used proposal keeps it.
      if (replaces !== null && list.some((p) => p.replaces === replaces && settled(p))) return list;
      return [...list, { key, index: e.data.index, replaces, text: "", state: "streaming" }];
    }
    case "delta":
      return streaming((p) => ({ ...p, text: p.text + e.data.text }));
    case "ready": {
      const { text } = e.data;
      const own = list.find((p) => p.key === key);
      // A new bullet that repeats one already offered is left out.
      const repeat = own?.replaces === null && list.some((p) => p.key !== key && p.replaces === null && settled(p) && p.text === text);
      if (repeat) return list.filter((p) => p.key !== key);
      return streaming((p) => ({ ...p, text, state: "ready" }));
    }
    case "dropped":
      return streaming((p) => ({ ...p, state: "dropped", reason: e.data.reason }));
  }
}

