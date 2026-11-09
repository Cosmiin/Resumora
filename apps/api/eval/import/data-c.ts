import { cv, project, role, type Case } from "./types.ts";

export const case11: Case = {
  id: "11-docx-tables",
  variant: "docx",
  contactTitle: "Contact",
  content: cv(
    "en",
    {
      fullName: "Victor Alden",
      titles: ["Financial Accountant"],
      email: "victor.alden@example.com",
      phone: "+40 700 000 111",
      location: "Ploiești, Romania",
      summary: "Accountant with nine years in manufacturing and retail. I close the month early and explain the numbers clearly.",
    },
    {
      experience: [
        role("Prahova Metalworks", "Financial Accountant", "Ploiești, Romania", "2018-05", "", "Responsible for the general ledger and monthly closing of a manufacturing company.", [
          "Shortened the monthly close from eight working days to five.",
          "Prepared audited accounts with no material findings for four years in a row.",
        ], true),
        role("Retail Plus", "Junior Accountant", "Ploiești, Romania", "2015-10", "2018-04", "Handled accounts payable for 30 stores.", [
          "Cut supplier payment errors by two thirds with a new approval checklist.",
        ]),
      ],
      education: [
        { school: "Petroleum-Gas University of Ploiești", degree: "Bachelor's degree", field: "Accounting and Management Information Systems", startDate: "2011", endDate: "2015", notes: "" },
      ],
      languages: [
        { name: "Romanian", level: "Native" },
        { name: "English", level: "Upper intermediate" },
      ],
      certifications: [{ name: "ACCA Diploma in Financial and Management Accounting", issuer: "ACCA", date: "2020-03" }],
      skills: {
        tech: ["SAP", "Excel", "SAGA"],
        prof: ["Financial reporting", "Month-end closing", "VAT compliance"],
      },
    },
  ),
  sections: [
    { heading: "Skills", category: "skills", col: 0 },
    { heading: "Languages", category: "languages", col: 0 },
    { heading: "Education", category: "education", col: 0 },
    { heading: "Profile", category: "summary", col: 1 },
    { heading: "Experience", category: "experience", col: 1 },
    { heading: "Certifications", category: "certifications", col: 1 },
  ],
};

const longRoles = [
  role("Helix Health Foundation", "Programme Director", "Manchester, United Kingdom", "2020-02", "", "Direct a portfolio of eleven health programmes across six countries with a combined budget of 18 million pounds.", [
    "Brought three programmes back on budget within nine months after a funding review.",
    "Built a monitoring framework adopted by all eleven programme teams.",
    "Negotiated two multi-year grants worth 6.5 million pounds in total.",
    "Lead a leadership team of seven programme managers and two finance partners.",
    "Present quarterly results to the board and to the three largest donors.",
  ], true),
  role("Helix Health Foundation", "Senior Programme Manager", "Manchester, United Kingdom", "2016-09", "2020-01", "Managed the maternal health programme in West Africa.", [
    "Trained 1,200 community health workers in four regions.",
    "Cut the reporting cycle from 90 to 45 days with a mobile data tool.",
    "Opened a second field office and hired a team of 14.",
    "Worked with ministries of health on national guidelines.",
  ]),
  role("Northern Relief Alliance", "Programme Manager", "Leeds, United Kingdom", "2013-01", "2016-08", "Ran emergency response and recovery programmes after floods and storms.", [
    "Coordinated aid for 25,000 people after the 2015 winter floods.",
    "Set up a volunteer network of 300 people ready to deploy within 48 hours.",
    "Wrote the alliance's first safeguarding policy.",
    "Reduced the cost per household supported by 20%.",
  ]),
  role("Northern Relief Alliance", "Project Officer", "Leeds, United Kingdom", "2010-06", "2012-12", "Supported project teams with planning, budgets and reports.", [
    "Prepared monthly budget reports for eight projects.",
    "Organised training days for 150 volunteers.",
    "Wrote donor reports that secured two renewals.",
  ]),
  role("City of Leeds Council", "Policy Assistant", "Leeds, United Kingdom", "2008-09", "2010-05", "Worked in the public health policy team.", [
    "Researched and summarised evidence for three local health strategies.",
    "Drafted answers to public enquiries and councillor questions.",
    "Helped organise a city-wide wellbeing survey with 4,000 responses.",
  ]),
  role("Harlow Community Trust", "Research Intern", "Leeds, United Kingdom", "2008-01", "2008-08", "Short placement during the final year of studies.", [
    "Interviewed 40 residents for a study on access to local services.",
    "Prepared tables and charts for the trust's annual report.",
  ]),
];

