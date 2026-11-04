import { cv, role, type Case } from "./types.ts";

export const case01: Case = {
  id: "01-one-column",
  variant: "one",
  contactTitle: "Contact",
  content: cv(
    "en",
    {
      fullName: "Marcus Ellery",
      titles: ["Backend Engineer"],
      email: "marcus.ellery@example.com",
      phone: "+40 700 000 011",
      location: "Cluj-Napoca, Romania",
      linkedin: "linkedin.com/in/marcus-ellery-example",
      summary:
        "Backend engineer with seven years of experience building payment and billing services. I like small, well-tested services and clear documentation.",
    },
    {
      experience: [
        role("Northwind Payments", "Senior Backend Engineer", "Cluj-Napoca, Romania", "2021-03", "", "Own the billing service used by 40 merchant integrations.", [
          "Cut invoice generation time from 11 minutes to 90 seconds by moving it to a queue-based worker.",
          "Led the migration from a single PostgreSQL instance to a primary with two read replicas.",
          "Mentored three junior engineers through their first production releases.",
        ], true),
        role("Brightloop", "Backend Engineer", "Remote", "2018-09", "2021-02", "Worked on the subscription platform for a mid-size software company.", [
          "Built the webhook delivery system with retries and a replay tool for support.",
          "Reduced failed payments by 18% by adding smarter retry timing.",
        ]),
      ],
      education: [
        { school: "Technical University of Cluj-Napoca", degree: "Bachelor of Engineering", field: "Computer Science", startDate: "2014", endDate: "2018", notes: "" },
      ],
      languages: [
        { name: "English", level: "Fluent" },
        { name: "Romanian", level: "Native" },
      ],
      certifications: [{ name: "AWS Certified Developer – Associate", issuer: "Amazon Web Services", date: "2022-05" }],
      skills: {
        tech: ["Go", "PostgreSQL", "Kafka", "Docker", "Terraform"],
        prof: ["System design", "Code review", "Mentoring"],
      },
    },
  ),
  sections: [
    { heading: "Profile", category: "summary" },
    { heading: "Work Experience", category: "experience" },
    { heading: "Skills", category: "skills" },
    { heading: "Education", category: "education" },
    { heading: "Languages", category: "languages" },
    { heading: "Certifications", category: "certifications" },
  ],
};

export const case02: Case = {
  id: "02-two-column",
  variant: "two",
  contactTitle: "Contact",
  content: cv(
    "en",
    {
      fullName: "Priya Nandakumar",
      titles: ["Marketing Manager", "Brand Strategist"],
      email: "priya.nandakumar@example.com",
      phone: "+40 700 000 022",
      location: "Bucharest, Romania",
      website: "priyanandakumar.example.com",
      summary:
        "Marketing manager who turns research into campaigns. Ten years across consumer brands and B2B software, with a focus on measurable growth.",
    },
    {
      experience: [
        role("Lumen Software", "Marketing Manager", "Bucharest, Romania", "2020-01", "", "Lead a team of five covering content, events and paid media.", [
          "Raised qualified leads by 62% in two years through a rebuilt content programme.",
          "Ran the company's first user conference with 450 attendees.",
          "Set up Salesforce and HubSpot reporting shared by sales and marketing.",
        ], true),
        role("Casa Verde Foods", "Brand Manager", "Bucharest, Romania", "2015-06", "2019-12", "Managed three snack brands sold in 900 stores.", [
          "Relaunched the oat bar range, growing sales by 28% in the first year.",
          "Negotiated media packages worth 1.2 million lei per year.",
        ]),
      ],
      education: [
        { school: "Bucharest University of Economic Studies", degree: "Master's degree", field: "Marketing", startDate: "2012", endDate: "2014", notes: "" },
        { school: "University of Bucharest", degree: "Bachelor's degree", field: "Communication", startDate: "2009", endDate: "2012", notes: "" },
      ],
      languages: [
        { name: "English", level: "Fluent" },
        { name: "Hindi", level: "Native" },
        { name: "Romanian", level: "Professional" },
      ],
      courses: [{ name: "Marketing Analytics", provider: "Google Digital Academy", date: "2021-04" }],
      custom: [{ title: "Driving licence", details: "Category B" }],
      skills: {
        tech: ["HubSpot", "Salesforce", "Google Analytics"],
        prof: ["Brand strategy", "Campaign planning", "Team leadership"],
      },
    },
  ),
  sections: [
    { heading: "Profile", category: "summary", col: 0 },
    { heading: "Experience", category: "experience", col: 0 },
    { heading: "Skills", category: "skills", col: 1 },
    { heading: "Education", category: "education", col: 1 },
    { heading: "Languages", category: "languages", col: 1 },
    { heading: "Training", category: "courses", col: 1 },
    { heading: "Driving licence", category: "other", col: 1 },
  ],
};

