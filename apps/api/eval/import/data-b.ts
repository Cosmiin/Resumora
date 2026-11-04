import { cv, role, type Case } from "./types.ts";

export const case05: Case = {
  id: "05-layout-tables",
  variant: "tables",
  contactTitle: "Personal details",
  labels: { first: "Given name", last: "Surname", email: "Email", phone: "Phone", location: "Address" },
  content: cv(
    "en",
    {
      fullName: "Hannah Brooks",
      firstName: "Hannah",
      lastName: "Brooks",
      titles: ["Operations Manager"],
      email: "hannah.brooks@example.com",
      phone: "+40 700 000 055",
      location: "Brașov, Romania",
      summary: "Operations manager with a background in logistics. I keep warehouses, drivers and customers moving on time.",
    },
    {
      experience: [
        role("Carpathia Logistics", "Operations Manager", "Brașov, Romania", "2019-04", "", "Run daily operations for a 120-person distribution centre.", [
          "Reduced late deliveries from 9% to 3% by redesigning the dispatch schedule.",
          "Introduced a weekly safety review that cut reported incidents by half.",
        ], true),
        role("TransAlp Cargo", "Shift Supervisor", "Brașov, Romania", "2014-08", "2019-03", "Supervised a team of 25 loaders and drivers.", [
          "Trained 14 new team members on the warehouse management system.",
        ]),
      ],
      education: [
        { school: "Transilvania University of Brașov", degree: "Bachelor's degree", field: "Logistics Management", startDate: "2010", endDate: "2014", notes: "" },
      ],
      languages: [
        { name: "English", level: "Fluent" },
        { name: "German", level: "Intermediate" },
      ],
      skills: {
        tech: ["SAP", "Excel"],
        prof: ["Route planning", "Inventory control", "Team leadership"],
        unclear: ["Management"],
      },
    },
  ),
  sections: [
    { heading: "Profile", category: "summary" },
    { heading: "Experience", category: "experience" },
    { heading: "Skills", category: "skills" },
    { heading: "Education", category: "education" },
    { heading: "Languages", category: "languages" },
  ],
};

export const case06: Case = {
  id: "06-icon-headings",
  variant: "icons",
  contactTitle: "",
  content: cv(
    "en",
    {
      fullName: "Omar Haddad",
      titles: ["Sales Lead"],
      email: "omar.haddad@example.com",
      phone: "+40 700 000 066",
      location: "Constanța, Romania",
      linkedin: "linkedin.com/in/omar-haddad-example",
      summary: "Sales lead for industrial equipment. I build long relationships with customers who buy once a decade.",
    },
    {
      experience: [
        role("Marea Neagră Machinery", "Sales Lead", "Constanța, Romania", "2018-02", "", "Responsible for port and shipyard customers.", [
          "Closed the largest contract in the company's history, worth 2.4 million euro.",
          "Grew the customer list from 35 to 61 active accounts.",
        ], true),
        role("PortTech", "Sales Representative", "Constanța, Romania", "2014-05", "2018-01", "Sold cranes and spare parts.", [
          "Exceeded the yearly target in four of the last four years.",
        ]),
      ],
      education: [
        { school: "Ovidius University of Constanța", degree: "Bachelor's degree", field: "Economics", startDate: "2010", endDate: "2014", notes: "" },
      ],
      languages: [
        { name: "Arabic", level: "Native" },
        { name: "English", level: "Fluent" },
        { name: "French", level: "Conversational" },
      ],
      skills: {
        tech: ["Salesforce", "SAP"],
        prof: ["Negotiation", "Account management", "Contract drafting"],
      },
    },
  ),
  sections: [
    { heading: "Profile", category: "summary" },
    { heading: "Work History", category: "experience" },
    { heading: "Key Skills", category: "skills" },
    { heading: "Education", category: "education" },
    { heading: "Languages", category: "languages" },
  ],
};

export const case07: Case = {
  id: "07-romanian",
  variant: "one",
  contactTitle: "Date personale",
  labels: { first: "Prenume", last: "Nume de familie", email: "E-mail", phone: "Telefon", location: "Adresă" },
  content: cv(
    "ro",
    {
      fullName: "Ana-Maria Țârcă",
      firstName: "Ana-Maria",
      lastName: "Țârcă",
      titles: ["Specialist Resurse Umane"],
      email: "ana-maria.tarca@example.com",
      phone: "+40 700 000 077",
      location: "Sibiu, România",
      summary:
        "Specialist în resurse umane cu opt ani de experiență în recrutare și relații cu angajații. Îmi place să construiesc procese simple și corecte pentru oameni.",
    },
    {
      experience: [
        role("Transilvania Industrial", "Specialist Resurse Umane", "Sibiu, România", "2020-09", "", "Răspund de recrutarea și integrarea pentru o fabrică cu 300 de angajați.", [
          "Am redus timpul mediu de angajare de la 45 la 28 de zile.",
          "Am introdus un program de integrare pentru angajații noi, cu mentor din echipă.",
          "Am organizat două târguri de joburi în colaborare cu universitatea din Sibiu.",
        ], true),
        role("Carpați Servicii", "Recruiter", "Sibiu, România", "2016-03", "2020-08", "Recrutare pentru poziții administrative și tehnice.", [
          "Am recrutat peste 120 de persoane în patru ani.",
          "Am pregătit contractele și dosarele de personal pentru angajații noi.",
        ]),
      ],
      education: [
        { school: "Universitatea „Lucian Blaga” din Sibiu", degree: "Licență", field: "Psihologie", startDate: "2012", endDate: "2016", notes: "" },
      ],
      languages: [
        { name: "Română", level: "Nativă" },
        { name: "Engleză", level: "Avansat (C1)" },
        { name: "Germană", level: "Începător (A2)" },
      ],
      certifications: [{ name: "Specialist în Managementul Resurselor Umane", issuer: "CNFPA", date: "2019-06" }],
      interests: [{ name: "drumeții montane" }, { name: "fotografie" }, { name: "șah" }],
      skills: {
        tech: ["Excel", "Revisal", "LinkedIn Recruiter"],
        prof: ["Recrutare", "Interviuri structurate", "Comunicare", "Legislația muncii"],
      },
    },
  ),
  sections: [
    { heading: "Profil", category: "summary" },
    { heading: "Experiență profesională", category: "experience" },
    { heading: "Competențe", category: "skills" },
    { heading: "Educație și formare", category: "education" },
    { heading: "Limbi străine", category: "languages" },
    { heading: "Certificări", category: "certifications" },
    { heading: "Interese", category: "interests" },
  ],
};

