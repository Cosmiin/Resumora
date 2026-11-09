import { CvContentSchema, emptyCv, ExperienceSchema, type CvContent } from "@resumora/shared";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCvDocx, buildLetterDocx } from "./docx.ts";

function fixture(): CvContent {
  const content = emptyCv();
  content.basics = {
    ...content.basics, fullName: "Ana Popescu", titles: ["Software Engineer"],
    email: "ana@example.com", phone: "+40 123 456", location: "Bucharest",
    website: "https://ana.example.com", linkedin: "linkedin.com/in/ana",
    summary: "Experienced engineer building useful products.",
  };
  content.experience = [
    ExperienceSchema.parse({
      id: "job-1", title: "Senior Engineer", company: "Acme", location: "Remote",
      startDate: "2022-01", endDate: "", current: true, description: "Led the platform team.",
      bullets: [
        { id: "bullet-1", text: "Reduced processing time by 40%." },
        { id: "bullet-2", text: "Mentored five engineers." },
      ],
      notes: [{
        id: "note-1", question: "Private question", answer: "Private answer",
        via: ["type"], askedAt: "2026-11-08T12:00:00Z",
      }],
    }),
    ExperienceSchema.parse({
      id: "job-2", title: "Junior Developer", company: "Example Co", location: "",
      startDate: "2020", endDate: "2021-12", current: false, description: "",
      bullets: [{ id: "bullet-3", text: "Shipped the customer portal." }],
    }),
  ];
  content.education = [{
    id: "edu-1", school: "Example University", degree: "BSc", field: "Computer Science",
    startDate: "2016", endDate: "2020", notes: "Graduated with distinction.",
  }];
  content.layout.titles = { experience: "Career history", education: "Academic background" };
  return CvContentSchema.parse(content);
}

async function documentXml(blob: Blob): Promise<string> {
  // jsdom's Blob uses FileReader rather than arrayBuffer().
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  const zip = await JSZip.loadAsync(bytes);
  expect(zip.file("[Content_Types].xml")).not.toBeNull();
  const xml = await zip.file("word/document.xml")!.async("string");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  expect(document.querySelector("parsererror")).toBeNull();
  expect(document.documentElement.localName).toBe("document");
  expect(zip.file(/^word\/media\/[^/]+$/)).toHaveLength(document.getElementsByTagName("a:blip").length);
  return xml;
}

afterEach(() => vi.useRealTimers());

