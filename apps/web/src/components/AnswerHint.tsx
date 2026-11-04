import type { CoachingQuestion } from "@resumora/contracts/intelligence/experience";
import { useCopy } from "./ui";

export function answerHint(
  question: CoachingQuestion,
  t: (ro: string, en: string) => string,
) {
  if (question.hint) return question.hint;
  const hints: Record<CoachingQuestion["dimension"], [string, string]> = {
    ownership: [
      "Pornește de la o activitate concretă: ce ai făcut tu, ce ai pregătit sau decis și pentru cine. Separă contribuția ta de cea a echipei.",
      "Start with one concrete activity: what you personally did, prepared or decided, and for whom. Distinguish your contribution from the team’s.",
    ],
    tools: [
      "Numește instrumentul sau metoda folosită și spune la ce te ajuta în această activitate. Nu trebuie să fie un instrument tehnic.",
      "Name the tool or method you used and what it helped you do in this activity. It does not have to be a technical tool.",
    ],
    scale: [
      "Gândește-te la echipele, clienții sau locațiile implicate și la frecvența activității. Cifrele sunt utile doar dacă ți le amintești.",
      "Think about the teams, clients or locations involved and how often you did this work. Include numbers only if you remember them.",
    ],
    impact: [
      "Spune cine folosea munca ta și ce putea face sau decide cu ajutorul ei. Dacă nu cunoști rezultatul, explică scopul activității.",
      "Say who used your work and what it helped them do or decide. If you do not know the result, explain the purpose of the work.",
    ],
  };
  return t(...hints[question.dimension]);
}

export function AnswerHint({
  question,
  id,
  locale,
}: {
  question: CoachingQuestion;
  id: string;
  locale?: string;
}) {
  const t = useCopy();
  const primary = locale?.split("-")[0];
  const cv = primary
    ? (ro: string, en: string) =>
        primary === "ro" ? ro : primary === "en" ? en : ""
    : t;
  const examples: Record<CoachingQuestion["dimension"], [string, string]> = {
    ownership: [
      "Am pregătit raportul săptămânal și am verificat datele înainte de a-l trimite echipei.",
      "I prepared the weekly report and checked the data before sharing it with the team.",
    ],
    tools: [
      "Am folosit filtre în Excel pentru a identifica înregistrările incomplete înainte de raportare.",
      "I used Excel filters to identify incomplete records before reporting.",
    ],
    scale: [
      "Pregăteam un raport în fiecare săptămână pentru echipa de vânzări.",
      "I prepared a report each week for the sales team.",
    ],
    impact: [
      "Echipa folosea raportul meu săptămânal pentru a identifica comenzile întârziate și a prioritiza urmărirea lor.",
      "The team used my weekly report to identify delayed orders and prioritize follow-up.",
    ],
  };
  return (
    <aside
      className="guided-answer-hint"
      id={id}
      aria-label={t("Indiciu pentru răspuns", "Answer guidance")}
    >
      <p>{answerHint(question, cv)}</p>
      {(!primary || primary === "ro" || primary === "en") && (
        <details>
          <summary>{t("Vezi un exemplu", "See an example")}</summary>
          <p>{cv(...examples[question.dimension])}</p>
          <small>
            {t(
              "Exemplu orientativ. Folosește propriile detalii; nu trebuie să ai cifre sau rezultate măsurate.",
              "Illustrative example. Use your own details; numbers or measured results are not required.",
            )}
          </small>
        </details>
      )}
    </aside>
  );
}