export const case03: Case = {
  id: "03-three-column",
  variant: "three",
  contactTitle: "Contact",
  content: cv(
    "en",
    {
      fullName: "Tomás Varga",
      titles: ["Data Analyst"],
      email: "tomas.varga@example.com",
      phone: "+40 700 000 033",
      location: "Timișoara, Romania",
      summary: "Data analyst who explains numbers to people who do not like numbers.",
    },
    {
      achievements: [
        { text: "Built a churn dashboard that the retention team now uses every Monday." },
        { text: "Found a pricing error that was costing 4% of monthly revenue." },
        { text: "Trained 30 colleagues to write their own SQL queries." },
      ],
      experience: [
        role("Aurora Retail", "Data Analyst", "Timișoara, Romania", "2019-10", "", "Analyse sales and customer data for 60 shops.", [
          "Automated the weekly sales report, saving six hours of manual work.",
          "Created a store ranking model used in yearly planning.",
        ], true),
        role("Delta Consulting", "Junior Analyst", "Timișoara, Romania", "2017", "2019", "Prepared reports for telecom clients.", [
          "Cleaned and merged survey data from five countries.",
        ]),
      ],
      education: [
        { school: "West University of Timișoara", degree: "Bachelor's degree", field: "Statistics", startDate: "2013", endDate: "2017", notes: "" },
      ],
      languages: [
        { name: "Hungarian", level: "Native" },
        { name: "English", level: "Advanced" },
      ],
      certifications: [{ name: "Microsoft Certified: Data Analyst Associate", issuer: "Microsoft", date: "2021-02" }],
      skills: {
        tech: ["SQL", "Python", "Power BI", "Excel"],
        prof: ["Data storytelling", "Stakeholder communication"],
      },
    },
  ),
  sections: [
    { heading: "Skills", category: "skills", col: 0 },
    { heading: "Languages", category: "languages", col: 0 },
    { heading: "Summary", category: "summary", col: 1 },
    { heading: "Experience", category: "experience", col: 1 },
    { heading: "Key Achievements", category: "achievements", col: 2 },
    { heading: "Education", category: "education", col: 2 },
    { heading: "Certifications", category: "certifications", col: 2 },
  ],
};

export const case04: Case = {
  id: "04-colour-sidebar",
  variant: "sidebar",
  contactTitle: "Contact",
  content: cv(
    "en",
    {
      fullName: "Sofia Lindqvist",
      titles: ["UX Designer"],
      email: "sofia.lindqvist@example.com",
      phone: "+40 700 000 044",
      location: "Iași, Romania",
      website: "sofialindqvist.example.com",
      summary: "UX designer who works from user research to shipped interfaces. Comfortable with both quick prototypes and detailed design systems.",
    },
    {
      experience: [
        role("Fieldnote", "Senior UX Designer", "Iași, Romania", "2020-06", "", "Design lead for a note-taking app with 200,000 users.", [
          "Redesigned onboarding, lifting day-seven retention from 31% to 44%.",
          "Built a design system used by four product teams.",
        ], true),
        role("Studio Pixel", "UX Designer", "Iași, Romania", "2017-02", "2020-05", "Designed websites and apps for small businesses.", [
          "Ran 40 usability tests across 12 client projects.",
        ]),
      ],
      education: [
        { school: "Gheorghe Asachi Technical University", degree: "Bachelor's degree", field: "Industrial Design", startDate: "2013", endDate: "2017", notes: "" },
      ],
      languages: [
        { name: "Swedish", level: "Native" },
        { name: "English", level: "Fluent" },
      ],
      certifications: [{ name: "Certified Usability Analyst", issuer: "Human Factors International", date: "2019-11" }],
      skills: {
        tech: ["Figma", "Miro", "HTML and CSS"],
        prof: ["User research", "Prototyping", "Workshop facilitation"],
      },
    },
  ),
  sections: [
    { heading: "Skills", category: "skills", col: 0 },
    { heading: "Languages", category: "languages", col: 0 },
    { heading: "Certifications", category: "certifications", col: 0 },
    { heading: "About me", category: "summary", col: 1 },
    { heading: "Experience", category: "experience", col: 1 },
    { heading: "Education", category: "education", col: 1 },
  ],
};
