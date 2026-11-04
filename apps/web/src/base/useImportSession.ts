import { useEffect, useRef, useState } from "react";
import { cvImportLimits } from "@resumora/contracts/intelligence/import-limits";
import { documentLimits } from "@resumora/contracts/intelligence/model";
import {
  createImportTiming,
  type ImportTiming,
  type ImportTimingOptions,
} from "@resumora/contracts/intelligence/import-timing";
import {
  checkedImportStatus,
  IntelligenceRequestError,
  type IntelligenceClient,
  type ImportStatus,
} from "./intelligence";

/** One browser import session. Review choices and Profile persistence belong to their existing controllers. */
export function useImportSession({
  client,
  revision,
  openImportId,
  onOpenImport,
  instantUpload = false,
  timingOptions,
}: {
  client: IntelligenceClient;
  revision: number;
  openImportId?: string;
  onOpenImport?: (id: string) => void;
  instantUpload?: boolean;
  timingOptions?: ImportTimingOptions;
}) {
  const [file, setFile] = useState<File | null>(null),
    [status, setStatus] = useState<ImportStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recent, setRecent] = useState<ImportStatus[]>([]),
    [readingSeconds, setReadingSeconds] = useState(0),
    [pollRevision, setPollRevision] = useState(0),
    [restarting, setRestarting] = useState(false);
  const inFlight = useRef(false);
  function updateBusy(value: boolean) {
    inFlight.current = value;
    setBusy(value);
  }
  const timing = useRef<ImportTiming | null>(null);
  const discoveryDone = useRef<ReturnType<ImportTiming["span"]> | null>(null);
  function beginTiming(id: string) {
    timing.current = createImportTiming("browser", id, timingOptions);
    discoveryDone.current = timing.current.span("browser_discovery");
  }
  function observe(result: ImportStatus) {
    if (result.state === "ready" && result.review && discoveryDone.current) {
      discoveryDone.current();
      discoveryDone.current = null;
      // A refresh URL can use a source ID. Record the canonical operation from the
      // public receipt as well, so owner measurements can correlate server logs.
      createImportTiming("browser", result.id, timingOptions).mark(
        "browser_ready_observed",
      );
    }
    setStatus(result);
  }
  const autoUpload = useRef<string | null>(null);
  const consumed = useRef(false);
  const operation = useRef<string | null>(null),
    session = useRef(0),
    request = useRef<AbortController | null>(null);
  const identity = client.sessionIdentity ?? client;
  const owner = useRef(identity);
  const owned = owner.current === identity;
  useEffect(() => {
    if (owner.current !== identity) {
      owner.current = identity;
      operation.current = null;
      autoUpload.current = null;
      consumed.current = false;
      setFile(null);
      setStatus(null);
      setRecent([]);
      setError("");
      updateBusy(false);
      setRestarting(false);
    }
    return () => {
      session.current++;
      inFlight.current = false;
      request.current?.abort();
    };
  }, [identity]);
  useEffect(() => {
    const id = operation.current;
    if (
      !instantUpload ||
      !file ||
      !id ||
      status ||
      busy ||
      autoUpload.current === id
    )
      return;
    const timer = setTimeout(() => {
      if (operation.current !== id || autoUpload.current === id) return;
      autoUpload.current = id;
      void run();
    }, 0);
    return () => clearTimeout(timer);
  }, [instantUpload, file, status, busy]);
  function openSavedImport(id: string) {
    request.current?.abort();
    const controller = new AbortController(),
      generation = ++session.current;
    request.current = controller;
    operation.current = id;
    beginTiming(id);
    consumed.current = false;
    setRestarting(false);
    setFile(null);
    setStatus(null);
    setError("");
    updateBusy(true);
    void boundedImportRequest(
      (signal) =>
        client
          .importStatus(id, signal)
          .then((value) => checkedImportStatus(value)),
      controller,
    )
      .then(
        (result) => {
          if (generation !== session.current) return;
          operation.current = result.id;
          observe(result);
        },
        (error) => {
          if (generation !== session.current) return;
          const missing =
            error instanceof IntelligenceRequestError &&
            ["missing", "MISSING", "SNAPSHOT_NOT_FOUND"].includes(error.code);
          setStatus({
            id,
            state: missing ? "failed" : "unknown",
            error: missing ? "IMPORT_NOT_FOUND" : "IMPORT_STATUS_UNAVAILABLE",
          });
          if (missing) {
            operation.current = null;
            onOpenImport?.("");
          }
        },
      )
      .finally(() => {
        if (generation === session.current) updateBusy(false);
      });
    return () => {
      if (generation === session.current) session.current++;
      controller.abort();
    };
  }
  useEffect(() => {
    if (!openImportId) return;
    if (
      owned &&
      (status?.review?.id === openImportId || status?.id === openImportId)
    )
      return;
    // Each effect setup owns its read. Strict Mode replays must start a replacement
    // request after cleanup, rather than retain a stale one-shot recovery guard.
    return openSavedImport(openImportId);
  }, [openImportId, identity]);
  useEffect(() => {
    if (
      !consumed.current &&
      status &&
      ["uploaded", "processing", "unknown", "ready"].includes(status.state) &&
      openImportId !== (status.review?.id ?? status.id)
    )
      onOpenImport?.(status.review?.id ?? status.id);
  }, [status, openImportId]);

  useEffect(() => {
    setReadingSeconds(0);
    if (status?.state !== "processing") return;
    const began = Date.now();
    const timer = window.setInterval(
      () => setReadingSeconds(Math.floor((Date.now() - began) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [status?.id, status?.state]);

  useEffect(() => {
    if (
      !status ||
      !["uploading", "uploaded", "processing"].includes(status.state) ||
      busy
    )
      return;
    const timer = window.setTimeout(() => {
      void run(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [status, busy, pollRevision]);
  useEffect(() => {
    let active = true;
    void client
      .listImports()
      .then((rows) => rows.map((row) => checkedImportStatus(row, false)))
      .then(
        (rows) => {
          if (active) setRecent(rows);
        },
        () => {},
      );
    return () => {
      active = false;
    };
  }, [client]);
  useEffect(() => {
    if (
      !status ||
      !["uploading", "uploaded", "processing"].includes(status.state)
    )
      return;
    const id = status.id;
    const timer = window.setTimeout(() => {
      session.current++;
      request.current?.abort();
      updateBusy(false);
      setStatus({ id, state: "unknown", error: "IMPORT_PROCESSING_TIMEOUT" });
    }, cvImportLimits.interfaceWaitMs);
    return () => window.clearTimeout(timer);
  }, [status?.id, status?.state]);

  const unresolved =
    status &&
    ["uploading", "uploaded", "processing", "unknown"].includes(status.state);
  const failedImport =
    !!status &&
    ["failed", "unknown", "uncertain", "not_cv", "disabled"].includes(
      status.state,
    );
  function select(files: FileList | null) {
    if (inFlight.current || unresolved) return;
    if (!files || files.length !== 1) {
      setError("SELECT_ONE_DOCUMENT");
      return;
    }
    const f = files[0];
    if (
      !/\.(pdf|docx|doc)$/i.test(f.name) ||
      f.size < 1 ||
      f.size > documentLimits.bytes
    ) {
      setError("DOCUMENT_SELECTION_INVALID");
      return;
    }
    session.current++;
    consumed.current = false;
    request.current?.abort();
    setFile(f);
    setStatus(null);
    setError("");
    operation.current = crypto.randomUUID();
    timing.current = null;
    discoveryDone.current = null;
  }
  async function restartImport() {
    if (inFlight.current) return;
    const previous = operation.current;
    const needsFence =
      previous &&
      (!status ||
        ["unknown", "uploading", "uploaded", "processing"].includes(
          status.state,
        ));
    const generation = ++session.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    updateBusy(true);
    setRestarting(true);
    setError("");
    try {
      if (needsFence) {
        try {
          await boundedImportRequest(
            (signal) => client.cancelImport(previous, signal),
            controller,
          );
        } catch (error) {
          if (!(
            error instanceof IntelligenceRequestError &&
            ["missing", "MISSING", "SNAPSHOT_NOT_FOUND"].includes(error.code)
          ))
            throw error;
        }
      }
      if (generation !== session.current) return;
      consumed.current = true;
      operation.current = null;
      autoUpload.current = null;
      setStatus(null);
      setFile(null);
      onOpenImport?.("");
    } catch {
      if (generation === session.current) setError("CANCELLATION_UNCONFIRMED");
    } finally {
      if (generation === session.current) {
        updateBusy(false);
        setRestarting(false);
      }
    }
  }
  async function run(checkOnly = false) {
    if (
      !operation.current ||
      (!checkOnly && (!file || status)) ||
      inFlight.current
    )
      return;
    const generation = session.current,
      operationId = operation.current;
    const active = () =>
      generation === session.current && operationId === operation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    updateBusy(true);
    setError("");
    if (!checkOnly) beginTiming(operationId);
    const uploadDone = checkOnly
      ? undefined
      : timing.current?.span("browser_upload_acknowledgement");
    try {
      const result = await boundedImportRequest(
        (signal) =>
          checkOnly
            ? client.importStatus(operationId, signal)
            : client.importDocument(file!, operationId, revision, signal),
        controller,
        checkOnly ? 15000 : 60000,
      ).then((value) => checkedImportStatus(value));
      if (active()) {
        uploadDone?.();
        observe(result);
      }
    } catch (error) {
      uploadDone?.("unknown");
      if (active()) {
        const code =
          error instanceof IntelligenceRequestError
            ? error.code
            : "REQUEST_OUTCOME_UNKNOWN";
        const definite = [
          "AI_DISABLED",
          "AI_UNCONFIGURED",
          "DOCUMENT_TYPE",
          "DOCUMENT_SIZE",
          "DOCUMENT_PAGES",
          "DOCUMENT_ENCRYPTED",
          "DOCUMENT_MALFORMED",
          "ACTIVE_DOCUMENT_CONTENT",
        ].includes(code);
        setStatus({
          id: operationId,
          state: definite ? "failed" : "unknown",
          error: code,
        });
        setError("");
      }
    } finally {
      if (active()) {
        updateBusy(false);
        setPollRevision((value) => value + 1);
      }
    }
  }
  const discardReview = async () => {
    if (status?.state !== "ready" || !status.review) return null;
    if (inFlight.current) return;
    const current = status;
    const generation = ++session.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    updateBusy(true);
    setError("");
    try {
      await boundedImportRequest(
        (signal) => client.cancelImport(current.id, signal),
        controller,
      );
      if (generation !== session.current) return;
      consumed.current = true;
      operation.current = null;
      setStatus(null);
      setFile(null);
      onOpenImport?.("");
      return current.review!.id;
    } catch {
      if (generation === session.current) setError("DISCARD_UNCONFIRMED");
    } finally {
      if (generation === session.current) updateBusy(false);
    }
  };
  async function cancel() {
    if (!operation.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const generation = ++session.current,
      operationId = operation.current;
    const active = () =>
      generation === session.current && operationId === operation.current;
    setStatus(null);
    setError("");
    updateBusy(true);
    try {
      await boundedImportRequest(
        (signal) => client.cancelImport(operationId, signal),
        controller,
      );
      if (active()) setStatus({ id: operationId, state: "cancelled" });
    } catch {
      if (active()) {
        setStatus({
          id: operationId,
          state: "unknown",
          error: "CANCELLATION_OUTCOME_UNKNOWN",
        });
        setError("CANCELLATION_UNCONFIRMED");
      }
    } finally {
      if (active()) updateBusy(false);
    }
  }
  return {
    file: owned ? file : null,
    status: owned ? status : null,
    recent: owned ? recent : [],
    busy: owned ? busy : false,
    error: owned ? error : "",
    readingSeconds,
    restarting,
    unresolved: owned && unresolved,
    failedImport: owned && failedImport,
    operationId: owned ? operation.current : null,
    select,
    openSavedImport,
    restartImport,
    discardReview,
    cancel,
    upload: () => run(),
    check: () => run(true),
    consume: () => {
      consumed.current = true;
    },
  };
}

/** Bound all import calls, including injected clients that ignore AbortSignal. */
async function boundedImportRequest<T>(
  task: (signal: AbortSignal) => Promise<T>,
  controller: AbortController,
  timeoutMs = 15000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    stop = () => reject(new DOMException("Aborted", "AbortError"));
    controller.signal.addEventListener("abort", stop, { once: true });
    timer = setTimeout(() => {
      reject(new IntelligenceRequestError("IMPORT_REQUEST_TIMEOUT"));
      controller.abort();
    }, timeoutMs);
    if (controller.signal.aborted) stop();
  });
  try {
    return await Promise.race([task(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    if (stop) controller.signal.removeEventListener("abort", stop);
  }
}
