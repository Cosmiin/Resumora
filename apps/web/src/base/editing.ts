import {
  allFacts,
  clone,
  editFact,
  type BaseDraft,
  type FactValue,
  type Fact,
  fact,
  localId,
} from "./model";

export function patchFact<T extends FactValue>(
  draft: BaseDraft,
  field: Fact<T>,
  value: T,
) {
  const next = clone(draft);
  const current = allFacts(next).find((f) => f.fieldId === field.fieldId);
  if (current) {
    replaceFact(next, current, editFact(current as Fact<T>, value));
  }
  return next;
}
export function replaceFact(draft: BaseDraft, current: Fact, updated: Fact) {
  if (current === updated) return;
  for (const answer of draft.answers) {
    if (answer.factId === current.id) {
      answer.factId = updated.id;
      if (typeof updated.value === "string") answer.text = updated.value;
    }
  }
  for (const role of draft.roles)
    if (role.bullets.includes(current as Fact<string>))
      delete draft.presentation.contributionHtml?.[role.id];
  for (const key of Object.keys(current))
    delete (current as unknown as Record<string, unknown>)[key];
  Object.assign(current, updated);
}
export function setContributions(
  draft: BaseDraft,
  roleId: string,
  html: string,
) {
  const next = clone(draft);
  const role = next.roles.find((r) => r.id === roleId)!;
  const lines = richLines(html);
  const removed = role.bullets.slice(lines.length);
  role.bullets = lines.map((value, i) => {
    const current = role.bullets[i];
    if (!current) return fact(value);
    replaceFact(next, current, editFact(current, value));
    return current;
  });
  for (const answer of next.answers)
    if (removed.some((f) => f.id === answer.factId)) delete answer.factId;
  next.presentation.contributionHtml = {
    ...next.presentation.contributionHtml,
    [roleId]: safeRichHtml(html),
  };
  return next;
}
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length)
    return items;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
export function focusField(id: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    let ancestor: HTMLElement | null = el;
    while (ancestor) {
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    const control =
      el instanceof HTMLDetailsElement
        ? el.querySelector<HTMLElement>(
            "input,textarea,select,[contenteditable=true],button",
          )
        : el;
    control?.focus();
    control?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
  });
}
export function dateInput(value: { year: string; month: string }) {
  return value.month
    ? `${value.month.padStart(2, "0")}/${value.year}`
    : value.year;
}
export function parseDateInput(text: string) {
  if (/^\d{6}$/.test(text)) text = text.slice(0, 2) + "/" + text.slice(2);
  const parts = text.split("/");
  return parts.length === 1
    ? { year: text.trim(), month: "" }
    : {
        year: parts.slice(1).join("/").trim(),
        month: parts[0].replace(/^0(?=\d)/, ""),
      };
}
export const languageLevels = [
  "",
  "Native",
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
];
export function safeRichHtml(value: string): string {
  const doc = new DOMParser().parseFromString(value, "text/html");
  const allowed = new Set([
    "B",
    "STRONG",
    "I",
    "EM",
    "UL",
    "OL",
    "LI",
    "P",
    "BR",
    "DIV",
  ]);
  for (const el of Array.from(doc.body.querySelectorAll("*")).reverse()) {
    if (
      ["SCRIPT", "STYLE", "IFRAME", "OBJECT", "IMG", "SVG"].includes(el.tagName)
    )
      el.remove();
    else if (!allowed.has(el.tagName)) el.replaceWith(...el.childNodes);
    else
      for (const attr of Array.from(el.attributes))
        el.removeAttribute(attr.name);
  }
  return doc.body.innerHTML;
}
export function richLines(value: string): string[] {
  const doc = new DOMParser().parseFromString(safeRichHtml(value), "text/html");
  for (const el of Array.from(doc.body.querySelectorAll("li,p,div,br")))
    el.after(doc.createTextNode("\n"));
  return (doc.body.textContent ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function prepareDraft(draft: BaseDraft): BaseDraft {
  const next = clone(draft);
  for (const kind of ["email", "phone", "location", "social"] as const) {
    const found = next.contacts.find((c) =>
      kind === "social"
        ? c.platform === "linkedin" ||
          (c.kind === "social" &&
            /^https?:\/\/(www\.)?linkedin\.com\//i.test(c.value.value))
        : c.kind === kind,
    );
    if (found && kind === "social") found.platform = "linkedin";
    if (!found)
      next.contacts.push({
        id: localId(),
        kind,
        value: fact(""),
        visible: true,
        ...(kind === "social" ? { platform: "linkedin" as const } : {}),
      });
  }
  if (!next.optionalSections.some((s) => s.kind === "languages")) {
    next.optionalSections.push({
      id: "languages",
      kind: "languages",
      label: "",
      entries: [],
    });
    next.presentation.order.push("languages");
  }
  return next;
}
