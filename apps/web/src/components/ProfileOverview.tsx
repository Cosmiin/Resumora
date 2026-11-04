import { experienceTargets } from "@resumora/contracts/intelligence/experience";
import { RoleText } from "./RoleText";
import { ProfileDocument } from "./ProfileDocument";
import { stripListMarker } from "@resumora/contracts/editor/content";
import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import type { BaseDraft } from "../base/model";
import { currentWording } from "../base/wording";
import {
  formatDate,
  currentMonth,
  experienceDuration,
  formatExperienceDuration,
} from "../base/dates";
import { Button, useCopy } from "./ui";
export function ProfileOverview({
  draft,
  editor,
  enrichTarget,
  enrich,
  openEnrichment,
  closeEnrichment,
  change,
  summarize,
  aiReady,
  skillsImproving = false,
  asOf = currentMonth(),
}: {
  asOf?: { year: string; month: string };
  draft: BaseDraft;
  editor: ReactNode;
  enrichTarget?: string;
  enrich: (id: string) => ReactNode;
  openEnrichment: (id: string) => void;
  closeEnrichment: () => void;
  change?: (draft: BaseDraft) => void;
  summarize?: Parameters<typeof ProfileDocument>[0]["summarize"];
  aiReady?: boolean;
  skillsImproving?: boolean;
}) {
  const t = useCopy();
  const [questionIntent, setQuestionIntent] = useState<string>();
  const [skippedRoles, setSkippedRoles] = useState<string[]>([]),
    [working, setWorking] = useState<Record<string, boolean>>({});
  const setRoleBusy = useCallback(
    (id: string, busy: boolean) =>
      setWorking((old) => (old[id] === busy ? old : { ...old, [id]: busy })),
    [],
  );
  useEffect(() => {
    setSkippedRoles([]);
    setWorking({});
  }, [draft.id]);
  useEffect(() => {
    if (!enrichTarget) setQuestionIntent(undefined);
  }, [enrichTarget]);
  const busy = Object.values(working).some(Boolean);
  function closeDocumentEnrichment() {
    const target = enrichTarget;
    closeEnrichment();
    if (change && target)
      requestAnimationFrame(() => {
        const role = document.getElementById(`profile-role-${target}`);
        const trigger = role?.querySelector<HTMLElement>(
          "[data-improve-experience]",
        );
        (trigger ?? role)?.focus({ preventScroll: true });
        (trigger ?? role)?.scrollIntoView?.({
          block: "nearest",
          behavior: "auto",
        });
      });
  }
  function nextRole(id: string, skip: boolean) {
    const targets = experienceTargets(draft);
    const accepted = new Set(
      targets.filter((r) => !!currentWording(draft, r.id)).map((r) => r.id),
    );
    const skipped = new Set([...skippedRoles, ...(skip ? [id] : [])]);
    if (skip) setSkippedRoles([...skipped]);
    const candidates = targets.filter(
      (r) => r.id !== id && !accepted.has(r.id) && !skipped.has(r.id),
    );
    const index = targets.findIndex((r) => r.id === id);
    const next =
      candidates.find((r) => targets.findIndex((t) => t.id === r.id) > index) ??
      candidates[0];
    if (next) openEnrichment(next.id);
    else {
      closeEnrichment();
      document
        .getElementById("profile-skills")
        ?.scrollIntoView?.({ block: "nearest" });
    }
  }
  const sections = profileSectionStates(draft, asOf);
  const missing = Object.values(sections).filter(
    (s) => s.state === "missing",
  ).length;
  const checks = Object.values(sections).filter(
    (s) => s.state === "check",
  ).length;
  return (
    <ProfileEditorContext.Provider
      value={{
        draft,
        questionIntent,
        enrichTarget,
        enrich,
        openEnrichment,
        closeEnrichment: closeDocumentEnrichment,
        asOf,
        skippedRoles,
        setSkippedRoles,
        nextRole,
        busy: busy || skillsImproving,
        setRoleBusy,
        documentMode: !!change,
      }}
    >
      {change ? (
        <>
          <ProfileDocument
            draft={draft}
            summarize={summarize}
            aiReady={aiReady}
            change={change}
            disabled={busy || skillsImproving}
            skillsImproving={skillsImproving}
            enrichTarget={
              enrichTarget === "__skills" || enrichTarget === "__improve_skills"
                ? enrichTarget
                : undefined
            }
            enrich={enrich}
            openEnrichment={(id) => {
              setQuestionIntent(id);
              openEnrichment(id);
            }}
            closeEnrichment={closeDocumentEnrichment}
          />
          {enrichTarget &&
            enrichTarget !== "__skills" &&
            enrichTarget !== "__improve_skills" &&
            enrich(enrichTarget)}
        </>
      ) : (
        <div className="stack profile-overview">
          <div className="profile-completeness" role="status">
            <p>
              {t(
                "Profilul meu este CV-ul tău de bază: informațiile și răspunsurile reutilizabile despre cariera ta.",
                "My Profile is your Base CV: reusable career information and confirmed answers.",
              )}
            </p>
            <strong>
              {missing || checks
                ? t(
                    `${missing} secțiuni de completat · ${checks} de verificat`,
                    `${missing} sections to complete · ${checks} to check`,
                  )
                : t(
                    "Informațiile profilului sunt completate",
                    "Your profile information is filled in",
                  )}
            </strong>
            <p className="small muted">
              {t(
                "Poți edita CV-ul acum și completa informațiile mai târziu. Întrebările și secțiunile suplimentare sunt opționale.",
                "You can edit your CV now and fill in details later. Questions and additional sections are optional.",
              )}
            </p>
          </div>
          {editor}
        </div>
      )}
    </ProfileEditorContext.Provider>
  );
}

