// @vitest-environment node
import { createRequire } from "node:module";
import { Font } from "@react-pdf/renderer";
import { CvContentSchema, emptyCv, ExperienceSchema, type CvContent } from "@resumora/shared";
import { extractText } from "unpdf";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildCvPdf, buildLetterPdf } from "./pdf.tsx";

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
    content.projects = [{ id: "p", title: "Public project", company: "", location: "", startDate: "", endDate: "", current: false, description: "", bullets: [{ id: "p-b1", text: "Open source toolkit." }, { id: "p-b2", text: "Used by 40 teams." }], notes: [], url: "https://project.example.com" }];
    content.volunteering = [{ ...content.experience[1]!, id: "v", title: "Volunteer mentor" }];
    content.awards = [{ id: "a", name: "Community award", issuer: "Local council", date: "2025", description: "Recognised for mentoring." }];
    content.courses = [{ id: "c", name: "Architecture course", provider: "Learning Institute", date: "2023", bullets: [{ id: "cl1", text: "Event-driven design" }, { id: "cl2", text: "Cost modelling" }] }];
    content.publications = [{ id: "p", title: "Engineering article", publisher: "Tech Journal", date: "2024", url: "https://article.example.com" }];
    content.interests = [{ id: "i", name: "Hiking", bullets: [{ id: "il1", text: "Crossed the Fagaras ridge" }] }, { id: "i2", name: "Chess" }];
    content.custom = [{ id: "o", title: "Community involvement", details: "Organised local meetups." }];
    const { text } = await readPdf(await buildCvPdf(CvContentSchema.parse(content), "compact"));
    for (const value of [
      "Experienced engineer building useful products.", "Example University", "BSc, Computer Science",
      "Graduated with distinction.", "Won ten customers.", "Technical: TypeScript",
      "Professional: Team leadership", "Romanian", "Native", "Cloud certification", "Cloud Institute",
      "Public project", "https://project.example.com", "Open source toolkit.", "Used by 40 teams.", "Volunteer mentor",
      "Community award", "Local council", "Recognised for mentoring.", "Architecture course",
      "Learning Institute", "Event-driven design", "Cost modelling", "Crossed the Fagaras ridge", "Chess", "Engineering article", "Tech Journal", "https://article.example.com",
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
