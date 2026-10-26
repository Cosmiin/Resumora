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
  for (const role of draft.roles)
    if (
      role.bullets.includes(current as Fact<string>) &&
      typeof updated.value === "string"
    )
      updateContributionHtml(draft, role.id, current.fieldId, updated.value);
  for (const key of Object.keys(current))
    delete (current as unknown as Record<string, unknown>)[key];
  Object.assign(current, updated);
}
export function updateContributionHtml(
  draft: BaseDraft,
  roleId: string,
  fieldId: string,
  value?: string,
) {
  const html = draft.presentation.contributionHtml?.[roleId];
  if (html === undefined) return;
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = html;
  const blocks = Array.from(
    doc.body.querySelectorAll<HTMLElement>("[data-contribution]"),
  ).filter((el) => el.dataset.contribution === fieldId);
  function clearOwned(parent: Element) {
    for (const node of Array.from(parent.childNodes)) {
      if (
        node instanceof HTMLElement &&
        node.dataset.contribution &&
        node.dataset.contribution !== fieldId
      )
        continue;
      if (node instanceof Element && node.querySelector("[data-contribution]"))
        clearOwned(node);
      else node.remove();
    }
  }
  for (const block of blocks) {
    if (!doc.body.contains(block)) continue;
    clearOwned(block);
    block.removeAttribute("data-contribution");
    if (
      !block.childNodes.length &&
      (block !== blocks[0] || value === undefined)
    )
      block.remove();
  }
  if (value !== undefined) {
    const block = blocks[0] ?? doc.createElement("p");
    block.dataset.contribution = fieldId;
    const content = doc.createDocumentFragment();
    value.split("\n").forEach((line, index) => {
      if (index) content.append(doc.createElement("br"));
      content.append(doc.createTextNode(line));
    });
    block.prepend(content);
    if (!doc.body.contains(block)) doc.body.append(block);
  }
  for (const list of Array.from(doc.body.querySelectorAll("ul,ol")).reverse())
    if (!list.children.length && !list.textContent?.trim()) list.remove();
  draft.presentation.contributionHtml![roleId] = safeRichHtml(
    doc.body.innerHTML,
    draft.roles.find((r) => r.id === roleId)!.bullets.map((f) => f.fieldId),
  );
}
export type ContributionEdit = {
  html: string;
  fields: { fieldId: string; value: string }[];
};
export function readContributions(root: HTMLElement): ContributionEdit {
  function bind(parent: HTMLElement) {
    for (const node of Array.from(parent.childNodes)) {
      if (node instanceof HTMLElement && node.dataset.contribution) continue;
      if (
        node instanceof HTMLElement &&
        (node.matches("ul,ol") || node.querySelector("[data-contribution]"))
      )
        bind(node);
      else if (node instanceof HTMLElement || node.textContent?.trim()) {
        const block =
          node instanceof HTMLElement && node.matches("div,p,li")
            ? node
            : document.createElement("div");
        if (block !== node) {
          parent.insertBefore(block, node);
          block.append(node);
        }
        block.dataset.contribution = localId();
      }
    }
  }
  bind(root);
  const fields = new Map<string, string>();
  for (const block of root.querySelectorAll<HTMLElement>(
    "[data-contribution]",
  )) {
    const content = block.cloneNode(true) as HTMLElement;
    for (const nested of content.querySelectorAll("[data-contribution]"))
      nested.replaceWith(document.createElement("br"));
    const id = block.dataset.contribution!;
    const value = richText(content.innerHTML);
    fields.set(id, fields.has(id) ? fields.get(id) + "\n" + value : value);
  }
  return {
    html: safeRichHtml(root.innerHTML, [...fields.keys()]),
    fields: [...fields].map(([fieldId, value]) => ({ fieldId, value })),
  };
}
export function setContributions(
  draft: BaseDraft,
  roleId: string,
  edit: ContributionEdit,
) {
  const next = clone(draft);
  const role = next.roles.find((r) => r.id === roleId)!;
  const previous = role.bullets;
  role.bullets = edit.fields.map(({ fieldId, value }) => {
    const current = previous.find((f) => f.fieldId === fieldId);
    if (!current) return { ...fact(value), fieldId };
    replaceFact(next, current, editFact(current, value));
    return current;
  });
  for (const answer of next.answers)
    if (
      answer.targetId === roleId &&
      answer.cvFieldId &&
      !role.bullets.some((f) => f.fieldId === answer.cvFieldId)
    )
      delete answer.cvFieldId;
  next.presentation.contributionHtml = {
    ...next.presentation.contributionHtml,
    [roleId]: safeRichHtml(
      edit.html,
      role.bullets.map((f) => f.fieldId),
    ),
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
export function focusFirstField(id: string) {
  requestAnimationFrame(() => {
    const container = document.getElementById(id);
    const fields = Array.from(
      container?.querySelectorAll<HTMLElement>(
        "input:not([type=checkbox]),textarea,select,[contenteditable=true],[contenteditable=plaintext-only]",
      ) ?? [],
    );
    const first =
      fields.find(
        (el) =>
          !("value" in el ? String(el.value) : (el.textContent ?? "")).trim(),
      ) ?? fields[0];
    if (first?.id) focusField(first.id);
    else container?.querySelector<HTMLElement>("button.btn")?.focus();
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
export function safeRichHtml(
  value: string,
  contributionIds: readonly string[] = [],
): string {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = value;
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
        if (
          attr.name !== "data-contribution" ||
          !contributionIds.includes(attr.value)
        )
          el.removeAttribute(attr.name);
  }
  return doc.body.innerHTML;
}
export function richText(value: string): string {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = safeRichHtml(value);
  function read(parent: ParentNode): string {
    let text = "";
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
      else if (node instanceof Element) {
        if (node.tagName === "BR") text += "\n";
        else {
          const block = ["LI", "P", "DIV", "UL", "OL"].includes(node.tagName);
          if (block && text && !text.endsWith("\n")) text += "\n";
          text += read(node);
          if (block && node.nextSibling && !text.endsWith("\n")) text += "\n";
        }
      }
    }
    return text;
  }
  return read(doc.body);
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