export const ProfileEditorContext = createContext<{
  documentMode?: boolean;
  questionIntent?: string;
  skippedRoles: string[];
  setSkippedRoles: (ids: string[]) => void;
  nextRole: (id: string, skip: boolean) => void;
  busy: boolean;
  setRoleBusy: (id: string, busy: boolean) => void;
  draft: BaseDraft;
  asOf: { year: string; month: string };
  enrichTarget?: string;
  enrich: (id: string) => ReactNode;
  openEnrichment: (id: string) => void;
  closeEnrichment: () => void;
} | null>(null);

export type ProfileSectionState = {
  state: "missing" | "check" | "filled" | "optional";
  preview: string;
};
export function profileSectionStates(
  d: BaseDraft,
  asOf = currentMonth(),
): Record<string, ProfileSectionState> {
  const filled = (present: boolean, preview: string): ProfileSectionState => ({
    state: present ? "filled" : "missing",
    preview,
  });
  const states: Record<string, ProfileSectionState> = {
    identity: filled(
      !!d.name.value.trim() &&
        d.contacts.some((c) => c.visible && !!c.value.value.trim()),
      [d.name.value, ...d.titles.map((f) => f.value)]
        .filter(Boolean)
        .join(" · "),
    ),
    summary: filled(!!d.summary.text.trim(), d.summary.text),
    experience: filled(d.roles.length > 0, String(d.roles.length)),
    professionalSkills: filled(
      d.professionalSkills.some((f) => !!f.value.trim()),
      d.professionalSkills
        .map((f) => f.value)
        .filter(Boolean)
        .join(" · "),
    ),
    technicalSkills: filled(
      d.technicalSkills.some((f) => !!f.value.trim()),
      d.technicalSkills
        .map((f) => f.value)
        .filter(Boolean)
        .join(" · "),
    ),
    education: filled(
      d.education.some(
        (e) => e.qualification.value.trim() || e.institution.value.trim(),
      ),
      d.education
        .map((e) =>
          [e.qualification.value, e.institution.value]
            .filter(Boolean)
            .join(" · "),
        )
        .join("; "),
    ),
  };
  if (
    d.roles.length &&
    (d.roles.some(
      (r) =>
        !r.title.value.trim() ||
        !r.company.value.trim() ||
        !r.start.value.year ||
        (!r.ongoing.value && !r.end.value.year),
    ) ||
      experienceDuration(d.roles, asOf).unknown > 0 ||
      experienceDuration(d.roles, asOf).min !==
        experienceDuration(d.roles, asOf).max)
  )
    states.experience.state = "check";
  for (const s of d.optionalSections) {
    states[s.id] =
      s.kind === "languages"
        ? {
            state: !s.entries.length
              ? "missing"
              : s.entries.some(
                    (e) => !e.title.value.trim() || !e.proficiency?.value,
                  )
                ? "check"
                : "filled",
            preview: s.entries
              .map((e) => e.title.value)
              .filter(Boolean)
              .join(" · "),
          }
        : {
            state: s.entries.length ? "filled" : "optional",
            preview: s.entries
              .map((e) => e.title.value || e.details.value)
              .filter(Boolean)
              .join(" · "),
          };
  }
  return states;
}

