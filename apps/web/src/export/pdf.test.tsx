// @vitest-environment node
import { createRequire } from "node:module";
import { Font } from "@react-pdf/renderer";
import { CvContentSchema, emptyCv, ExperienceSchema, type CvContent } from "@resumora/shared";
import { extractText, getDocumentProxy } from "unpdf";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fitSteps } from "./fit.ts";
import { buildCvPdf, buildLetterPdf, fitCvPdf } from "./pdf.tsx";

const require = createRequire(import.meta.url);

beforeAll(() => {
  // Vite asset URLs are for browsers. Keep registration real, but use local files in Node.
  const register = Font.register.bind(Font);
  const localPath = (url: string) => {
    const file = url.split("/").at(-1)!;
    const family = file.split("-latin")[0];
    return require.resolve(`@fontsource/${family}/files/${file}`);
  };
  vi.spyOn(Font, "register").mockImplementation((data) => {
    register("fonts" in data
      ? { ...data, fonts: data.fonts.map((font) => ({ ...font, src: localPath(font.src) })) }
      : { ...data, src: localPath(data.src) });
  });
});

afterAll(() => vi.restoreAllMocks());

function fixture(): CvContent {
  const content = emptyCv();
  content.basics = {
    ...content.basics, fullName: "Ștefan Ionescu", titles: ["Software Engineer", "Team Lead"],
    email: "stefan@example.com", phone: "+40 123 456", location: "București",
    website: "https://stefan.example.com", linkedin: "linkedin.com/in/stefan",
    summary: "Experienced engineer building useful products.",
  };
  content.experience = [
    ExperienceSchema.parse({
      id: "job-1", title: "Senior Engineer", company: "Acme", location: "Remote",
      startDate: "2022-01", endDate: "", current: true, description: "Led the platform team.",
      bullets: [
        { id: "b1", text: "Reduced processing time by 40%." },
        { id: "b2", text: "Mentored five engineers." },
      ],
      notes: [{
        id: "note", question: "Private question", answer: "Private answer",
        via: ["type"], askedAt: "2026-11-08T12:00:00Z",
      }],
    }),
    ExperienceSchema.parse({
      id: "job-2", title: "Junior Developer", company: "Example Co", location: "",
      startDate: "2020", endDate: "2021-12", current: false, description: "",
      bullets: [{ id: "b3", text: "Shipped the customer portal." }],
    }),
  ];
  content.education = [{
    id: "edu", school: "Example University", degree: "BSc", field: "Computer Science",
    startDate: "2016", endDate: "2020", notes: "Graduated with distinction.",
  }];
  content.layout.titles = { experience: "Career history", education: "Academic background" };
  return CvContentSchema.parse(content);
}


/** A tailored CV of `roles` roles with `bullets` two-line bullets each, plus the usual short sections. */
function longCv(roles: number, bullets: number): CvContent {
  const content = fixture();
  content.basics.titles = ["Business Analyst", "Process Automation & BI"];
  content.basics.summary = "Business analyst with ten years in process automation and business intelligence. Turns business needs into clear requirements, automated workflows and dashboards that teams use.";
  content.experience = Array.from({ length: roles }, (_, index) => ExperienceSchema.parse({
    id: `job-${index}`, title: `Analyst role ${index}`, company: "Example Bank", location: "Bucharest",
    startDate: "2020-01", endDate: "2021-12", current: false, description: "Bank operations and reporting.",
    bullets: Array.from({ length: bullets }, (_, bullet) => ({
      id: `b-${index}-${bullet}`,
      text: `Mapped and automated finance processes across operations teams, cutting manual effort by ${bullet + 1}0% and improving reporting accuracy (${index}).`,
    })),
  }));
  content.technicalSkills = ["Power BI", "SQL", "Python", "Power Automate", "UiPath", "BPMN", "Jira"].map((name, i) => ({ id: `t${i}`, name }));
  content.languages = [{ id: "l1", name: "English", level: "C2" }, { id: "l2", name: "Romanian", level: "Native" }];
  return CvContentSchema.parse(content);
}

const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAOSURBVBhXY/jPwABC/wEP+QP98+IdQAAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

/** Pairs of text runs drawn over each other on the same page (each run boxed from its baseline up by its height). */
async function overlaps(blob: Blob): Promise<string[]> {
  const doc = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
  const found: string[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const { items } = await (await doc.getPage(number)).getTextContent();
    const boxes = items.flatMap((item) => ("str" in item && item.str.trim() ? [{
      text: item.str, x0: item.transform[4] as number, x1: (item.transform[4] as number) + item.width,
      y0: item.transform[5] as number, y1: (item.transform[5] as number) + item.height,
    }] : []));
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => {
      const across = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const down = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (across > 1 && down > 0.5) found.push(`page ${number}: "${a.text}" / "${b.text}"`);
    }));
  }
  return found;
}

async function readPdf(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  expect(blob.type).toBe("application/pdf");
  return extractText(bytes, { mergePages: true });
}

