import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import type { CvContent } from "@resumora/shared";
import { useAuth } from "../../auth/AuthProvider.tsx";
import { t } from "../../i18n/t.ts";
import { supabase } from "../../lib/supabase.ts";
import { shrinkPhoto } from "./shrink-photo.ts";

type Photo = NonNullable<CvContent["basics"]["photo"]>;
type Props = { photo: Photo | null | undefined; onChange(photo: Photo | null): void };
const extensions = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
/** The photo storage limit (2 MB, the cv-photos bucket); larger photos are shrunk to fit first. */
const MAX_PHOTO_BYTES = 2097152;
const percent = (n: number) => Math.max(0, Math.min(100, n));

/** Private photo controls; only the storage path and crop settings enter the CV. */
export function PhotoField({ photo, onChange }: Props) {
  const userId = useAuth().session?.user.id;
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ path: string; url: string } | null>(null);
  const drag = useRef<{ id: number; clientX: number; clientY: number; x: number; y: number } | null>(null);
  const path = photo?.path;
  const url = preview?.path === path ? preview?.url : undefined;
  const currentPhoto = useRef<{ path: string | null } | null>(null);

  useEffect(() => {
    currentPhoto.current = { path: path ?? null };
    return () => { currentPhoto.current = null; };
  }, [path]);

  useEffect(() => {
    if (!path) return;
    let active = true;
    supabase.storage.from("cv-photos").createSignedUrl(path, 3600).then(({ data, error }) => {
      if (active) setPreview(!error && data ? { path, url: data.signedUrl } : null);
    }).catch(() => { if (active) setPreview(null); });
    return () => { active = false; };
  }, [path]);

  async function upload(file: File) {
    setError("");
    let ext = extensions.get(file.type);
    if (!ext) { setError(t("cv.photo.unsupported")); return; }
    if (!userId) { setError(t("cv.photo.uploadError")); return; }
    const startingPath = path ?? null;
    setBusy(true);
    try {
      // Too large: only the shrunk JPEG is uploaded; the original never leaves the browser.
      let body: Blob = file;
      let type = file.type;
      if (file.size > MAX_PHOTO_BYTES) {
        const shrunk = await shrinkPhoto(file, MAX_PHOTO_BYTES);
        if (!shrunk) { setError(t("cv.photo.shrinkError")); return; }
        [body, type, ext] = [shrunk, "image/jpeg", "jpg"];
      }
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("cv-photos").upload(path, body, { contentType: type });
      if (error) throw error;
      if (currentPhoto.current && currentPhoto.current.path === startingPath) {
        onChange({ path, x: 50, y: 50, zoom: 1 });
        setEditing(true);
      }
    } catch {
      setError(t("cv.photo.uploadError"));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    onChange(null);
    setEditing(false);
    setError("");
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!photo || !start || start.id !== event.pointerId) return;
    const { width, height } = event.currentTarget.getBoundingClientRect();
    if (!width || !height) return;
    onChange({ ...photo,
      x: percent(start.x - (event.clientX - start.clientX) / width * 100),
      y: percent(start.y - (event.clientY - start.clientY) / height * 100),
    });
  }

  return (
    <div className={`photo-field no-print${photo && !editing ? " is-saved" : ""}`}>
      {!photo && <>
        <button type="button" className="btn" disabled={busy || !userId}
          aria-describedby={`${inputId}-formats`} onClick={() => input.current?.click()}>
          {busy ? t("cv.photo.uploading") : t("cv.photo.choose")}
        </button>
        <input ref={input} id={inputId} type="file" hidden aria-label={t("cv.photo.choose")}
          accept="image/jpeg,image/png,image/webp" disabled={busy || !userId}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void upload(file);
          }} />
        <p id={`${inputId}-formats`}>{t("cv.photo.formats")}</p>
      </>}
      {error && <p role="alert" style={{ color: "var(--status-bad-fg)" }}>{error}</p>}
      {photo && (
        <>
          <div className="photo-box">
            <div className={`photo-preview${editing ? " is-editing" : ""}`}
              role={editing ? "group" : "button"} aria-label={t(editing ? "cv.photo.position" : "cv.photo.edit")} tabIndex={0}
              onClick={() => { if (!editing) setEditing(true); }}
              onPointerDown={(event) => {
                if (!editing) return;
                event.preventDefault();
                drag.current = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: photo.x, y: photo.y };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
              onKeyDown={(event) => {
                if (!editing) {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setEditing(true);
                  }
                  return;
                }
                if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                event.preventDefault();
                onChange({ ...photo,
                  x: percent(photo.x + (event.key === "ArrowRight" ? 5 : event.key === "ArrowLeft" ? -5 : 0)),
                  y: percent(photo.y + (event.key === "ArrowDown" ? 5 : event.key === "ArrowUp" ? -5 : 0)),
                });
              }}>
              {url && <img src={url} alt={t("cv.photo.alt")} draggable={false}
                onError={() => setPreview(null)}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${photo.x}% ${photo.y}%`,
                  transform: `scale(${photo.zoom})`, transformOrigin: `${photo.x}% ${photo.y}%` }} />}
            </div>
            {!editing && <button type="button" className="photo-remove" aria-label={t("cv.photo.remove")}
              onClick={remove}>×</button>}
          </div>
          {editing && <>
            <p>{t("cv.photo.positionHint")}</p>
            <label>{t("cv.photo.zoom")}
              <input type="range" min={1} max={3} step={0.1} value={photo.zoom} disabled={busy}
                style={{ accentColor: "var(--action-primary)" }}
                onChange={(event) => onChange({ ...photo, zoom: Number(event.currentTarget.value) })} />
            </label>
            <button type="button" className="btn primary" onClick={() => setEditing(false)}>{t("cv.photo.save")}</button>
          </>}
        </>
      )}
    </div>
  );
}