export const case12: Case = {
  id: "12-long-four-pages",
  variant: "one",
  contactTitle: "Contact",
  pages: 4,
  content: cv(
    "en",
    {
      fullName: "Margaret Osei",
      titles: ["Programme Director", "Global Health"],
      email: "margaret.osei@example.com",
      phone: "+40 700 000 112",
      location: "Manchester, United Kingdom",
      website: "margaretosei.example.com",
      linkedin: "linkedin.com/in/margaret-osei-example",
      summary:
        "Programme director with sixteen years in public health and humanitarian work. I turn complex funding and field realities into programmes that run on time, stay on budget and reach the people they are meant for.",
    },
    {
      achievements: [
        { text: "Directed programmes reaching 2.1 million people across six countries." },
        { text: "Raised 6.5 million pounds in multi-year grants from institutional donors." },
        { text: "Built and led teams of up to 40 people across four time zones." },
        { text: "Introduced a monitoring framework now used by all eleven programmes at Helix." },
      ],
      experience: longRoles,
      education: [
        { school: "University of Manchester", degree: "Master of Public Health", field: "Global Health Policy", startDate: "2011", endDate: "2012", notes: "Graduated with distinction. Dissertation on community health workers in rural Ghana." },
        { school: "University of Leeds", degree: "Bachelor's degree", field: "Sociology", startDate: "2005", endDate: "2008", notes: "First class honours." },
      ],
      languages: [
        { name: "English", level: "Native" },
        { name: "Twi", level: "Fluent" },
        { name: "French", level: "Professional working proficiency" },
      ],
      certifications: [
        { name: "PMP – Project Management Professional", issuer: "Project Management Institute", date: "2017-06" },
        { name: "PRINCE2 Practitioner", issuer: "AXELOS", date: "2014-03" },
        { name: "Certified Humanitarian Professional", issuer: "CHS Alliance", date: "2019-10" },
      ],
      projects: [
        project("Mobile Data Collection Rollout", "", ["Introduced tablets and an offline reporting app to 160 clinics, replacing paper registers."]),
        project("Community Health Worker Handbook", "helixhealth.example.com/handbook", ["Wrote and field-tested a plain-language handbook now used in three countries."]),
      ],
      volunteering: [
        role("Leeds Food Bank", "Trustee", "Leeds, United Kingdom", "2014-01", "2019-12", "Served on the board of a food bank supporting 1,500 households a year.", [
          "Chaired the finance committee for three years.",
          "Led a fundraising drive that raised 85,000 pounds.",
        ]),
        role("Girls Who Code Manchester", "Mentor", "Manchester, United Kingdom", "2021-03", "", "Mentor teenage girls in a weekly after-school coding club.", [
          "Run monthly sessions on careers in technology and health.",
        ], true),
      ],
      awards: [
        { name: "Public Health Leader of the Year", issuer: "UK Global Health Network", date: "2022-11", description: "Awarded for leadership of the maternal health programme in West Africa." },
        { name: "Chair's Award", issuer: "Northern Relief Alliance", date: "2016-07", description: "Awarded for the response to the 2015 winter floods." },
      ],
      courses: [
        { name: "Leading Complex Programmes", provider: "London School of Hygiene and Tropical Medicine", date: "2018-05" },
        { name: "Donor Relations and Grant Writing", provider: "Bond", date: "2015-02" },
        { name: "Safeguarding for Managers", provider: "Humentum", date: "2016-11" },
      ],
      publications: [
        { title: "Community health workers and maternal outcomes in rural West Africa", publisher: "Journal of Global Health Practice", date: "2019-08", url: "" },
        { title: "Counting what counts: monitoring frameworks for small programmes", publisher: "Development in Practice", date: "2021-04", url: "" },
      ],
      interests: [{ name: "long-distance running" }, { name: "community gardening" }, { name: "choir singing" }],
      custom: [{ title: "References", details: "Available on request." }],
      skills: {
        tech: ["DHIS2", "Power BI", "Microsoft Project", "KoBoToolbox"],
        prof: ["Programme management", "Donor relations", "Budget management", "Monitoring and evaluation", "Team leadership", "Stakeholder engagement", "Safeguarding"],
        unclear: ["Advanced skills"],
      },
    },
  ),
  sections: [
    { heading: "Profile", category: "summary" },
    { heading: "Key Achievements", category: "achievements" },
    { heading: "Professional Experience", category: "experience" },
    { heading: "Skills", category: "skills" },
    { heading: "Education", category: "education" },
    { heading: "Certifications", category: "certifications" },
    { heading: "Projects", category: "projects" },
    { heading: "Volunteering", category: "volunteering" },
    { heading: "Awards", category: "awards" },
    { heading: "Training Courses", category: "courses" },
    { heading: "Publications", category: "publications" },
    { heading: "Languages", category: "languages" },
    { heading: "Interests", category: "interests" },
    { heading: "References", category: "other" },
  ],
};