export function ProfileRole({
  role,
  edit,
}: {
  role: BaseDraft["roles"][number];
  edit: () => void;
}) {
  const context = useContext(ProfileEditorContext)!;
  const { draft, asOf, enrichTarget, enrich, openEnrichment, closeEnrichment } =
    context;
  const t = useCopy();
  const answers = draft.answers.filter((a) => a.targetId === role.id);
  return (
    <section
      className="stack profile-role"
      aria-label={role.title.value || t("Experiență", "Experience")}
    >
      <div>
        <h3>{role.title.value || t("Rol fără titlu", "Untitled role")}</h3>
        <p className="muted">
          {[
            role.company.value,
            formatDate(role.start.value, draft.language),
            role.ongoing.value
              ? t("prezent", "present")
              : formatDate(role.end.value, draft.language),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="small muted">
          {t(
            formatExperienceDuration(experienceDuration([role], asOf), "ro"),
            formatExperienceDuration(experienceDuration([role], asOf), "en"),
          )}
        </p>
      </div>
      <div className="actions">
        <Button disabled={context.busy} onClick={edit}>
          {t("Editează", "Edit")}
        </Button>
        <Button
          disabled={context.busy}
          variant={enrichTarget === role.id ? "ghost" : "secondary"}
          onClick={() =>
            enrichTarget === role.id
              ? closeEnrichment()
              : openEnrichment(role.id)
          }
        >
          {enrichTarget === role.id
            ? t("Închide îmbunătățirea", "Close improvement")
            : t("Îmbunătățește cu AI", "Improve with AI")}
        </Button>
      </div>
      {(!role.context.value.trim() ||
        !role.bullets.some((f) => f.value.trim())) && (
        <p className="small profile-role-hint">
          {t(
            "Poți clarifica rezumatul rolului și contribuțiile tale cu AI sau prin editare manuală.",
            "You can clarify the role summary and your contributions with AI or manual editing.",
          )}
        </p>
      )}
      {enrichTarget !== role.id && (
        <RoleDescription
          text={
            currentWording(draft, role.id) ??
            [
              role.context.value,
              ...role.bullets.map((f) => "- " + stripListMarker(f.value)),
            ]
              .filter(Boolean)
              .join("\n\n")
          }
        />
      )}
      {enrichTarget === role.id && (
        <div className="profile-role-enrichment">{enrich(role.id)}</div>
      )}
    </section>
  );
}

function RoleDescription({ text }: { text: string }) {
  const t = useCopy(),
    id = useId();
  const [expanded, setExpanded] = useState(false);
  const lengthy =
    text.length > 280 ||
    text.split("\n").filter((line) => line.trim()).length > 4;
  return (
    <div className="role-description">
      <div
        id={id}
        className={`preserve-lines ${lengthy && !expanded ? "role-description-excerpt" : ""}`}
      >
        <RoleText text={text} />
      </div>
      {lengthy && (
        <Button
          variant="ghost"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? t("Arată mai puțin", "Show less")
            : t("Citește descrierea completă", "Read full description")}
        </Button>
      )}
    </div>
  );
}

/** Progress describes this optional review pass; accepted wording survives refresh. */
export function ExperienceJourney() {
  const profile = useContext(ProfileEditorContext)!,
    { draft, enrichTarget, openEnrichment, busy } = profile,
    t = useCopy();
  if (!draft.roles.length) return null;
  const improved = draft.roles.filter((r) => !!currentWording(draft, r.id)),
    accepted = new Set(improved.map((r) => r.id));
  const skipped = profile.skippedRoles.filter(
    (id) => draft.roles.some((r) => r.id === id) && !accepted.has(id),
  );
  const remaining = draft.roles.filter(
    (r) => !accepted.has(r.id) && !skipped.includes(r.id),
  );
  const index = draft.roles.findIndex((r) => r.id === enrichTarget);
  return (
    <section
      className="experience-journey compact-journey"
      aria-label={t(
        "Îmbunătățirea rolurilor pas cu pas",
        "Role-by-role improvement",
      )}
    >
      <div>
        <strong>
          {index >= 0
            ? t(
                `Rolul ${index + 1} din ${draft.roles.length}`,
                `Role ${index + 1} of ${draft.roles.length}`,
              )
            : t("Revizuiește rolurile pe rând", "Review roles one at a time")}
        </strong>
        <p className="small muted">
          {t(
            `${improved.length} îmbunătățite · ${skipped.length} lăsate pentru mai târziu · ${remaining.length} de revăzut`,
            `${improved.length} improved · ${skipped.length} left for later · ${remaining.length} to review`,
          )}
        </p>
      </div>
      <progress
        max={draft.roles.length}
        value={improved.length + skipped.length}
        aria-label={t(
          "Progresul verificării rolurilor",
          "Role review progress",
        )}
      />
      {index >= 0 ? (
        <Button
          disabled={busy}
          variant="ghost"
          onClick={() =>
            profile.nextRole(enrichTarget!, !accepted.has(enrichTarget!))
          }
        >
          {t("Mai târziu · următorul rol", "Later · next role")}
        </Button>
      ) : remaining.length ? (
        <Button disabled={busy} onClick={() => openEnrichment(remaining[0].id)}>
          {t("Începe", "Start")}
        </Button>
      ) : skipped.length > 0 ? (
        <Button
          disabled={busy}
          variant="ghost"
          onClick={() => {
            profile.setSkippedRoles([]);
            openEnrichment(skipped[0]);
          }}
        >
          {t("Revino la rolurile omise", "Revisit roles")}
        </Button>
      ) : (
        <span className="small muted">
          {t("Rolurile au fost revizuite.", "Roles reviewed.")}
        </span>
      )}
    </section>
  );
}
