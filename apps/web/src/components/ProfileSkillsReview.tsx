import { contentLocale } from "@resumora/contracts/editor/content-language";
import { useContext, useEffect, useRef, useState } from "react";
import { clone, type BaseDraft } from "../base/model";
import {
  experienceTargets,
  experienceFacts,
  experienceIdentity,
  experienceFingerprint,
} from "@resumora/contracts/intelligence/experience";
import { addProfileSkillKeywords } from "../base/profile-skills";
import {
  experienceDefiniteFailures,
  experienceErrorCode,
} from "../base/experience-requests";
import type { GuidedExperienceProps } from "./useGuidedExperience";
import {
  isSkillKeyword,
  skillInventoryPolicy,
} from "@resumora/contracts/intelligence/skill-keywords";
import { Sparkles } from "lucide-react";
import { Button, useCopy } from "./ui";
import { ProfileEditorContext } from "./ProfileOverview";

/** One click adds grounded keywords inline; per-entry receipts retain recovery. */
export function ProfileSkillsReview(props: GuidedExperienceProps) {
  const t = useCopy(),
    profile = useContext(ProfileEditorContext),
    locale = contentLocale(props.draft),
    live = useRef(props);
  live.current = props;
  const mounted = useRef(false),
    inFlight = useRef(false),
    started = useRef(false),
    batchActive = useRef(false),
    preparingRef = useRef(false),
    deferred = useRef(new Set<string>()),
    armed = useRef(new Set<string>()),
    attempted = useRef(new Set<string>());
  const [working, setWorking] = useState(false),
    [preparing, setPreparing] = useState(false),
    [awaiting, setAwaiting] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [added, setAdded] = useState<number | null>(null);
  const [wake, setWake] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const publish = (next: BaseDraft) => {
    if (!mounted.current || next.id !== live.current.draft.id) return;
    const count =
      next.technicalSkills.length +
      next.professionalSkills.length -
      live.current.draft.technicalSkills.length -
      live.current.draft.professionalSkills.length;
    if (count > 0) setAdded((old) => (old ?? 0) + count);
    live.current = { ...live.current, draft: next };
    props.change(next);
  };
  async function discover(continuation = false) {
    if (preparingRef.current || inFlight.current) return;
    batchActive.current = true;
    preparingRef.current = true;
    setPreparing(true);
    if (!continuation) {
      setErrors({});
      setAdded(0);
      deferred.current.clear();
    }
    try {
      const captured = live.current.draft,
        identities = experienceTargets(captured)
          .filter(
            (r) =>
              experienceFacts(captured, r.id).length &&
              (!continuation || deferred.current.has(r.id)),
          )
          .map((r) => ({
            id: r.id,
            identity: experienceIdentity(captured, r.id),
          }));
      const requests = await Promise.all(
        identities.map(async (r) => ({
          ...r,
          fingerprint: await experienceFingerprint(captured, r.id),
        })),
      );
      if (!mounted.current || captured.id !== live.current.draft.id) return;
      const next = clone(live.current.draft);
      for (const r of requests) {
        deferred.current.delete(r.id);
        if (
          !experienceTargets(next).some((target) => target.id === r.id) ||
          experienceIdentity(next, r.id) !== r.identity
        )
          continue;
        const s = ((next.experienceEnrichment ??= {})[r.id] ??= { version: 1 });
        if (
          s.skills &&
          s.skills.extractionVersion === skillInventoryPolicy.version &&
          s.skillsIdentity === r.identity &&
          s.skills.skills.every((skill) => isSkillKeyword(skill.label))
        )
          continue;
        if (s.pending) {
          if (s.pending.request.intent !== "skills") deferred.current.add(r.id);
          continue; // Existing operations are never replaced by a fresh request.
        }
        s.pending = {
          id: crypto.randomUUID(),
          request: {
            intent: "skills",
            fingerprint: r.fingerprint,
            feedbackLocale: locale,
          },
        };
        delete s.skillsFailed;
        armed.current.add(s.pending.id);
      }
      setAwaiting(deferred.current.size > 0);
      publish(next);
    } finally {
      preparingRef.current = false;
      if (mounted.current) setPreparing(false);
    }
  }
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void discover();
    }
  }, []);
  async function execute(id: string, recover: boolean) {
    const p = live.current.draft.experienceEnrichment?.[id]?.pending;
    if (
      !p ||
      p.request.intent !== "skills" ||
      inFlight.current ||
      (!recover && !live.current.ready)
    )
      return;
    inFlight.current = true;
    batchActive.current = true;
    attempted.current.add(p.id);
    setWorking(true);
    const profileId = live.current.draft.id;
    const valid = () =>
      mounted.current &&
      live.current.draft.id === profileId &&
      live.current.draft.experienceEnrichment?.[id]?.pending?.id === p.id;
    try {
      const result = await live.current.request(
        {
          snapshotId: "",
          revision: 0,
          targetId: id,
          operationId: p.id,
          experience: p.request,
        },
        recover,
      );
      if (!valid()) return;
      const identity = experienceIdentity(live.current.draft, id),
        fingerprint = await experienceFingerprint(live.current.draft, id);
      if (!valid()) return;
      if (
        result.intent !== "skills" ||
        result.targetId !== id ||
        result.fingerprint !== fingerprint ||
        identity !== experienceIdentity(live.current.draft, id)
      )
        throw Error("STALE_INPUT");
      const next = clone(live.current.draft),
        s = next.experienceEnrichment![id];
      delete s.pending;
      delete s.skillsFailed;
      s.skills = result;
      s.skillsIdentity = identity;
      // Exclusions outlive generation-local suggestion IDs. Keep them as
      // bounded choice records so another role cannot silently restore a skill.
      s.skillChoices = Object.fromEntries(
        Object.values(s.skillChoices ?? {})
          .filter((choice) => !choice.selected)
          .map((choice, index) => [`excluded-${index}`, choice]),
      );
      publish(next);
      setErrors((old) => {
        const n = { ...old };
        delete n[id];
        return n;
      });
    } catch (e) {
      if (!valid()) return;
      const code = experienceErrorCode(e);
      setErrors((old) => ({ ...old, [id]: code }));
      if (
        experienceDefiniteFailures.has(code) ||
        code === "AI_RESULT_UNAVAILABLE"
      ) {
        const next = clone(live.current.draft),
          s = next.experienceEnrichment![id];
        delete s.pending;
        s.skillsFailed = true;
        publish(next);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setWorking(false);
        setWake((n) => n + 1);
      }
    }
  }
  const targets = experienceTargets(props.draft).filter(
      (r) => experienceFacts(props.draft, r.id).length,
    ),
    pending = targets.filter(
      (r) =>
        props.draft.experienceEnrichment?.[r.id]?.pending?.request.intent ===
        "skills",
    );
  useEffect(() => {
    if (inFlight.current || preparing) return;
    const target = pending.find((r) => {
      const p = live.current.draft.experienceEnrichment?.[r.id]?.pending;
      return (
        p &&
        !attempted.current.has(p.id) &&
        (!armed.current.has(p.id) || props.ready)
      );
    });
    if (target) {
      const p = live.current.draft.experienceEnrichment![target.id].pending!;
      void execute(target.id, !armed.current.has(p.id));
    }
  }, [props.draft, props.ready, working, preparing, wake]);
  useEffect(() => {
    if (inFlight.current || preparingRef.current || preparing) return;
    for (const id of deferred.current) {
      if (!targets.some((r) => r.id === id)) deferred.current.delete(id);
    }
    setAwaiting(deferred.current.size > 0);
    if (
      [...deferred.current].some(
        (id) => !live.current.draft.experienceEnrichment?.[id]?.pending,
      )
    )
      void discover(true);
  }, [props.draft, preparing, working]);
  const busy = working || preparing || pending.some((r) => !errors[r.id]);
  // Persist each receipt immediately, then rank the completed batch together.
  // An uncertain request remains recoverable; supported completed entries can
  // still be applied once every runnable request has settled.
  useEffect(() => {
    if (
      !batchActive.current ||
      busy ||
      preparingRef.current ||
      deferred.current.size ||
      awaiting
    )
      return;
    batchActive.current = false;
    const next = addProfileSkillKeywords(live.current.draft);
    if (next !== live.current.draft) publish(next);
  }, [props.draft, busy, awaiting]);
  const unavailable = Object.values(errors).some(
    (code) => code === "AI_DISABLED" || code === "AI_UNCONFIGURED",
  );
  return (
    <div className="profile-skills-discovery">
      <div className="actions">
        <Button
          variant="ghost"
          disabled={busy || pending.length > 0 || props.saveFailed}
          onClick={() => void discover()}
        >
          <Sparkles size={15} aria-hidden="true" />
          {busy
            ? t("Adăugăm competențe…", "Adding skills…")
            : t(
                "Adaugă competențe din experiență",
                "Add skills from experience",
              )}
        </Button>
        <span className="small muted" role="status" aria-live="polite">
          {added
            ? !props.ready || props.saveFailed
              ? t(
                  `${added} competențe adăugate · salvăm…`,
                  `${added} skills added · saving…`,
                )
              : t(`${added} competențe adăugate`, `${added} skills added`)
            : busy
              ? t(
                  "Extragem cuvinte-cheie din experiența ta.",
                  "Extracting keywords from your experience.",
                )
              : !awaiting && !Object.keys(errors).length
                ? t(
                    "Nu sunt competențe noi de adăugat.",
                    "No new skills to add.",
                  )
                : ""}
        </span>
      </div>
      {awaiting && (
        <div>
          <p>
            {t(
              "Unele experiențe au o verificare neterminată.",
              "Some experiences have unfinished reviews.",
            )}
          </p>
          {targets
            .filter((r) => deferred.current.has(r.id))
            .map((r) => (
              <Button
                key={r.id}
                variant="ghost"
                onClick={() => profile?.openEnrichment(r.id)}
              >
                {t(
                  "Continuă verificarea experienței",
                  "Continue experience review",
                )}
                : {r.title.value}
              </Button>
            ))}
        </div>
      )}
      {props.saveFailed && (
        <p role="alert">
          {t(
            "Salvarea nu a reușit. Competențele adăugate sunt păstrate.",
            "Saving failed. Added skills are retained.",
          )}
          {props.retrySave && (
            <Button variant="ghost" onClick={props.retrySave}>
              {t("Reîncearcă salvarea", "Retry save")}
            </Button>
          )}
        </p>
      )}
      {Object.keys(errors).length > 0 && (
        <p role="alert">
          {unavailable
            ? t(
                "Generarea AI este indisponibilă. Poți edita competențele manual.",
                "AI generation is unavailable. You can edit skills manually.",
              )
            : t(
                "Nu am putut analiza toate experiențele. Competențele adăugate sunt păstrate; poți reîncerca.",
                "Some experiences could not be checked. Added skills are retained; you can retry.",
              )}
        </p>
      )}
      {pending
        .filter((r) => !!errors[r.id])
        .map((r) => (
          <Button
            key={r.id}
            variant="ghost"
            disabled={busy}
            onClick={() => void execute(r.id, true)}
          >
            {t("Verifică rezultatul", "Check result")}: {r.title.value}
          </Button>
        ))}
      {pending
        .filter((r) => errors[r.id] === "MISSING")
        .map((r) => (
          <Button
            key={`resume-${r.id}`}
            variant="ghost"
            disabled={busy || !props.ready}
            onClick={() => {
              const p =
                live.current.draft.experienceEnrichment?.[r.id]?.pending;
              if (p) {
                armed.current.add(p.id);
                attempted.current.delete(p.id);
                setErrors((old) => {
                  const next = { ...old };
                  delete next[r.id];
                  return next;
                });
                setWake((n) => n + 1);
              }
            }}
          >
            {t("Reia analiza", "Resume discovery")}: {r.title.value}
          </Button>
        ))}
    </div>
  );
}
