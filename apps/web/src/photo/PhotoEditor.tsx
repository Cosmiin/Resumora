import { inspectPhoto } from "@resumora/contracts/editor/photo-format";
import { ImagePlus, Minus, Plus, RotateCcw, Move } from "lucide-react";
import { useContext, useEffect, useId, useRef, useState } from "react";
import {
  cropRectangle,
  defaultPhotoCrop,
  type CvPhoto,
  type PhotoCrop,
} from "@resumora/contracts/editor/photo";
import { equalValues } from "@resumora/contracts/editor/model";
import { PhotoContext, PhotoClientError, usePhotoUrl } from "./client";
import { Button, useCopy } from "../components/ui";
import { stripCanvasJpegMetadata } from "./canvas-jpeg";

type LocalImage = {
  image: CanvasImageSource;
  width: number;
  height: number;
  blob: Blob | null;
  assetId?: string;
};
async function prepare(file: File): Promise<LocalImage> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size === 0 ||
    file.size > 10485760
  )
    throw Error("file");
  // Native decoder applies EXIF orientation once. Strip encoder metadata afterward;
  // server independently decodes/re-encodes the uploaded bounded full-frame source.
  const raw = new Uint8Array(await file.arrayBuffer());
  inspectPhoto(raw, {
    maxDimension: 8192,
    maxPixels: 24000000,
    allowMetadata: true,
  });
  const image = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    if (
      Math.min(image.width, image.height) < 256 ||
      image.width * image.height > 24000000 ||
      Math.max(image.width, image.height) > 8192
    )
      throw Error("dimensions");
    const ratio = Math.min(1, 1600 / Math.max(image.width, image.height)),
      width = Math.floor(image.width * ratio),
      height = Math.floor(image.height * ratio);
    if (Math.min(width, height) < 256) throw Error("dimensions");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("canvas");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const encoded = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (v) => (v ? resolve(v) : reject(Error("canvas"))),
        "image/jpeg",
        0.95,
      ),
    );
    const blob = new Blob(
      [stripCanvasJpegMetadata(new Uint8Array(await encoded.arrayBuffer()))],
      { type: "image/jpeg" },
    );
    return { image: canvas, width, height, blob };
  } finally {
    image.close();
  }
}
export function PhotoEditor({
  value,
  commit,
}: {
  value: CvPhoto | null | undefined;
  commit: (photo: CvPhoto | null, expected: CvPhoto | null) => Promise<boolean>;
}) {
  const controlId = useId();
  const client = useContext(PhotoContext),
    t = useCopy(),
    source = usePhotoUrl(value?.assetId);
  const [editing, setEditing] = useState(false),
    [local, setLocal] = useState<LocalImage | null>(null),
    [crop, setCrop] = useState<PhotoCrop>({ ...defaultPhotoCrop }),
    [shape, setShape] = useState<"circle" | "square">("square"),
    [visible, setVisible] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [retry, setRetry] = useState(0),
    [failed, setFailed] = useState(false),
    [dragging, setDragging] = useState(false),
    [deleting, setDeleting] = useState(false),
    [confirm, setConfirm] = useState(false),
    [dropActive, setDropActive] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    file = useRef<HTMLInputElement>(null),
    sequence = useRef(0),
    original = useRef<CvPhoto | null>(null),
    request = useRef(crypto.randomUUID()),
    uploaded = useRef<string | null>(null),
    drag = useRef<{ x: number; y: number } | null>(null),
    alive = useRef(true);
  const savedCanvas = useRef<HTMLCanvasElement>(null),
    cropCurrent = useRef(crop),
    busyCurrent = useRef(busy),
    pointers = useRef(new Map<number, { x: number; y: number }>()),
    pinch = useRef<number | null>(null);
  cropCurrent.current = crop;
  busyCurrent.current = busy;
  const submitted = useRef<CvPhoto | null>(null),
    attempted = useRef(""),
    saving = useRef(false);
  const assetId = local?.assetId ?? uploaded.current;
  const pendingChanges =
    !!local &&
    (!assetId ||
      !equalValues({ assetId, crop, shape, visible }, original.current));
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current++;
    };
  }, []);
  useEffect(() => {
    if (editing && submitted.current && equalValues(value, submitted.current)) {
      original.current = structuredClone(submitted.current);
      submitted.current = null;
    }
  }, [value, editing]);
  useEffect(() => {
    if (!editing || !local || !canvas.current) return;
    const rect = cropRectangle(local.width, local.height, crop),
      ctx = canvas.current.getContext("2d");
    ctx?.clearRect(0, 0, 360, 360);
    ctx?.drawImage(
      local.image,
      rect.x,
      rect.y,
      rect.size,
      rect.size,
      0,
      0,
      360,
      360,
    );
  }, [local, crop, editing]);
  useEffect(() => {
    if (editing || !value || !source.url || !savedCanvas.current) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active || !savedCanvas.current) return;
      const rect = cropRectangle(
        image.naturalWidth,
        image.naturalHeight,
        value.crop,
      );
      savedCanvas.current
        .getContext("2d")
        ?.drawImage(
          image,
          rect.x,
          rect.y,
          rect.size,
          rect.size,
          0,
          0,
          360,
          360,
        );
    };
    image.src = source.url;
    return () => {
      active = false;
      image.src = "";
    };
  }, [editing, value, source.url]);
  useEffect(() => {
    if (!editing || !local || !canvas.current) return;
    const el = canvas.current;
    el.focus({ preventScroll: true });
    const wheel = (e: WheelEvent) => {
      if (busyCurrent.current || (document.activeElement !== el && !e.ctrlKey))
        return;
      e.preventDefault();
      zoom(
        cropCurrent.current.zoom *
          Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.003),
      );
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [editing, local]);
  useEffect(() => {
    if (!editing || (!busy && !pendingChanges)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing, busy, pendingChanges]);
  function start(image: LocalImage) {
    original.current = structuredClone(value ?? null);
    submitted.current = null;
    setLocal(image);
    setCrop(value?.crop ?? { ...defaultPhotoCrop });
    setShape(value?.shape ?? "square");
    setVisible(value?.visible ?? true);
    request.current = crypto.randomUUID();
    uploaded.current = null;
    attempted.current = "";
    setFailed(false);
    pointers.current.clear();
    pinch.current = null;
    drag.current = null;
    setDragging(false);
    setEditing(true);
    setMessage("");
  }
  async function select(selected: File | undefined) {
    if (!selected) return;
    const token = ++sequence.current;
    setBusy(true);
    try {
      const image = await prepare(selected);
      if (!alive.current || token !== sequence.current) return;
      start(image);
      setCrop({ ...defaultPhotoCrop });
    } catch {
      if (alive.current)
        setMessage(
          t(
            "Alege JPEG, PNG sau WebP static, maximum 10 MB / 24 MP, minimum 256 px. HEIC și imaginile animate nu sunt acceptate. Exportă ca JPEG/PNG și reîncearcă.",
            "Choose static JPEG, PNG or WebP, up to 10 MB / 24 MP, minimum 256 px. HEIC and animated images are unsupported. Export as JPEG/PNG and retry.",
          ),
        );
    } finally {
      if (alive.current && token === sequence.current) setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  function edit() {
    if (!source.url) return;
    const image = new Image(),
      token = ++sequence.current;
    image.onload = () => {
      if (alive.current && token === sequence.current)
        start({
          image,
          width: image.naturalWidth,
          height: image.naturalHeight,
          blob: null,
          assetId: value?.assetId,
        });
    };
    image.src = source.url;
  }
  function position(next: PhotoCrop) {
    if (!local) return;
    const bounded = cropRectangle(local.width, local.height, {
      ...next,
      centerX: Math.max(0, Math.min(1, next.centerX)),
      centerY: Math.max(0, Math.min(1, next.centerY)),
    }).crop;
    cropCurrent.current = bounded;
    setCrop(bounded);
  }
  function zoom(value: number) {
    if (Number.isFinite(value))
      position({
        ...cropCurrent.current,
        zoom: Math.round(Math.max(1, Math.min(3, value)) * 100) / 100,
      });
  }
  function endPointer(id: number) {
    pointers.current.delete(id);
    pinch.current = null;
    const remaining = [...pointers.current.values()][0];
    drag.current = remaining ?? null;
    setDragging(pointers.current.size > 0);
  }
  function move(x: number, y: number) {
    if (!local) return;
    const current = cropCurrent.current,
      rect = cropRectangle(local.width, local.height, current);
    position({
      ...current,
      centerX: current.centerX - (x * rect.size) / local.width,
      centerY: current.centerY - (y * rect.size) / local.height,
    });
  }
  async function save() {
    if (!client || !local || busy || saving.current) return;
    saving.current = true;
    setBusy(true);
    setFailed(false);
    setMessage(
      t("Validăm și salvăm fotografia…", "Validating and saving photo…"),
    );
    let phase: "upload" | "document" = "upload";
    try {
      let id = local.assetId ?? uploaded.current;
      if (!id) {
        await client.cleanup().catch(() => {});
        id = (await client.upload(local.blob!, request.current)).id;
        uploaded.current = id;
      }
      if (!alive.current) return;
      const photo: CvPhoto = {
        assetId: id,
        crop: cropRectangle(local.width, local.height, crop).crop,
        shape,
        visible,
      };
      phase = "document";
      submitted.current = structuredClone(photo);
      const saved = await commit(photo, original.current);
      if (!alive.current) return;
      if (saved) {
        original.current = structuredClone(photo);
        setMessage(
          t(
            "Fotografie salvată automat în CV.",
            "Photo saved automatically in CV.",
          ),
        );
      } else {
        setFailed(true);
        setMessage(
          t(
            "Fotografia nu este încă salvată în CV. Rezolvă salvarea/conflictul din bara CV; editările sunt păstrate.",
            "Photo is not yet saved in the CV. Resolve the save/conflict in the CV bar; edits are retained.",
          ),
        );
      }
    } catch (error) {
      if (alive.current) {
        setFailed(true);
        const code = error instanceof Error ? error.message : "";
        const failurePhase =
          error instanceof PhotoClientError ? error.phase : undefined;
        setMessage(
          phase === "document"
            ? t(
                "Salvarea în CV nu a reușit. Fotografia anterioară rămâne salvată; reîncearcă după rezolvarea salvării CV.",
                "CV save failed. The prior photo remains saved; retry after resolving the CV save.",
              )
            : failurePhase === "configuration"
              ? t(
                  "Serviciul de fotografii nu este configurat. Fotografia anterioară se păstrează.",
                  "The photo service is not configured. The prior photo is retained.",
                )
              : failurePhase === "reserve"
                ? t(
                    "Nu am putut pregăti salvarea fotografiei în cont. Fotografia anterioară se păstrează; poți reîncerca.",
                    "We could not prepare the photo save in your account. The prior photo is retained; you can retry.",
                  )
                : failurePhase === "storage_write" ||
                    failurePhase === "storage_verify"
                  ? t(
                      "Nu am putut salva sau verifica fișierul fotografiei. Fotografia anterioară se păstrează; poți reîncerca.",
                      "We could not save or verify the photo file. The prior photo is retained; you can retry.",
                    )
                  : failurePhase === "finalize"
                    ? t(
                        "Fișierul a fost trimis, dar confirmarea salvării fotografiei nu a reușit. Fotografia anterioară se păstrează; poți reîncerca.",
                        "The file was sent, but the photo save could not be confirmed. The prior photo is retained; you can retry.",
                      )
                    : [
                          "invalidPhoto",
                          "photoDimensions",
                          "photoSize",
                          "animatedPhoto",
                          "normalizeLocally",
                        ].includes(code)
                      ? t(
                          "Fișierul nu a trecut validarea fotografiei. Alege o altă imagine JPEG, PNG sau WebP; fotografia anterioară se păstrează.",
                          "The file failed photo validation. Choose another JPEG, PNG or WebP image; the prior photo is retained.",
                        )
                      : t(
                          "Încărcarea fotografiei nu a reușit. Serviciul de fotografii poate fi indisponibil. Fotografia anterioară se păstrează; poți reîncerca.",
                          "Photo upload failed. The photo service may be unavailable. The prior photo is retained; you can retry.",
                        ),
        );
      }
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const saveLatest = useRef(save);
  saveLatest.current = save;
  useEffect(() => {
    if (!editing || !local || busy || dragging) return;
    const key = JSON.stringify([request.current, crop, shape, visible, retry]);
    if (attempted.current === key) return;
    const id = local.assetId ?? uploaded.current;
    if (
      id &&
      equalValues({ assetId: id, crop, shape, visible }, original.current)
    )
      return;
    setMessage(
      t(
        "Modificările fotografiei se salvează automat…",
        "Photo changes save automatically…",
      ),
    );
    const timer = setTimeout(() => {
      attempted.current = key;
      void saveLatest.current();
    }, 650);
    return () => clearTimeout(timer);
  }, [editing, local, crop, shape, visible, retry, busy, dragging]);
  async function remove() {
    setBusy(true);
    try {
      const saved = await commit(null, value ?? null);
      setMessage(
        saved
          ? t(
              "Fotografia a fost eliminată din acest CV; celelalte versiuni o pot păstra.",
              "Photo removed from this CV; other versions may retain it.",
            )
          : t(
              "Rezolvă salvarea CV din bara de jos.",
              "Resolve the CV save in the bar below.",
            ),
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function purge() {
    if (!client || !value) return;
    setBusy(true);
    setDeleting(true);
    try {
      await client.delete(value.assetId);
      await commit(null, value);
      if (alive.current) {
        setConfirm(false);
        setMessage(
          t(
            "Fotografie ștearsă de peste tot. Versiunile anterioare nu o mai pot afișa.",
            "Photo deleted everywhere. Historical versions can no longer display it.",
          ),
        );
      }
    } catch {
      if (alive.current)
        setMessage(
          t(
            "Accesul poate fi deja revocat. Reîncearcă ștergerea pentru a finaliza eliminarea fișierului.",
            "Access may already be revoked. Retry deletion to finish removing the file.",
          ),
        );
    } finally {
      if (alive.current) {
        setBusy(false);
        setDeleting(false);
      }
    }
  }
  const rect = local ? cropRectangle(local.width, local.height, crop) : null;
  return (
    <section
      className={`photo-editor ${dropActive ? "photo-drop-active" : ""}`}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          setDropActive(!busy);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDropActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropActive(false);
        if (!busy) void select(e.dataTransfer.files[0]);
      }}
      aria-label={t("Fotografie opțională", "Optional photo")}
    >
      <h3>{t("Fotografie (opțional)", "Photo (optional)")}</h3>
      <p>
        {t(
          "Trage o fotografie aici sau alege un fișier. Fotografia și ajustările se salvează automat.",
          "Drop a photo here or choose a file. Your photo and framing save automatically.",
        )}
      </p>
      {!client ? (
        <p>
          {t(
            "Fotografia necesită conexiunea autentificată la cont.",
            "Photos require the authenticated account connection.",
          )}
        </p>
      ) : (
        <>
          <input
            ref={file}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            aria-label={t("Alege o fotografie", "Choose a photo")}
            onChange={(e) => void select(e.target.files?.[0])}
          />
          <div className="photo-upload">
            <Button disabled={busy} onClick={() => file.current?.click()}>
              <ImagePlus size={18} aria-hidden="true" />
              {value || local
                ? t("Înlocuiește fotografia", "Replace photo")
                : t("Alege o fotografie", "Choose a photo")}
            </Button>
            <span className="photo-upload-hint">
              {t(
                "JPEG, PNG sau WebP · max. 10 MB",
                "JPEG, PNG or WebP · max. 10 MB",
              )}
            </span>
          </div>
          {!editing && value && (
            <div className="photo-actions">
              <button
                type="button"
                className="photo-frame-button"
                disabled={busy || !source.url}
                onClick={edit}
                aria-label={t("Ajustează fotografia", "Adjust photo")}
              >
                <canvas
                  ref={savedCanvas}
                  width={360}
                  height={360}
                  className={`photo-crop photo-${value.shape}`}
                  role="img"
                  aria-label={t("Fotografia actuală", "Current photo")}
                />
                <span className="photo-frame-hint">
                  <Move size={16} aria-hidden="true" />
                  {t(
                    "Apasă și trage pentru încadrare",
                    "Click, then drag to frame",
                  )}
                </span>
              </button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
              >
                {t("Elimină din acest CV", "Remove from this CV")}
              </Button>
              <Button
                type="button"
                disabled={busy}
                variant="danger"
                onClick={() => setConfirm(true)}
              >
                {t("Șterge fotografia de peste tot", "Delete photo everywhere")}
              </Button>
            </div>
          )}
          {editing && local && rect && (
            <>
              <div className="photo-framing">
                <div className="photo-frame-wrap">
                  <canvas
                    ref={canvas}
                    width={360}
                    height={360}
                    className={`photo-crop photo-${shape} ${dragging ? "is-dragging" : ""}`}
                    role="img"
                    tabIndex={0}
                    aria-label={t(
                      "Decupare fotografie. Trage pentru încadrare; săgețile deplasează imaginea, + și − modifică zoomul.",
                      "Photo framing. Drag to centre; arrow keys move the image, + and − zoom.",
                    )}
                    aria-describedby={controlId + "-instructions"}
                    onKeyDown={(e) => {
                      if (busy) return;
                      const directions: Record<string, [number, number]> = {
                        ArrowLeft: [-1, 0],
                        ArrowRight: [1, 0],
                        ArrowUp: [0, -1],
                        ArrowDown: [0, 1],
                      };
                      if (directions[e.key]) {
                        e.preventDefault();
                        const [x, y] = directions[e.key];
                        move(
                          x * (e.shiftKey ? 0.1 : 0.02),
                          y * (e.shiftKey ? 0.1 : 0.02),
                        );
                      } else if (["+", "=", "-", "_", "Home"].includes(e.key)) {
                        e.preventDefault();
                        if (e.key === "Home") position({ ...defaultPhotoCrop });
                        else
                          zoom(
                            cropCurrent.current.zoom +
                              (["+", "="].includes(e.key) ? 0.1 : -0.1),
                          );
                      }
                    }}
                    onPointerDown={(e) => {
                      if (busy || pointers.current.size >= 2) return;
                      pointers.current.set(e.pointerId, {
                        x: e.clientX,
                        y: e.clientY,
                      });
                      setDragging(true);
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      e.currentTarget.focus();
                      if (pointers.current.size === 1)
                        drag.current = { x: e.clientX, y: e.clientY };
                      else {
                        const [a, b] = [...pointers.current.values()];
                        pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
                        drag.current = null;
                      }
                    }}
                    onPointerMove={(e) => {
                      if (busy || !pointers.current.has(e.pointerId)) return;
                      pointers.current.set(e.pointerId, {
                        x: e.clientX,
                        y: e.clientY,
                      });
                      if (pointers.current.size === 2) {
                        const [a, b] = [...pointers.current.values()],
                          distance = Math.hypot(a.x - b.x, a.y - b.y);
                        if (pinch.current && distance > 0)
                          zoom(
                            (cropCurrent.current.zoom * distance) /
                              pinch.current,
                          );
                        pinch.current = distance;
                      } else if (drag.current) {
                        const width =
                          e.currentTarget.getBoundingClientRect().width;
                        move(
                          (e.clientX - drag.current.x) / width,
                          (e.clientY - drag.current.y) / width,
                        );
                        drag.current = { x: e.clientX, y: e.clientY };
                      }
                    }}
                    onPointerUp={(e) => endPointer(e.pointerId)}
                    onPointerCancel={(e) => endPointer(e.pointerId)}
                    onLostPointerCapture={(e) => endPointer(e.pointerId)}
                  />
                  <span className="photo-drag-cue" aria-hidden="true">
                    <Move size={18} />
                    {t("Trage pentru încadrare", "Drag to frame")}
                  </span>
                </div>
                <p id={controlId + "-instructions"} className="small muted">
                  {t(
                    "Trage imaginea pentru a o centra. Cu fotografia selectată, derulează pentru zoom; pe telefon, apropie sau depărtează două degete.",
                    "Drag the image to centre it. With the photo selected, scroll to zoom; on your phone, pinch with two fingers.",
                  )}
                </p>
                <output
                  className="sr-only"
                  aria-live="polite"
                  aria-label={t("Poziția fotografiei", "Photo position")}
                >
                  {t("Orizontală", "Horizontal")}{" "}
                  {(rect.crop.centerX * 100).toFixed(2)}% ·{" "}
                  {t("Verticală", "Vertical")}{" "}
                  {(rect.crop.centerY * 100).toFixed(2)}% · Zoom{" "}
                  {Math.round(crop.zoom * 100)}%
                </output>
                <div
                  className="photo-zoom-controls"
                  role="group"
                  aria-label={t("Zoom fotografie", "Photo zoom")}
                >
                  <Button
                    aria-label={t("Micșorează fotografia", "Zoom out")}
                    disabled={busy || crop.zoom <= 1}
                    onClick={() => zoom(cropCurrent.current.zoom - 0.1)}
                  >
                    <Minus size={16} aria-hidden="true" />
                  </Button>
                  <output aria-live="off">
                    {Math.round(crop.zoom * 100)}%
                  </output>
                  <Button
                    aria-label={t("Mărește fotografia", "Zoom in")}
                    disabled={busy || crop.zoom >= 3}
                    onClick={() => zoom(cropCurrent.current.zoom + 0.1)}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => position({ ...defaultPhotoCrop })}
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                    {t("Resetează încadrarea", "Reset framing")}
                  </Button>
                </div>
              </div>
              <label className="field">
                {t("Formă", "Shape")}
                <select
                  className="native"
                  value={shape}
                  disabled={busy}
                  onChange={(e) => setShape(e.target.value as typeof shape)}
                >
                  <option value="circle">{t("Cerc", "Circle")}</option>
                  <option value="square">{t("Pătrat", "Square")}</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={visible}
                  disabled={busy}
                  onChange={(e) => setVisible(e.target.checked)}
                />
                {t(" Afișează în acest CV", " Show in this CV")}
              </label>
              <div className="photo-actions">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    sequence.current++;
                    pointers.current.clear();
                    pinch.current = null;
                    drag.current = null;
                    setDragging(false);
                    setEditing(false);
                    setLocal(null);
                    setMessage("");
                  }}
                >
                  {t("Închide ajustările", "Close adjustments")}
                </Button>
              </div>
            </>
          )}
          {confirm && (
            <div
              className="notice notice-error"
              role="group"
              aria-label={t(
                "Confirmă ștergerea fotografiei",
                "Confirm photo deletion",
              )}
            >
              <p>
                {t(
                  "Ștergi această fotografie de peste tot? Va fi eliminată și din CV-urile adaptate existente și nu va mai fi disponibilă în versiunile anterioare. Copiile deja descărcate nu pot fi retrase.",
                  "Delete this stored photo everywhere? It will no longer be available in your CV or its historical versions. Downloaded copies cannot be recalled.",
                )}
              </p>
              <Button
                type="button"
                disabled={busy}
                variant="danger"
                onClick={() => void purge()}
              >
                {deleting
                  ? t("Se șterge…", "Deleting…")
                  : t("Șterge definitiv", "Delete permanently")}
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                {t("Anulează", "Cancel")}
              </Button>
            </div>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      {failed && editing && (
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            attempted.current = "";
            setRetry((n) => n + 1);
          }}
        >
          {t("Reîncearcă salvarea fotografiei", "Retry photo save")}
        </Button>
      )}
      {source.unavailable && !editing && value && (
        <div>
          <p role="status">
            {t(
              "Fotografia nu mai este disponibilă. Poți să o înlocuiești sau să o elimini din acest CV.",
              "Photo unavailable. Replace it or remove it from this CV.",
            )}
          </p>
          <Button type="button" onClick={source.retry}>
            {t("Reîncarcă fotografia", "Retry photo")}
          </Button>
        </div>
      )}
    </section>
  );
}
