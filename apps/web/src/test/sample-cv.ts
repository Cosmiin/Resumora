import { emptyCv, type CvContent } from "@resumora/shared";

/** The synthetic "Ana Maria Popescu" CV from the mockups, every section filled. */
export function sampleCv(overrides: Partial<CvContent> = {}): CvContent {
  const base = emptyCv("en");
  return {
    ...base,
    basics: {
      fullName: "Ana Maria Popescu",
      firstName: "Ana Maria",
      lastName: "Popescu",
      titles: ["Product Manager", "Team Lead"],
      email: "ana.popescu@example.com",
      phone: "+40 700 000 000",
      location: "Cluj-Napoca, Romania",
      website: "",
      linkedin: "linkedin.com/in/anapopescu",
      summary: "Product manager with eight years of experience shipping software for small teams.",
    },
    experience: [
      {
        id: "exp-1",
        company: "Northwind Software",
        title: "Senior Product Manager",
        location: "Cluj-Napoca",
        startDate: "2021-03",
        endDate: "",
        current: true,
        description: "Owns the roadmap for the billing platform.",
        bullets: [
          { id: "b-1", text: "Launched self-service invoicing used by 4,000 customers." },
          { id: "b-2", text: "Cut onboarding time from two weeks to three days." },
        ],
      },
      {
        id: "exp-2",
        company: "Contoso Labs",
        title: "Product Analyst",
        location: "Bucharest",
        startDate: "2018-09",
        endDate: "2021-02",
        current: false,
        description: "",
        bullets: [{ id: "b-3", text: "Built the first usage dashboard for the sales team." }],
      },
      {
        id: "exp-3",
        company: "Contoso Labs",
        title: "Support Specialist",
        location: "Bucharest",
        startDate: "2017-01",
        endDate: "2018-08",
        current: false,
        description: "",
        bullets: [],
      },
    ],
    education: [
      {
        id: "edu-1",
        school: "Babes-Bolyai University",
        degree: "BSc",
        field: "Computer Science",
        startDate: "2014",
        endDate: "2018",
        notes: "",
      },
    ],
    technicalSkills: [
      { id: "s-1", name: "SQL" },
      { id: "s-2", name: "Figma" },
    ],
    professionalSkills: [
      { id: "s-3", name: "Roadmapping" },
      { id: "s-4", name: "Stakeholder communication" },
    ],
    unclearSkills: [{ id: "s-5", name: "Management" }],
    languages: [
      { id: "lang-1", name: "Romanian", level: "Native" },
      { id: "lang-2", name: "English", level: "C1" },
    ],
    certifications: [{ id: "cert-1", name: "Certified Scrum Product Owner", issuer: "Scrum Alliance", date: "2020-05" }],
    projects: [
      { id: "proj-1", name: "Open-source invoice templates", description: "A set of invoice layouts.", url: "github.com/ana/invoices" },
    ],
    custom: [{ id: "cust-1", title: "Volunteering", details: "Mentor at a local coding club." }],
    ...overrides,
  };
}
