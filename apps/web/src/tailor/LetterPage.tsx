import type { ReactNode } from "react";
import type { CvContent, TailorLanguage } from "@resumora/shared";

/** The words the app adds around the body, in the letter's language (not the app's UI language). */
const WORDS: Record<TailorLanguage, { re: string; dear(name: string): string; team: string; regards: string }> = {
  en: { re: "Re:", dear: (name) => `Dear ${name},`, team: "Dear Hiring Team,", regards: "Kind regards," },
  ro: { re: "Ref.:", dear: (name) => `Bună ziua, ${name},`, team: "Stimată echipă de recrutare,", regards: "Cu stimă," },
  fr: { re: "Objet :", dear: (name) => `Bonjour ${name},`, team: "Madame, Monsieur,", regards: "Cordialement," },
  de: { re: "Betreff:", dear: (name) => `Guten Tag ${name},`, team: "Sehr geehrte Damen und Herren,", regards: "Mit freundlichen Grüßen" },
  es: { re: "Asunto:", dear: (name) => `Estimado/a ${name}:`, team: "Estimado equipo de selección:", regards: "Atentamente," },
  it: { re: "Oggetto:", dear: (name) => `Gentile ${name},`, team: "Gentile team di selezione,", regards: "Cordiali saluti," },
};

/** The app-added lines of a letter, shared with the exports so the page and the files say the same thing. */
export function letterWords(locale: TailorLanguage, input: { role: string; company: string; hiringManager: string | null; date: Date }) {
  const words = WORDS[locale];
  const manager = input.hiringManager?.trim();
  return {
    date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(input.date),
    re: `${words.re} ${[input.role, input.company].filter(Boolean).join(", ")}`,
    greeting: manager ? words.dear(manager) : words.team,
    signOff: words.regards,
  };
}

type Props = {
  basics: CvContent["basics"];
  locale: TailorLanguage;
  role: string;
  company: string;
  hiringManager: string | null;
  date: Date;
  body: ReactNode;
};

/** The letter as a page: name and contact from the CV header, date, Re: line, greeting, body, signature. */
export function LetterPage({ basics, locale, role, company, hiringManager, date, body }: Props) {
  const words = letterWords(locale, { role, company, hiringManager, date });
  const contact = [basics.email, basics.phone, basics.location, basics.website, basics.linkedin].filter((part) => part?.trim()).join(" · ");
  return (
    <article className="letter-page" lang={locale}>
      <header className="letter-head">
        <p className="letter-name">{basics.fullName}</p>
        {contact && <p>{contact}</p>}
      </header>
      <p>{words.date}</p>
      <p className="letter-re">{words.re}</p>
      <p>{words.greeting}</p>
      {body}
      <p className="letter-close">{words.signOff}</p>
      <p>{basics.fullName}</p>
    </article>
  );
}
