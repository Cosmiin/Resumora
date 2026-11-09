import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * KEY=value lines of `.dev.vars` (comments and blanks skipped). Values are never printed.
 * EVAL_DEV_VARS can point at another checkout's file, so a worktree never needs its own copy of the keys.
 */
function readDevVars(): Record<string, string> {
  const file = process.env.EVAL_DEV_VARS || join(import.meta.dirname, ".dev.vars");
  if (!existsSync(file)) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) vars[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
  return vars;
}

// The manual evaluation only: real AI calls, never part of `npm test` or CI.
export default defineConfig({
  test: {
    include: ["eval/**/*.eval.ts"],
    testTimeout: 10 * 60_000,
    hookTimeout: 10 * 60_000,
    env: readDevVars(),
  },
});
