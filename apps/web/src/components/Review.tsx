import { allFacts, hasValue, isAuthored, type BaseDraft } from "../base/model";
import { validateDraft } from "../base/validation";
import { Button, Pill, useCopy } from "./ui";
export function Review({
  draft,
  edit,
  enrich,
}: {
  draft: BaseDraft;
  edit: () => void;
  enrich: () => void;
}) {
  const t = useCopy(),
    pending = allFacts(draft).filter(
      (f) => hasValue(f.value) && !isAuthored(f),
    ).length;
  const incomplete = validateDraft(draft).length;
  const checks = [
    {
      title: t("Conținut", "Content"),
      state:
        pending || incomplete
          ? t("Necesită atenție", "Needs action")
          : t("Informații auto-declarate", "Self-reported facts"),
      text: pending
        ? `${pending} ${t("informații necesită verificare.", "facts need review.")}`
        : incomplete
          ? `${incomplete} ${t("câmpuri necesită completare.", "fields need completion.")}`
          : t(
              "Informațiile introduse sunt auto-declarate. Secțiunile opționale pot rămâne goale.",
              "Entered facts are self-reported. Optional sections may remain empty.",
            ),
      action: edit,
    },
    {
      title: t("Structură și format", "Structure and format"),
      state: t("În așteptare", "Pending"),
      text: t(
        "Previzualizarea folosește secțiuni structurate. Lizibilitatea unui fișier PDF nu a fost testată.",
        "The preview uses structured sections. PDF file readability has not been tested.",
      ),
      action: edit,
    },
    {
      title: t("Optimizare pentru job", "Job optimization"),
      state: t("Nu se aplică", "Not applicable"),
      text: t(
        "Nu este selectat un job. Adaptarea și scorurile de compatibilitate nu sunt disponibile.",
        "No job is selected. Tailoring and compatibility scores are unavailable.",
      ),
    },
    {
      title: t("Calitatea redactării", "Writing quality"),
      state: t("De revizuit", "Needs review"),
      text: t(
        "Verifică textul în cuvintele tale. Poți adăuga context prin întrebări, fără generare AI.",
        "Review your wording. Questions can help add context; AI generation is unavailable.",
      ),
      action: enrich,
    },
    {
      title: t("Pregătire pentru aplicare", "Application readiness"),
      state: t("În așteptare", "Pending"),
      text: t(
        "Acest CV de bază nu are un export verificat sau o candidatură asociată.",
        "This Base CV has no verified export or associated application.",
      ),
    },
  ];
  return (
    <div className="stack">
      <p className="muted">
        {t(
          "Cinci verificări, fiecare cu un pas următor. Nu reprezintă un scor.",
          "Five checks, each with a next step. These are not a score.",
        )}
      </p>
      {checks.map((c) => (
        <section className="card review-check" key={c.title}>
          <div className="section-heading">
            <h2>{c.title}</h2>
            <Pill>{c.state}</Pill>
          </div>
          <p>{c.text}</p>
          {c.action && (
            <Button onClick={c.action}>
              {c.action === enrich
                ? t("Răspunde la întrebări", "Answer questions")
                : t("Revizuiește în editor", "Review in editor")}
            </Button>
          )}
        </section>
      ))}
    </div>
  );
}