describe("buildCvPdf", () => {
  it.each([["classic", "png"], ["modern", "png"], ["classic", "jpeg"]] as const)("embeds the %s photo as %s", async (template, type) => {
    const content = fixture();
    content.basics.photo = { path: "user/photo.png", x: 50, y: 50, zoom: 1 };
    const data = Uint8Array.from(atob(type === "png"
      ? "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAOSURBVBhXY/jPwABC/wEP+QP98+IdQAAAAABJRU5ErkJggg=="
      : "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4H8Q/8h/Uv+vmX/0M0UUV/ptkP/Ipwn/XuH/pKPAzr/kZ4r/r5P8A9KZ//9k="), (c) => c.charCodeAt(0));
    const blob = await buildCvPdf(content, template, { data, type });
    await readPdf(blob);
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toMatch(/\/Subtype\s*\/Image\b/);
  });

  it.each(["compact", "no bytes", "no photo", "webp"])("omits the image for %s", async (scenario) => {
    const content = fixture();
    if (scenario !== "no photo") content.basics.photo = { path: "user/photo.png", x: 50, y: 50, zoom: 1 };
    const photo = scenario === "no bytes" ? undefined : {
      data: new Uint8Array(), type: scenario === "webp" ? "webp" as const : "png" as const,
    };
    const blob = await buildCvPdf(content, scenario === "compact" ? "compact" : "classic", photo);
    await readPdf(blob);
    expect(new TextDecoder().decode(await blob.arrayBuffer())).not.toMatch(/\/Subtype\s*\/Image\b/);
  });

  it.each(["classic", "modern", "compact", "unknown-template", undefined])(
    "exports selectable Romanian text, the header, all roles and bullets for %s", async (template) => {
      const { text } = await readPdf(await buildCvPdf(fixture(), template));
      for (const value of [
        "Ștefan Ionescu", "Software Engineer", "Team Lead", "stefan@example.com", "+40 123 456",
        "București", "https://stefan.example.com", "linkedin.com/in/stefan",
        "Senior Engineer", "Acme", "Remote", "Junior Developer", "Example Co",
        "Led the platform team.", "Jan 2022 – Present", "Reduced processing time by 40%.",
        "Mentored five engineers.", "Shipped the customer portal.",
      ]) expect(text).toContain(value);
      expect(text).not.toContain("Private question");
      expect(text).not.toContain("Private answer");
    },
  );

  it("omits the heading and all content of a hidden section", async () => {
    const content = fixture();
    content.layout.hidden = ["education"];
    const { text } = await readPdf(await buildCvPdf(content, "modern"));
    expect(text).not.toContain("Academic background");
    expect(text).not.toContain("Example University");
    expect(text).not.toContain("Graduated with distinction.");
    expect(text).toContain("Career history");
  });

  it("follows the user's headings and reverses their order", async () => {
    const content = fixture();
    content.layout.order = ["education", "experience"];
    let result = await readPdf(await buildCvPdf(content, "classic"));
    expect(result.text).toContain("Academic background");
    expect(result.text).toContain("Career history");
    expect(result.text.indexOf("Academic background")).toBeLessThan(result.text.indexOf("Career history"));
    content.layout.order.reverse();
    result = await readPdf(await buildCvPdf(content, "classic"));
    expect(result.text.indexOf("Career history")).toBeLessThan(result.text.indexOf("Academic background"));
  });

  it("exports every other section and preserves separate skill groups and custom headings", async () => {
    const content = fixture();
    content.achievements = [{ id: "a", text: "Won ten customers." }];
    content.technicalSkills = [{ id: "t", name: "TypeScript" }];
    content.professionalSkills = [{ id: "p", name: "Team leadership" }];
    content.unclearSkills = [{ id: "u", name: "Unsorted skill" }];
    content.languages = [{ id: "l", name: "Romanian", level: "Native" }];
    content.certifications = [{ id: "c", name: "Cloud certification", issuer: "Cloud Institute", date: "2024" }];
    content.projects = [{ id: "p", name: "Public project", url: "https://project.example.com", description: "Open source toolkit." }];
    content.volunteering = [{ ...content.experience[1]!, id: "v", title: "Volunteer mentor" }];
    content.awards = [{ id: "a", name: "Community award", issuer: "Local council", date: "2025", description: "Recognised for mentoring." }];
    content.courses = [{ id: "c", name: "Architecture course", provider: "Learning Institute", date: "2023" }];
    content.publications = [{ id: "p", title: "Engineering article", publisher: "Tech Journal", date: "2024", url: "https://article.example.com" }];
    content.interests = [{ id: "i", name: "Hiking" }];
    content.custom = [{ id: "o", title: "Community involvement", details: "Organised local meetups." }];
    const { text } = await readPdf(await buildCvPdf(CvContentSchema.parse(content), "compact"));
    for (const value of [
      "Experienced engineer building useful products.", "Example University", "BSc, Computer Science",
      "Graduated with distinction.", "Won ten customers.", "Technical: TypeScript",
      "Professional: Team leadership", "Romanian", "Native", "Cloud certification", "Cloud Institute",
      "Public project", "https://project.example.com", "Open source toolkit.", "Volunteer mentor",
      "Community award", "Local council", "Recognised for mentoring.", "Architecture course",
      "Learning Institute", "Engineering article", "Tech Journal", "https://article.example.com",
      "Hiking", "Community involvement", "Organised local meetups.",
    ]) expect(text).toContain(value);
    expect(text).not.toContain("Unsorted skill");
    expect(text).not.toContain("Other");
  });

  it("uses localized default headings and omits empty sections", async () => {
    const content = emptyCv("ro");
    content.basics.summary = "Profil profesional cu ă î â ș ț.";
    content.layout.titles.summary = "   ";
    const { text } = await readPdf(await buildCvPdf(content, undefined));
    expect(text).toContain("Profil profesional cu ă î â ș ț.");
    expect(text.trim().startsWith("Profil")).toBe(true);
    expect(text).not.toContain("Experiență");
  });

  it("flows long content across pages without losing role titles or bullets", async () => {
    const content = fixture();
    content.experience = Array.from({ length: 20 }, (_, index) => ({
      ...content.experience[0]!, id: `job-${index}`, title: `Engineer role ${index}`,
      bullets: Array.from({ length: 5 }, (_, bullet) => ({
        id: `b-${index}-${bullet}`, text: `Delivered project ${index}, milestone ${bullet}, for customers.`,
      })),
    }));
    const { text, totalPages } = await readPdf(await buildCvPdf(CvContentSchema.parse(content), "classic"));
    expect(totalPages).toBeGreaterThan(1);
    for (const job of content.experience) {
      expect(text).toContain(job.title);
      for (const bullet of job.bullets) expect(text).toContain(bullet.text);
    }
  });

  it.each([
    ["classic", false], ["classic", true], ["modern", false], ["modern", true], ["compact", false],
  ] as const)("draws no text over other text for %s (photo: %s), header included", async (template, withPhoto) => {
    const content = longCv(6, 4);
    if (withPhoto) content.basics.photo = { path: "user/photo.png", x: 50, y: 50, zoom: 1 };
    const blob = await buildCvPdf(content, template, withPhoto ? { data: PNG, type: "png" } : undefined);
    expect(await overlaps(blob)).toEqual([]);
  });
});

