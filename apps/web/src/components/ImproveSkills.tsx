import { useEffect, useRef, useState } from "react";
import { Sparkles, Undo2 } from "lucide-react";
import { clone, type BaseDraft } from "../base/model";
import {
  isSkillsImprovementResult,
  skillReviewFingerprint,
  skillReviewIdentity,
  skillsImprovementTimeoutMs,
  type SkillInventory,
  type SkillsImprovementResult,
} from "@resumora/contracts/intelligence/skills-improvement";
import {
  experienceDefiniteFailures,
  experienceErrorCode,
} from "../base/experience-requests";
import type { IntelligenceContext } from "../base/intelligence";
import { Button, useCopy } from "./ui";

type Props = {
  draft: BaseDraft;
  ready: boolean;
  saveFailed: boolean;
  snapshot?: { id: string; revision: number };
  change: (next: BaseDraft) => void;
  request: (
    context: IntelligenceContext & { fingerprint: string },
    recoverOnly?: boolean,
    signal?: AbortSignal,
  ) => Promise<SkillsImprovementResult>;
  commit: (identity: string, inventory: SkillInventory) => Promise<boolean>;
  undo: () => Promise<boolean>;
  canUndo: boolean;
  startRequested?: boolean;
  onStartConsumed?: () => void;
  retrySave?: () => void;
  retrySaveAutomatically?: boolean;
  onActivityChange?: (active: boolean) => void;
  onTimeout?: (operationId: string) => void;
  timedOutOperationId?: string;
};
/** A saved pending identity fences remounts; only the controller publishes a confirmed inventory. */
export function ImproveSkills(props: Props) {
  const t = useCopy(),
    live = useRef(props),
    mounted = useRef(false),
    busyRef = useRef(false);
  live.current = props;
  const armed = useRef(new Set<string>()),
    requestAbort = useRef<AbortController | null>(null),
    preparationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    ),
    attempt = useRef(0),
    startConsumed = useRef(false),
    attempted = useRef(new Set<string>()),
    metadataRetries = useRef(new Map<string, number>());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [metadataWake, setMetadataWake] = useState(0),
    [done, setDone] = useState(false),
    [removed, setRemoved] = useState<SkillsImprovementResult["removed"]>([]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestAbort.current?.abort();
      clearTimeout(preparationTimer.current);
      if (busyRef.current && !live.current.draft.skillReview) {
        attempt.current++;
        busyRef.current = false;
        live.current.onActivityChange?.(false);
      }
    };
  }, []);
  const publish = (d: BaseDraft) => {
    live.current = { ...live.current, draft: d };
    live.current.change(d);
  };
  function releaseTimedOutAttempt() {
    attempt.current++;
    requestAbort.current?.abort();
    requestAbort.current = null;
    busyRef.current = false;
    setBusy(false);
    setDone(false);
    setRemoved([]);
    setError("SKILLS_TIMEOUT");
    live.current.onActivityChange?.(false);
  }
  function expire(operationId: string) {
    if (live.current.draft.skillReview?.operationId !== operationId) return;
    releaseTimedOutAttempt();
    // Update the local identity first so even an immediately resolved promise
    // cannot publish this attempt after its deadline.
    const next = clone(live.current.draft);
    delete next.skillReview;
    live.current.onTimeout?.(operationId);
    publish(next);
    live.current.onActivityChange?.(false);
  }
  useEffect(() => {
    if (props.timedOutOperationId && !live.current.draft.skillReview)
      releaseTimedOutAttempt();
  }, [props.timedOutOperationId]);
  const expiry = useRef(expire);
  expiry.current = expire;
  useEffect(() => {
    const review = props.draft.skillReview;
    if (!review) return;
    const remaining = (review.expiresAt ?? 0) - Date.now();
    if (remaining <= 0) {
      expiry.current(review.operationId);
      return;
    }
    const timer = setTimeout(
      () => expiry.current(review.operationId),
      remaining,
    );
    return () => clearTimeout(timer);
  }, [
    props.draft.skillReview?.operationId,
    props.draft.skillReview?.expiresAt,
  ]);
  async function prepare() {
    const p = live.current;
    if (busyRef.current || p.draft.skillReview || !p.ready || !p.snapshot)
      return;
    busyRef.current = true;
    p.onActivityChange?.(true);
    setBusy(true);
    setError("");
    setDone(false);
    setRemoved([]);
    const expiresAt = Date.now() + skillsImprovementTimeoutMs;
    const preparation = ++attempt.current;
    preparationTimer.current = setTimeout(() => {
      if (mounted.current && attempt.current === preparation)
        releaseTimedOutAttempt();
    }, skillsImprovementTimeoutMs);
    const identity = skillReviewIdentity(p.draft);
    try {
      const fingerprint = await skillReviewFingerprint(p.draft);
      if (
        !mounted.current ||
        attempt.current !== preparation ||
        identity !== skillReviewIdentity(live.current.draft)
      )
        return;
      const next = clone(live.current.draft),
        operationId = crypto.randomUUID();
      next.skillReview = {
        operationId,
        fingerprint,
        snapshotId: p.snapshot.id,
        revision: p.snapshot.revision,
        expiresAt,
      };
      armed.current.add(operationId);
      publish(next);
    } finally {
      if (attempt.current === preparation) {
        clearTimeout(preparationTimer.current);
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }
  async function execute(recover: boolean) {
    const p = live.current.draft.skillReview;
    if (!p || busyRef.current || !live.current.ready) return;
    if ((p.expiresAt ?? 0) <= Date.now()) {
      expire(p.operationId);
      return;
    }
    const execution = ++attempt.current;
    const abort = new AbortController();
    requestAbort.current = abort;
    const profileId = live.current.draft.id,
      identity = skillReviewIdentity(live.current.draft);
    const valid = () =>
      mounted.current &&
      attempt.current === execution &&
      live.current.draft.id === profileId &&
      live.current.draft.skillReview?.operationId === p.operationId;
    busyRef.current = true;
    attempted.current.add(p.operationId);
    setBusy(true);
    setError("");
    try {
      if ((await skillReviewFingerprint(live.current.draft)) !== p.fingerprint)
        throw Error("STALE_INPUT");
      if (!valid()) return;
      const { expiresAt: _deadline, ...context } = p;
      const result = await live.current.request(
        { ...context, targetId: profileId },
        recover,
        abort.signal,
      );
      if (!valid()) return;
      if (Date.now() >= p.expiresAt!) {
        expire(p.operationId);
        return;
      }
      if (
        !isSkillsImprovementResult(result) ||
        result.fingerprint !== p.fingerprint
      )
        throw Error("AI_OUTPUT_INVALID");
      if (identity !== skillReviewIdentity(live.current.draft))
        throw Error("STALE_INPUT");
      setRemoved(result.removed);
      const applied = await live.current.commit(identity, result.inventory);
      if (!mounted.current || attempt.current !== execution) return;
      if (applied) setDone(true);
      else if (
        identity !== skillReviewIdentity(live.current.draft) &&
        !live.current.canUndo
      )
        throw Error("STALE_INPUT");
      else setError("SAVE_REQUIRED");
    } catch (e) {
      if (!valid()) return;
      const code = experienceErrorCode(e);
      setError(code);
      // Uncertain requests stay recoverable. A definite failure permits an explicit fresh run.
      if (experienceDefiniteFailures.has(code) || code === "STALE_INPUT") {
        const next = clone(live.current.draft);
        delete next.skillReview;
        publish(next);
      }
    } finally {
      if (attempt.current === execution) {
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }
  useEffect(() => {
    // Only a click in this page session may create a new operation. A route
    // restored by refresh/history can recover an existing operation below.
    if (!props.startRequested) startConsumed.current = false;
    if (props.startRequested && props.ready && props.snapshot)
      queueMicrotask(() => {
        if (
          !mounted.current ||
          !live.current.startRequested ||
          startConsumed.current
        )
          return;
        startConsumed.current = true;
        live.current.onStartConsumed?.();
        if (!live.current.draft.skillReview) void prepare();
      });
    const p = props.draft.skillReview;
    if (
      p &&
      !busyRef.current &&
      !attempted.current.has(p.operationId) &&
      props.ready
    )
      // StrictMode replays mount effects. Start after that replay so its cleanup
      // cannot abort the one permitted receipt recovery before dispatch.
      queueMicrotask(() => {
        if (
          mounted.current &&
          !busyRef.current &&
          live.current.draft.skillReview?.operationId === p.operationId &&
          !attempted.current.has(p.operationId)
        )
          void execute(!armed.current.has(p.operationId));
      });
  }, [props.ready, props.draft, props.startRequested, busy]);
  useEffect(() => {
    if (
      error === "SAVE_REQUIRED" &&
      props.canUndo &&
      !props.draft.skillReview
    ) {
      setDone(true);
      setError("");
    }
  }, [props.canUndo, props.draft.skillReview, error]);
  useEffect(() => {
    const p = props.draft.skillReview;
    if (
      !p ||
      busy ||
      attempted.current.has(p.operationId) ||
      !props.saveFailed ||
      !props.retrySave ||
      !props.retrySaveAutomatically
    )
      return;
    const count = metadataRetries.current.get(p.operationId) ?? 0;
    if (count >= 2) return;
    const timer = setTimeout(() => {
      if (
        !mounted.current ||
        !live.current.retrySaveAutomatically ||
        live.current.draft.skillReview?.operationId !== p.operationId
      )
        return;
      metadataRetries.current.set(p.operationId, count + 1);
      live.current.retrySave?.();
      setMetadataWake((n) => n + 1);
    }, [750, 2000][count]);
    return () => clearTimeout(timer);
  }, [
    props.draft.skillReview?.operationId,
    props.saveFailed,
    props.retrySave,
    props.retrySaveAutomatically,
    busy,
    metadataWake,
  ]);
  useEffect(() => {
    // No pending write means the save failed definitively. An uncertain save
    // retains retrySave and the lock until its acknowledgement is recovered.
    if (!busy && props.saveFailed && !props.retrySave) {
      setError("SAVE_FAILED");
      if (props.draft.skillReview) {
        const next = clone(live.current.draft);
        delete next.skillReview;
        publish(next);
      }
    }
  }, [busy, props.saveFailed, props.retrySave, props.draft.skillReview]);

  const pending = props.draft.skillReview;
  const active =
    busy ||
    !!pending ||
    (!!props.startRequested && props.ready && !startConsumed.current);
  useEffect(() => {
    props.onActivityChange?.(active);
  }, [active, props.onActivityChange]);
  return (
    <div className="profile-skills-discovery">
      <div className="actions">
        <Button
          variant="ghost"
          disabled={busy || !!pending || !props.ready}
          onClick={() => void prepare()}
        >
          <Sparkles size={15} />
          {busy
            ? t("Îmbunătățim competențele…", "Improving skills…")
            : t("Îmbunătățește competențele", "Improve skills")}
        </Button>
        {props.canUndo && (
          <Button
            variant="ghost"
            disabled={active || !props.ready}
            onClick={async () => {
              if (active || busyRef.current) return;
              if (await live.current.undo()) {
                setDone(false);
                setRemoved([]);
              }
            }}
          >
            <Undo2 size={15} />
            {t("Anulează îmbunătățirea", "Undo improvement")}
          </Button>
        )}
        <span role="status" className="small muted">
          {busy
            ? t(
                "Extragem competențe din experiență, apoi îmbunătățim lista completă.",
                "Extracting skills from experience, then improving the complete list.",
              )
            : done
              ? t(
                  "Competențe îmbunătățite și salvate.",
                  "Skills improved and saved.",
                )
              : !error && pending
                ? t("Salvăm cererea…", "Saving the request…")
                : ""}
        </span>
      </div>
      {error && (
        <p role="alert">
          {error === "SKILLS_TIMEOUT"
            ? t(
                "Au trecut 90 de secunde. Încercarea a fost eliminată; competențele anterioare sunt păstrate. Poți începe din nou.",
                "90 seconds elapsed. This attempt was discarded; your previous skills are kept. You can start again.",
              )
            : error === "STALE_INPUT"
              ? t(
                  "Ai modificat profilul. Am păstrat editările și am omis rezultatul vechi. Poți reîncerca.",
                  "Your profile changed. Your edits are preserved and the outdated result was skipped. You can retry.",
                )
              : error === "SAVE_REQUIRED" || props.saveFailed
                ? t(
                    "Salvarea nu este confirmată. Lista anterioară rămâne afișată. Reîncearcă salvarea.",
                    "Saving is not confirmed. Your previous list is still shown. Retry saving.",
                  )
                : pending
                  ? t(
                      "Rezultatul nu este încă disponibil. Verifică aceeași cerere.",
                      "The result is not available yet. Check the same request.",
                    )
                  : t(
                      "Nu am putut finaliza îmbunătățirea. Competențele tale sunt păstrate.",
                      "We could not complete the improvement. Your skills are preserved.",
                    )}
        </p>
      )}
      {props.saveFailed && props.retrySave && (
        <>
          {!error && (
            <p role="alert">
              {t(
                "Nu am putut confirma salvarea. Competențele tale sunt păstrate.",
                "We could not confirm saving. Your skills are preserved.",
              )}
            </p>
          )}
          <Button variant="ghost" onClick={props.retrySave}>
            {t("Reîncearcă salvarea", "Retry save")}
          </Button>
        </>
      )}
      {pending && error && !props.saveFailed && (
        <>
          <Button
            variant="ghost"
            disabled={busy || !props.ready}
            onClick={() => void execute(true)}
          >
            {t("Verifică rezultatul", "Check result")}
          </Button>
          {error === "MISSING" && (
            <Button
              variant="ghost"
              disabled={busy || !props.ready}
              onClick={() => {
                if (busyRef.current) return;
                const next = clone(live.current.draft);
                delete next.skillReview;
                setError("");
                setDone(false);
                publish(next);
              }}
            >
              {t("Renunță la cerere", "Discard request")}
            </Button>
          )}
        </>
      )}
      {pending && error === "MISSING" && (
        <Button
          variant="ghost"
          disabled={busy || !props.ready}
          onClick={() => void execute(false)}
        >
          {t("Reia îmbunătățirea", "Resume improvement")}
        </Button>
      )}
      {done && removed.length > 0 && (
        <details>
          <summary>
            {t(
              `${removed.length} intrări eliminate`,
              `${removed.length} entries removed`,
            )}
          </summary>
          <ul>
            {removed.map((r) => (
              <li key={r.id}>
                {r.label || t("Intrare goală", "Empty entry")}: {r.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