export const case08: Case = {
  id: "08-odd-headings",
  variant: "one",
  contactTitle: "Say hello",
  content: cv(
    "en",
    {
      fullName: "Nadia Okafor",
      titles: ["Full-stack Developer"],
      email: "nadia.okafor@example.com",
      phone: "+40 700 000 088",
      location: "Oradea, Romania",
      website: "nadiaokafor.example.com",
      summary: "I build web apps for small teams, from the database to the button. I enjoy products where one person can see the whole picture.",
    },
    {
      experience: [
        role("Kiln Studio", "Full-stack Developer", "Oradea, Romania", "2021-01", "", "Develop booking tools for craft studios and small galleries.", [
          "Shipped a booking calendar that now handles 3,000 reservations a month.",
          "Replaced a spreadsheet-based invoicing process with an automated one.",
        ], true),
        role("Freelance", "Web Developer", "Remote", "2018-06", "2020-12", "Websites and small tools for local businesses.", [
          "Delivered 17 projects for clients in four countries.",
        ]),
      ],
      projects: [
        { name: "Potluck", description: "A free app for planning shared dinners, used by about 800 people.", url: "potluck.example.com" },
        { name: "Tidemark", description: "An open-source tool that checks websites for broken links.", url: "github.com/nadia-example/tidemark" },
      ],
      education: [
        { school: "University of Oradea", degree: "Bachelor's degree", field: "Computer Science", startDate: "2014", endDate: "2018", notes: "" },
      ],
      interests: [{ name: "bouldering" }, { name: "pottery" }, { name: "board games" }],
      skills: {
        tech: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker"],
        prof: ["Product thinking", "Clear writing"],
      },
    },
  ),
  sections: [
    { heading: "A bit about me", category: "summary" },
    { heading: "Where I've worked", category: "experience" },
    { heading: "What I've built", category: "projects" },
    { heading: "Toolbox", category: "skills" },
    { heading: "Where I studied", category: "education" },
    { heading: "Hobby-uri", category: "interests" },
  ],
};

export const case09: Case = {
  id: "09-no-skills",
  variant: "one",
  contactTitle: "Contact",
  content: cv(
    "en",
    {
      fullName: "Rachel Tan",
      titles: ["Project Coordinator"],
      email: "rachel.tan@example.com",
      phone: "+40 700 000 099",
      location: "Cluj-Napoca, Romania",
      summary: "Project coordinator for construction and renovation work. I make sure the right people are on site on the right day.",
    },
    {
      experience: [
        role("Habitat Build", "Project Coordinator", "Cluj-Napoca, Romania", "2019-07", "", "Coordinate renovation projects for apartment buildings.", [
          "Delivered 22 renovation projects on schedule over five years.",
          "Kept a shared plan that contractors and owners could both read.",
        ], true),
        role("Dacia Construct", "Site Assistant", "Cluj-Napoca, Romania", "2016-09", "2019-06", "Supported the site manager on residential projects.", [
          "Prepared weekly progress reports for three sites.",
        ]),
      ],
      education: [
        { school: "Technical University of Cluj-Napoca", degree: "Bachelor of Engineering", field: "Civil Engineering", startDate: "2012", endDate: "2016", notes: "" },
      ],
      languages: [
        { name: "English", level: "Fluent" },
        { name: "Romanian", level: "Native" },
      ],
      volunteering: [
        role("Habitat for Humanity", "Volunteer Builder", "Cluj-Napoca, Romania", "2017-04", "2022-09", "Weekend builds for families in need.", [
          "Helped finish nine houses over five years.",
        ]),
      ],
      awards: [{ name: "Employee of the Year", issuer: "Habitat Build", date: "2022-12", description: "Awarded for delivering all projects on schedule." }],
    },
  ),
  sections: [
    { heading: "Profile", category: "summary" },
    { heading: "Experience", category: "experience" },
    { heading: "Education", category: "education" },
    { heading: "Languages", category: "languages" },
    { heading: "Volunteer Work", category: "volunteering" },
    { heading: "Awards", category: "awards" },
  ],
};
