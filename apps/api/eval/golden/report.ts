// Turns one or two saved runs into the report the owner reads: per case and role, the questions and rewrites
// of the earlier prompts beside the reworked ones, with every bad-pattern hit listed.
import type { GoldenCase } from "./cases.ts";
import type { Asked, CaseOutput, RoleOutput } from "./run.ts";

export type SavedRun = { label: string; when: string; commit: string; cases: CaseOutput[] };

const total = (run: SavedRun | null) => run ? run.cases.reduce((sum, c) => sum + c.roles.reduce((n, r) => n + r.hits.length, 0), 0) : null;

function questionLines(questions: Asked[]): string[] {
  if (questions.length === 0) return ["- (none)"];
  return questions.map((q) => `- ${q.text}${q.options.length ? `  \n  Options: ${q.options.join(" / ")}` : ""}`);
}

function roleBlock(label: string, role: RoleOutput | undefined): string[] {
  if (!role) return [`**${label}:** not run`, ""];
  return [
    `**${label}**`,
    "",
    "Base CV questions:",
    ...questionLines(role.enrichQuestions),
    "",
    "Tailoring questions:",
    ...questionLines(role.tailorQuestions),
    "",
    "Tailoring rewrites:",
    ...(role.rewrites.length ? role.rewrites.map((r) => `- ${r.before}  \n  → ${r.after}${r.inferred ? " *(inferred, to confirm)*" : ""}`) : ["- (none)"]),
    "",
    role.hits.length ? `Bad patterns found (${role.hits.length}):` : "Bad patterns found: none",
    ...role.hits.map((hit) => `- ⚠ ${hit}`),
    "",
  ];
}

export function report(cases: GoldenCase[], before: SavedRun | null, after: SavedRun | null): string {
  const lines = [
    "# Golden examples: prompts before and after the rework",
    "",
    "Four fixed cases from two fictional weak CVs and two job ads. For every role you see what the person is asked",
    "(for the base CV and when tailoring) and what tailoring proposes, with the earlier prompts and with the reworked ones.",
    "No answers are given during a run, so rewrites show what the AI does from the CV and the ad alone.",
    "",
    "| | Earlier prompts | Reworked prompts |",
    "|---|---|---|",
    `| Run | ${before ? `${before.when.slice(0, 16).replace("T", " ")} at \`${before.commit}\`` : "not run"} | ${after ? `${after.when.slice(0, 16).replace("T", " ")} at \`${after.commit}\`` : "not run"} |`,
    `| Bad patterns found | ${total(before) ?? "—"} | ${total(after) ?? "—"} |`,
    "",
    "The patterns looked for: another employer named in a role's question, talk of \"your previous roles\", a role asked about",
    "tools that came after it ended, an \"other\" answer option, the \"We think you know…\" wording, a question not in the",
    "interface language, a rewrite not in the tailoring language, a past role rewritten in the present tense, and one job",
    "theme asked of every role. The check is a word search: it can miss a pattern and it can flag a harmless sentence, so",
    "the questions themselves are below for you to read.",
    "",
  ];
  for (const golden of cases) {
    const a = before?.cases.find((c) => c.id === golden.id);
    const b = after?.cases.find((c) => c.id === golden.id);
    lines.push(`## ${golden.what}`, "", `Questions should be in ${golden.interfaceLanguage === "ro" ? "Romanian" : "English"}; tailored CV text in ${golden.tailoringLanguage === "ro" ? "Romanian" : "English"}.`, "");
    lines.push("What good looks like here:", ...golden.goodQuestions.map((q) => `- ${q}`), "");
    for (const problem of [...(a?.problems ?? []).map((p) => `earlier: ${p}`), ...(b?.problems ?? []).map((p) => `reworked: ${p}`)]) lines.push(`- ⚠ ${problem}`);
    if ((a?.problems.length ?? 0) + (b?.problems.length ?? 0)) lines.push("");
    for (const role of golden.cv.experience) {
      lines.push(`### ${role.title}, ${role.company} (${role.startDate} – ${role.current ? "present" : role.endDate})`, "");
      lines.push(...roleBlock("Earlier prompts", a?.roles.find((r) => r.roleId === role.id)));
      lines.push(...roleBlock("Reworked prompts", b?.roles.find((r) => r.roleId === role.id)));
    }
  }
  return lines.join("\n") + "\n";
}
