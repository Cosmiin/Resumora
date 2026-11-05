// Turns a case into an HTML page (printed to PDF by headless Chrome). Layout is the only thing that
// differs between variants; the words come from the case content, so the key and the page match.
import { STYLES } from "./styles.ts";
import { fmtDate, fmtRange, mixedSkills, type Case, type Content, type Role, type Section } from "./types.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const join = (parts: string[], sep = " · ") => parts.filter(Boolean).map(esc).join(sep);

const ICON_SHAPES = [
  '<circle cx="8" cy="8" r="6"/>',
  '<rect x="2" y="2" width="12" height="12" rx="2"/>',
  '<path d="M8 1.5 15 14H1z"/>',
  '<path d="M8 1 10 6l5 .5-3.8 3.3 1.2 5L8 12.3 3.6 14.8l1.2-5L1 6.5 6 6z"/>',
  '<rect x="1" y="5" width="14" height="6" rx="3"/>',
];
function icon(i: number): string {
  return `<svg class="ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">${ICON_SHAPES[i % ICON_SHAPES.length]}</svg>`;
}

function roleHtml(r: Role, locale: "en" | "ro"): string {
  const bullets = r.bullets.length ? `<ul>${r.bullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>` : "";
  return `<div class="item"><h3>${esc(r.title)}</h3><div class="meta">${join([r.company, r.location])}</div>
<div class="dates">${esc(fmtRange(r.startDate, r.endDate, r.current, locale))}</div>
${r.description ? `<p>${esc(r.description)}</p>` : ""}${bullets}</div>`;
}

function bodyHtml(sec: Section, c: Content): string {
  const l = c.locale;
  const item = (title: string, meta: string, extra = "") =>
    `<div class="item"><h3>${esc(title)}</h3>${meta ? `<div class="meta">${meta}</div>` : ""}${extra}</div>`;
  switch (sec.category) {
    case "summary":
      return `<p>${esc(c.basics.summary)}</p>`;
    case "achievements":
      return `<ul>${c.achievements.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>`;
    case "experience":
      return c.experience.map((r) => roleHtml(r, l)).join("");
    case "volunteering":
      return c.volunteering.map((r) => roleHtml(r, l)).join("");
    case "skills":
      return `<ul class="plain">${mixedSkills(c).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
    case "education":
      return c.education
        .map((e) =>
          item(
            join([e.degree, e.field], ", "),
            join([e.school, fmtRange(e.startDate, e.endDate, false, l)]),
            e.notes ? `<p>${esc(e.notes)}</p>` : "",
          ),
        )
        .join("");
    case "languages":
      return `<ul class="plain">${c.languages.map((x) => `<li><b>${esc(x.name)}</b> – ${esc(x.level)}</li>`).join("")}</ul>`;
    case "certifications":
      return c.certifications.map((x) => item(x.name, join([x.issuer, fmtDate(x.date, l)]))).join("");
    case "projects":
      return c.projects
        .map((p) => item(p.name, esc(p.url), p.description ? `<p>${esc(p.description)}</p>` : ""))
        .join("");
    case "awards":
      return c.awards
        .map((a) => item(a.name, join([a.issuer, fmtDate(a.date, l)]), a.description ? `<p>${esc(a.description)}</p>` : ""))
        .join("");
    case "courses":
      return c.courses.map((x) => item(x.name, join([x.provider, fmtDate(x.date, l)]))).join("");
    case "publications":
      return c.publications.map((p) => item(p.title, join([p.publisher, fmtDate(p.date, l), p.url]))).join("");
    case "interests":
      return `<p>${c.interests.map((i) => esc(i.name)).join(", ")}</p>`;
    case "other":
      return `<p>${esc(c.custom.find((x) => x.title === sec.heading)?.details ?? "")}</p>`;
  }
}

function contactHtml(k: Case, withIcons: boolean): string {
  const b = k.content.basics;
  const L = k.labels ?? {};
  const rows: [string, string, string | undefined][] = [
    ["first", b.firstName, L.first],
    ["last", b.lastName, L.last],
    ["email", b.email, L.email],
    ["phone", b.phone, L.phone],
    ["location", b.location, L.location],
    ["website", b.website, undefined],
    ["linkedin", b.linkedin, undefined],
  ];
  const lines = rows
    .filter(([key, value, label]) => value && (label || (key !== "first" && key !== "last")))
    .map(([key, value, label]) => {
      const mark = withIcons ? icon(rows.findIndex((r) => r[0] === key)) : label ? `<span class="lbl">${esc(label)}:</span> ` : "";
      return `<li>${mark}${esc(value)}</li>`;
    });
  return `<ul class="contact">${lines.join("")}</ul>`;
}

function headerHtml(k: Case): string {
  const b = k.content.basics;
  return `<h1>${esc(b.fullName)}</h1><div class="titles">${b.titles.map(esc).join(" | ")}</div>`;
}

const section = (s: Section, k: Case, icons: boolean, i: number) =>
  `<section><h2>${icons ? icon(i) : ""}${esc(s.heading)}</h2>${bodyHtml(s, k.content)}</section>`;

function layoutHtml(k: Case): string {
  const secs = k.sections;
  const inCol = (n: number) => secs.filter((s) => (s.col ?? 0) === n);
  const render = (list: Section[], icons = false) => list.map((s) => section(s, k, icons, secs.indexOf(s))).join("\n");
  const contactTitle = k.contactTitle ? `<h2>${esc(k.contactTitle)}</h2>` : "";
  switch (k.variant) {
    case "one":
      return `<header>${headerHtml(k)}${contactTitle}${contactHtml(k, false)}</header>${render(secs)}`;
    case "icons":
      return `<header>${headerHtml(k)}${contactHtml(k, true)}</header>${render(secs, true)}`;
    case "two":
      return `<header>${headerHtml(k)}${contactHtml(k, false)}</header>
<div class="cols two"><div>${render(inCol(0))}</div><div>${render(inCol(1))}</div></div>`;
    case "three":
      return `<header>${headerHtml(k)}</header><div class="cols three">
<div><section>${contactTitle}${contactHtml(k, false)}</section>${render(inCol(0))}</div>
<div>${render(inCol(1))}</div><div>${render(inCol(2))}</div></div>`;
    case "sidebar":
      return `<div class="side"><aside><section>${contactTitle}${contactHtml(k, false)}</section>${render(inCol(0))}</aside>
<main><header>${headerHtml(k)}</header>${render(inCol(1))}</main></div>`;
    case "tables": {
      const rows = secs
        .map((s) => `<tr><th>${esc(s.heading)}</th><td>${bodyHtml(s, k.content)}</td></tr>`)
        .join("\n");
      return `<table class="layout"><tr><td colspan="2">${headerHtml(k)}</td></tr>
<tr><th>${esc(k.contactTitle ?? "")}</th><td>${contactHtml(k, false)}</td></tr>\n${rows}</table>`;
    }
    case "docx":
      throw new Error("docx cases are built by templates/docx-tables.ts");
  }
}

export function renderHtml(k: Case): string {
  const long = k.pages && k.pages > 1 ? " long" : "";
  return `<!doctype html>
<html lang="${k.content.locale}"><head><meta charset="utf-8"><title>${esc(k.content.basics.fullName)}</title>
<style>${STYLES}${k.variant === "sidebar" ? "@page { margin: 0; }" : ""}</style></head>
<body class="${k.variant}${long}">${layoutHtml(k)}</body></html>
`;
}
