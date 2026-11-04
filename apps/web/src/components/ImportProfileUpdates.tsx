import { ImportSkills } from "./ImportSkills";
import {
  ImportComparison,
  ImportSourceAction,
  type ImportView,
} from "./ImportComparison";
import type { IntelligenceClient } from "../base/intelligence";
import { useWorkspaceDraft, DraftStatus } from "../workspace/context";
import { equalValues } from "../base/model";
import { useEffect, useRef, useState } from "react";
import {
  importedDraft,
  pendingImportedCandidates,
  pendingImportSkills,
} from "@resumora/contracts/editor/import";
import type { ImportReview } from "@resumora/contracts/intelligence/model";
import type { BaseDraft } from "../base/model";
import {
  applyProfileImport,
  currentUpdateText,
  identityComparison,
  profileImportUpdates,
  type ImportUpdate,
} from "../base/import-updates";
import { Button, useCopy } from "./ui";

export function ImportProfileUpdates({
  profile,
  review,
  disabled,
  apply,
  cancel,
  profileRevision = 0,
  client,
}: {
  client?: IntelligenceClient;
  profileRevision?: number;
  profile: BaseDraft;
  review: ImportReview;
  disabled: boolean;
  apply: (next: BaseDraft, original: BaseDraft) => boolean;
  cancel: () => void;
}) {
  const t = useCopy();
  // A review is mounted by import ID. Changing the document resets every choice.
  const [initialIncoming] = useState(() => importedDraft(review));
  const [focused, setFocused] = useState<string>(),
    [view, setView] = useState<ImportView>("information");
  const [ownerConfirmed, setOwnerState] = useState(false);
  const [selected, setSelectedState] = useState<string[]>([]);
  const [targets, setTargetsState] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const profilePin = `${profile.id}:${profileRevision}`;
  const reviewDraft = useWorkspaceDraft("import-review", review.id, {
    draft: initialIncoming,
    selected: [] as string[],
    targets: {} as Record<string, string>,
    ownerConfirmed: false,
    profileId: profile.id,
    profileFingerprint: profilePin,
  });
  const incoming = reviewDraft.value.draft ?? initialIncoming;
  const validIncoming =
    incoming.importReview?.id === review.id &&
    incoming.importReview?.sourceHash === review.sourceHash;
  const restoredPin = useRef(""),
    initialProfile = useRef(profile);
  useEffect(() => {
    setOwnerState(false);
    setSelectedState([]);
    setTargetsState({});
    setError("");
  }, [profile]);
  useEffect(() => {
    if (
      reviewDraft.ready &&
      reviewDraft.durable &&
      restoredPin.current !== profilePin
    ) {
      restoredPin.current = profilePin;
      if (
        reviewDraft.value.profileFingerprint === profilePin &&
        equalValues(initialProfile.current, profile)
      ) {
        setOwnerState(reviewDraft.value.ownerConfirmed);
        setSelectedState(reviewDraft.value.selected);
        setTargetsState(reviewDraft.value.targets);
      }
    }
  }, [reviewDraft.ready, profilePin]);
  const persist = (
    owner: boolean,
    keys: string[],
    destinations: Record<string, string>,
  ) =>
    reviewDraft.set({
      draft: reviewDraft.controller.snapshot().value.draft ?? initialIncoming,
      ownerConfirmed: owner,
      selected: keys,
      targets: destinations,
      profileId: profile.id,
      profileFingerprint: profilePin,
    });
  const setOwnerConfirmed = (value: boolean) => {
    setOwnerState(value);
    persist(value, selected, targets);
  };
  const setSelected = (value: string[] | ((current: string[]) => string[])) => {
    const next = typeof value === "function" ? value(selected) : value;
    setSelectedState(next);
    persist(ownerConfirmed, next, targets);
  };
  const setTargets = (
    value:
      | Record<string, string>
      | ((current: Record<string, string>) => Record<string, string>),
  ) => {
    const next = typeof value === "function" ? value(targets) : value;
    setTargetsState(next);
    persist(ownerConfirmed, selected, next);
  };
  const updates = profileImportUpdates(profile, incoming);
  const identity = identityComparison(profile, incoming);
  const differs = identity.some((row) => row.differs);
  const pending = pendingImportedCandidates(profile).length > 0;
  const chosen = updates.filter((u) => selected.includes(u.key));
  const chosenTargets = chosen
    .filter((u) => u.kind === "role" || u.kind === "education")
    .map((u) => targets[u.key]);
  const invalidTargets =
    chosenTargets.some((id) => !id) ||
    new Set(chosenTargets.filter((id) => id !== "new")).size !==
      chosenTargets.filter((id) => id !== "new").length;
  const fieldLabels: Record<string, string> = {
    name: t("Nume", "Name"),
    summary: t("Rezumat", "Summary"),
    titles: t("Titlu profesional", "Professional title"),
    email: "Email",
    phone: t("Telefon", "Phone"),
    location: t("Locație", "Location"),
    linkedin: "LinkedIn",
    website: t("Website personal", "Personal website"),
    professionalSkills: t("Competență profesională", "Professional skill"),
    technicalSkills: t("Competență tehnică", "Technical skill"),
    certifications: t("Certificare", "Certification"),
    languages: t("Limbă", "Language"),
    custom: t("Altă categorie", "Other category"),
    title: t("Titlu", "Title"),
    company: t("Companie", "Company"),
    start: t("Început", "Start"),
    end: t("Sfârșit", "End"),
    ongoing: t("În curs", "Ongoing"),
    context: t("Descriere", "Description"),
    bullets: t("Contribuție", "Contribution"),
    institution: t("Instituție", "Institution"),
    qualification: t("Calificare", "Qualification"),
    field: t("Domeniu", "Field"),
    details: t("Detalii", "Details"),
    proficiency: t("Nivel", "Level"),
  };
  function label(update: ImportUpdate) {
    if (update.kind === "role")
      return `${t("Experiență", "Experience")} ${update.index! + 1}`;
    if (update.kind === "education")
      return `${t("Educație", "Education")} ${update.index! + 1}`;
    return (
      fieldLabels[update.key] ??
      fieldLabels[update.path.split(".")[0]] ??
      fieldLabels[update.path.split(".")[1]]
    );
  }
  return (
    <section
      className="stack import-profile-updates"
      aria-labelledby="import-update-heading"
    >
      <header className="import-overview-heading">
        <h2>{t("Verifică actualizările din CV", "Review your CV updates")}</h2>
        <p>
          {t(
            `${updates.length} actualizări disponibile. Alege ce adaugi sau modifici; informațiile neselectate rămân neschimbate.`,
            `${updates.length} updates available. Choose what to add or change; unselected information stays unchanged.`,
          )}
        </p>
      </header>
      <ImportSkills
        draft={incoming}
        disabled={disabled || !reviewDraft.ready || !validIncoming}
        change={(draft) =>
          reviewDraft.set({ ...reviewDraft.controller.snapshot().value, draft })
        }
      />
      <ImportComparison
        review={review}
        client={client}
        candidate={
          review.extraction.candidates.find((c) => c.id === focused) ??
          review.extraction.candidates[0]
        }
        view={view}
        onViewChange={setView}
      >
        <div className="stack">
          <DraftStatus draft={reviewDraft} />
          <h3 id="import-update-heading">
            {differs
              ? t(
                  "Acest CV poate aparține altei persoane",
                  "This CV may belong to someone else",
                )
              : t(
                  "Verifică actualizările profilului",
                  "Review profile updates",
                )}
          </h3>
          <p>
            {t(
              "Un profil reprezintă o singură persoană. Numele și datele de contact pot fi schimbate legitim, dar experiența altei persoane nu trebuie combinată cu a ta. Nimic din acest import nu a fost adăugat profilului.",
              "One profile represents one person. Names and contact details can legitimately change, but another person's experience should not be mixed with yours. Nothing from this import has been added to your profile.",
            )}
          </p>
          {!incoming.name.value.trim() && (
            <p className="notice">
              {t(
                "Nu am identificat un nume în document. Verifică atent cui aparține.",
                "No name was identified in the document. Check carefully who it belongs to.",
              )}
            </p>
          )}
          <details open={differs} className="import-identity-details">
            <summary>
              {t(
                "Compară numele și datele de contact",
                "Compare name and contact details",
              )}
            </summary>
            <dl className="import-identity-comparison">
              {identity.map((row) => (
                <div
                  key={row.key}
                  className={row.differs ? "notice" : undefined}
                >
                  <dt>
                    {fieldLabels[row.key]}
                    {row.differs ? ` · ${t("diferă", "differs")}` : ""}
                  </dt>
                  <dd>
                    {t("În profil: ", "In your profile: ")}
                    {row.current || t("Lipsește", "Not provided")}
                  </dd>
                  <dd>
                    {t("În document: ", "In the document: ")}
                    {row.incoming || t("Lipsește", "Not provided")}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
          <label className="check-label">
            <input
              type="checkbox"
              checked={ownerConfirmed}
              onChange={(e) => {
                setOwnerConfirmed(e.target.checked);
                setError("");
              }}
            />
            {t(
              "Confirm că acest CV îmi aparține și actualizează profilul meu.",
              "I confirm this CV belongs to me and updates my own profile.",
            )}
          </label>
          <p className="small muted">
            {t(
              "Alege doar informațiile pe care vrei să le folosești. Datele absente din document, răspunsurile de îmbogățire și fotografia se păstrează. Pentru un rol existent, păstrăm răspunsurile și contribuțiile anterioare; câmpurile afișate se actualizează, iar contribuțiile noi se adaugă.",
              "Choose only the information you want to use. Information absent from the document, enrichment answers and your photo are kept. For an existing role, answers and previous contributions stay; displayed fields are updated and new contributions are added.",
            )}
          </p>
          {!!review.extraction.warnings.length && (
            <details>
              <summary>{t("Observații despre import", "Import notes")}</summary>
              <p>{review.extraction.warnings.join(" · ")}</p>
            </details>
          )}
          {!!review.extraction.omittedPages.length && (
            <p className="notice">
              {t("Pagini neprocesate: ", "Unprocessed pages: ")}
              {review.extraction.omittedPages.join(", ")}
            </p>
          )}
          {updates.map((update) => {
            const title = label(update);
            const entries =
              update.kind === "role"
                ? profile.roles
                : update.kind === "education"
                  ? profile.education
                  : [];
            const current = currentUpdateText(
              profile,
              update,
              targets[update.key],
            );
            return (
              <div className="card stack" key={update.key}>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={selected.includes(update.key)}
                    onChange={(e) => {
                      setSelected((values) =>
                        e.target.checked
                          ? [...values, update.key]
                          : values.filter((key) => key !== update.key),
                      );
                      setError("");
                    }}
                  />
                  {t("Folosește: ", "Use: ")}
                  {title}
                </label>
                {(update.kind === "role" || update.kind === "education") && (
                  <label>
                    {t(
                      "Unde se aplică această informație?",
                      "Where should this information go?",
                    )}
                    <select
                      className="native"
                      aria-label={`${t("Destinație", "Destination")}: ${title}`}
                      value={targets[update.key] ?? ""}
                      onChange={(e) => {
                        setTargets((values) => ({
                          ...values,
                          [update.key]: e.target.value,
                        }));
                        setError("");
                      }}
                    >
                      <option value="">
                        {t("Alege o destinație", "Choose a destination")}
                      </option>
                      <option value="new">
                        {t("Adaugă o intrare nouă", "Add a new entry")}
                      </option>
                      {entries.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {"company" in entry
                            ? `${entry.title.value} · ${entry.company.value}`
                            : `${entry.qualification.value} · ${entry.institution.value}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p className="small">
                  <strong>{t("În profil: ", "In your profile: ")}</strong>
                  {current || t("Informație nouă", "New information")}
                </p>
                <p className="small">
                  <strong>{t("Din document: ", "From the document: ")}</strong>
                  {update.incoming}
                </p>
                <ImportSourceAction
                  onSelect={() => setFocused(update.candidateIds[0])}
                />
                <details>
                  <summary>
                    {t(
                      "Câmpuri și citate din document",
                      "Fields and document excerpts",
                    )}
                  </summary>
                  {update.candidateIds.map((id) => {
                    const candidate = review.extraction.candidates.find(
                      (c) => c.id === id,
                    )!;
                    const property = candidate.path
                      .split(".")
                      .filter((p) => !/^\d+$/.test(p))
                      .at(-1)!;
                    return (
                      <div key={id} className="small">
                        <p>
                          <strong>{fieldLabels[property] ?? title}: </strong>
                          {candidate.value}
                        </p>
                        <blockquote>{candidate.quote}</blockquote>
                        {candidate.warning && (
                          <p className="notice">{candidate.warning}</p>
                        )}
                      </div>
                    );
                  })}
                </details>
              </div>
            );
          })}
          {!updates.length && (
            <p>
              {t(
                "Nu am găsit informații noi în câmpurile comparate. Profilul tău rămâne neschimbat.",
                "No new information was found in the compared fields. Your profile stays unchanged.",
              )}
            </p>
          )}
          {pending && (
            <p role="status">
              {t(
                "Încheie verificarea importului curent înainte de a aplica altul. Profilul rămâne neschimbat.",
                "Finish reviewing your current import before applying another one. Your profile stays unchanged.",
              )}
            </p>
          )}
          {invalidTargets && (
            <p className="small">
              {t(
                "Alege o destinație pentru fiecare rol sau studiu selectat. Nu aplica două intrări aceleiași destinații într-un singur pas.",
                "Choose a destination for each selected experience or education entry. Do not apply two entries to the same destination in one step.",
              )}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <p className="small muted">
            {t(
              "Selecțiile de mai sus nu sunt aplicate până când alegi să le folosești. Selecțiile confirmate ca salvate revin când redeschizi acest import pentru aceeași versiune a profilului.",
              "These selections are not applied until you choose to use them. Acknowledged selections return when you reopen this import for the same profile version.",
            )}
          </p>
        </div>
      </ImportComparison>
      <div className="actions import-review-actions">
        <Button
          variant="primary"
          disabled={
            pendingImportSkills(incoming).length > 0 ||
            disabled ||
            !validIncoming ||
            (reviewDraft.durable && !reviewDraft.ready) ||
            pending ||
            !ownerConfirmed ||
            !chosen.length ||
            invalidTargets
          }
          onClick={() => {
            try {
              if (
                !apply(
                  applyProfileImport(
                    profile,
                    review,
                    chosen.map((u) => u.key),
                    targets,
                    incoming.importSkillChoices,
                  ),
                  profile,
                )
              )
                setError(
                  t(
                    "Profilul s-a schimbat sau o salvare nu este încheiată. Verifică din nou înainte de a aplica.",
                    "The profile changed or a save is unresolved. Review again before applying.",
                  ),
                );
            } catch {
              setError(
                t(
                  "Nu am aplicat modificările. Verifică selecția și destinațiile.",
                  "No changes were applied. Check your selection and destinations.",
                ),
              );
            }
          }}
        >
          {t(
            `Aplică ${chosen.length} actualizări selectate`,
            `Apply ${chosen.length} selected updates`,
          )}
        </Button>
        <Button
          onClick={() => {
            persist(false, [], {});
            cancel();
          }}
        >
          {t("Renunță la actualizare", "Cancel update")}
        </Button>
      </div>
    </section>
  );
}