describe("buildCvDocx", () => {
  it.each([["classic", "png"], ["modern", "png"], ["classic", "jpeg"]] as const)("embeds the %s photo as %s", async (template, type) => {
    const content = fixture();
    content.basics.photo = { path: "user/photo.png", x: 50, y: 50, zoom: 1 };
    const data = Uint8Array.from(atob(type === "png"
      ? "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAOSURBVBhXY/jPwABC/wEP+QP98+IdQAAAAABJRU5ErkJggg=="
      : "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4H8Q/8h/Uv+vmX/0M0UUV/ptkP/Ipwn/XuH/pKPAzr/kZ4r/r5P8A9KZ//9k="), (c) => c.charCodeAt(0));
    const xml = await documentXml(await buildCvDocx(content, template, { data, type }));
    expect(xml).toContain("<w:drawing>");
    expect(xml).toContain("<a:blip r:embed=");
    expect(xml).toContain('<wp:extent cx="914400" cy="457200"/>');
  });

  it.each(["compact", "no bytes", "no photo", "webp"])("omits the image for %s", async (scenario) => {
    const content = fixture();
    if (scenario !== "no photo") content.basics.photo = { path: "user/photo.png", x: 50, y: 50, zoom: 1 };
    const photo = scenario === "no bytes" ? undefined : {
      data: new Uint8Array(), type: scenario === "webp" ? "webp" as const : "png" as const,
    };
    const xml = await documentXml(await buildCvDocx(content, scenario === "compact" ? "compact" : "classic", photo));
    expect(xml).not.toContain("<w:drawing");
  });

  it("includes the header, every role and every bullet as a list paragraph", async () => {
    const content = fixture();
    const xml = await documentXml(await buildCvDocx(content, "classic"));
    for (const text of [
      content.basics.fullName, ...content.basics.titles, content.basics.email, content.basics.phone,
      content.basics.location, content.basics.website, content.basics.linkedin,
      ...content.experience.flatMap((job) => [job.title, job.company, ...job.bullets.map((b) => b.text)]),
    ]) expect(xml).toContain(text);
    expect(xml).toContain("Led the platform team.");
    expect(xml).toContain("Jan 2022 – Present");
    expect(xml.match(/<w:numPr>/g)).toHaveLength(3);
    expect(xml).not.toContain("Private question");
    expect(xml).not.toContain("Private answer");
  });

  it("leaves out a hidden course and a section whose items are all hidden (E6 Task 10a)", async () => {
    const content = fixture();
    content.courses = [{ id: "c1", name: "SQL basics", provider: "", date: "" }, { id: "c2", name: "Pottery class", provider: "", date: "", hidden: true }];
    content.interests = [{ id: "i1", name: "Knitting", hidden: true }];
    const xml = await documentXml(await buildCvDocx(content, "modern"));
    expect(xml).toContain("SQL basics");
    expect(xml).not.toContain("Pottery class");
    expect(xml).not.toContain("Knitting");
  });

  it("omits a hidden section's heading and text", async () => {
    const content = fixture();
    content.layout.hidden = ["education"];
    const xml = await documentXml(await buildCvDocx(content, "modern"));
    expect(xml).not.toContain("Academic background");
    expect(xml).not.toContain("Example University");
    expect(xml).not.toContain("Graduated with distinction.");
    expect(xml).toContain("Career history");
  });

  it("follows the layout order and its reverse using the user's headings", async () => {
    const content = fixture();
    content.layout.order = ["education", "experience"];
    let xml = await documentXml(await buildCvDocx(content, "classic"));
    expect(xml.indexOf("Academic background")).toBeLessThan(xml.indexOf("Career history"));
    content.layout.order.reverse();
    xml = await documentXml(await buildCvDocx(content, "classic"));
    expect(xml.indexOf("Career history")).toBeLessThan(xml.indexOf("Academic background"));
  });

  it.each(["classic", "modern", "compact", "unknown-template", undefined])(
    "creates a valid single-column A4 document for %s", async (template) => {
      const xml = await documentXml(await buildCvDocx(fixture(), template));
      expect(xml).toContain('w:w="11906"');
      expect(xml).toContain('w:h="16838"');
      expect(xml).not.toMatch(/<w:(tbl|txbxContent)\b/);
      expect(xml).not.toContain("<w:drawing");
    },
  );

  it("exports every other visible section, keeping skill groups and custom headings", async () => {
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
    const xml = await documentXml(await buildCvDocx(CvContentSchema.parse(content), "compact"));
    for (const text of [
      "Won ten customers.", "Technical: TypeScript", "Professional: Team leadership", "Romanian", "Native",
      "Cloud certification", "Cloud Institute", "Public project", "https://project.example.com",
      "Open source toolkit.", "Used by 40 teams.", "Volunteer mentor", "Community award", "Local council",
      "Recognised for mentoring.", "Architecture course", "Learning Institute", "Event-driven design", "Cost modelling", "Crossed the Fagaras ridge", "Chess", "Engineering article",
      "Tech Journal", "https://article.example.com", "Hiking", "Community involvement", "Organised local meetups.",
    ]) expect(xml).toContain(text);
    expect(xml).not.toContain("Unsorted skill");
    expect(xml).not.toContain(">Other<");
  });

  it("omits empty sections and uses localized default headings", async () => {
    const content = emptyCv("ro");
    content.basics.summary = "Profil profesional.";
    content.layout.titles.summary = "   ";
    const xml = await documentXml(await buildCvDocx(content, undefined));
    expect(xml).toContain(">Profil<");
    expect(xml.match(/w:val="Heading1"/g)).toHaveLength(1);
  });
});

describe("buildLetterDocx", () => {
  it("includes the header, localized date, recipient, greeting, paragraphs and signature in order", async () => {
    const date = new Date(2026, 10, 8);
    const xml = await documentXml(await buildLetterDocx({
      greeting: "Dear hiring team,",
      paragraphs: ["I am applying for the engineer role.", "I would bring experience building reliable services."],
      signOff: "Kind regards,",
    }, {
      name: "Ana Popescu", contact: ["ana@example.com", "Bucharest"],
      company: "Acme", role: "Senior Engineer", date,
    }, "ro"));
    const texts = [
      "Ana Popescu", "ana@example.com · Bucharest",
      new Intl.DateTimeFormat("ro", { dateStyle: "long" }).format(date),
      "Acme · Senior Engineer", "Dear hiring team,", "I am applying for the engineer role.",
      "I would bring experience building reliable services.", "Kind regards,",
    ];
    let previous = -1;
    for (const text of texts) {
      const index = xml.indexOf(text);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
    expect(xml.lastIndexOf("Ana Popescu")).toBeGreaterThan(previous);
  });

  it("defaults to today's date when optional header and letter fields are absent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 8, 12));
    const xml = await documentXml(await buildLetterDocx({ paragraphs: ["My application."] }, { name: "Ana" }, "en-US"));
    expect(xml).toContain("November 8, 2026");
    expect(xml).toContain("My application.");
    expect(xml).not.toContain("undefined");
  });
});