describe("fitCvPdf", () => {
  it("exports a CV that already fits exactly as the template, untightened", async () => {
    const fitted = await fitCvPdf(fixture(), "classic");
    expect(fitted).toMatchObject({ step: fitSteps("classic")[0], pages: 1, fits: true });
    expect((await readPdf(fitted.blob)).totalPages).toBe(1);
  });

  it.each([["classic", 6], ["modern", 6], ["compact", 7]] as const)("fits a 3-page %s CV (%s roles) onto 2 pages by tightening", async (template, roles) => {
    const content = longCv(roles, 5);
    expect((await readPdf(await buildCvPdf(content, template))).totalPages).toBe(3);
    const fitted = await fitCvPdf(content, template);
    expect(fitted.fits).toBe(true);
    expect(fitted.step.tight).toBe(true);
    expect(fitted.pages).toBe(2);
    expect((await readPdf(fitted.blob)).totalPages).toBe(2);
    expect(await overlaps(fitted.blob)).toEqual([]);
  });

  it.each([["classic", 10], ["compact", 9.5]] as const)("stops at the %s minimum of %spt and reports a very long CV that still won't fit", async (template, minimum) => {
    const fitted = await fitCvPdf(longCv(14, 6), template);
    expect(fitted).toMatchObject({ step: { tight: true, fontSize: minimum }, fits: false });
    expect(fitted.pages).toBeGreaterThan(2);
    expect((await readPdf(fitted.blob)).totalPages).toBe(fitted.pages);
  });
});

describe("buildLetterPdf", () => {
  it("exports the localized date, recipient, Romanian paragraphs and signature in order", async () => {
    const { text } = await readPdf(await buildLetterPdf({
      greeting: "Dear hiring team,",
      paragraphs: ["I am applying for the engineer role.", "Diacritice românești: ă î â ș ț."],
      signOff: "Kind regards,",
    }, {
      name: "Ștefan Ionescu", contact: ["stefan@example.com", "București"],
      company: "Acme", role: "Senior Engineer", date: new Date(2026, 10, 8),
    }, "ro"));
    let previous = -1;
    for (const value of [
      "Ștefan Ionescu", "stefan@example.com · București", "8 noiembrie 2026", "Acme · Senior Engineer",
      "Dear hiring team,", "I am applying for the engineer role.", "Diacritice românești: ă î â ș ț.",
      "Kind regards,",
    ]) {
      expect(text).toContain(value);
      const index = text.indexOf(value);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
    expect(text.lastIndexOf("Ștefan Ionescu")).toBeGreaterThan(previous);
  });

  it("handles absent optional fields and defaults to today's date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 8, 12));
    try {
      const { text } = await readPdf(await buildLetterPdf({ paragraphs: ["My application."] }, { name: "Ștefan" }, "en-US"));
      expect(text).toContain("November 8, 2026");
      expect(text).toContain("My application.");
      expect(text).not.toContain("undefined");
    } finally {
      vi.useRealTimers();
    }
  });
});
