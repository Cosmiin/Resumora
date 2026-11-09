import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import type { CvContent } from "@resumora/shared";
import { useAuth } from "../../auth/AuthProvider.tsx";
import { t } from "../../i18n/t.ts";
import { supabase } from "../../lib/supabase.ts";

type Photo = NonNullable<CvContent["basics"]["photo"]>;
type Props = { photo: Photo | null | undefined; onChange(photo: Photo | null): void };
const extensions = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
const percent = (n: number) => Math.max(0, Math.min(100, n));

/** Private photo controls; only the storage path and crop settings enter the CV. */
export function PhotoField({ photo, onChange }: Props) {
  const userId = useAuth().session?.user.id;
  const inputId = useId();
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
    const ext = extensions.get(file.type);
    if (!ext) { setError(t("cv.photo.unsupported")); return; }
    if (file.size > 2097152) { setError(t("cv.photo.tooLarge")); return; }
    if (!userId) { setError(t("cv.photo.uploadError")); return; }
    const startingPath = path ?? null;
    setBusy(true);
    try {
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("cv-photos").upload(path, file, { contentType: file.type });
      if (error) throw error;
      if (currentPhoto.current && currentPhoto.current.path === startingPath) {
        onChange({ path, x: 50, y: 50, zoom: 1 });
      }
    } catch {
      setError(t("cv.photo.uploadError"));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    onChange(null);
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
    <div className="no-print" style={{ font: "var(--type-body)", color: "var(--text-body)", marginBlock: "var(--space-4)" }}>
      <label htmlFor={inputId}>{busy ? t("cv.photo.uploading") : t("cv.photo.choose")}</label>
      <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !userId}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void upload(file);
        }} />
      {error && <p role="alert" style={{ color: "var(--status-bad-fg)" }}>{error}</p>}
      {photo && (
        <>
          {url && (
            <div role="group" aria-label={t("cv.photo.position")} tabIndex={0}
              style={{ width: 120, height: 120, overflow: "hidden", borderRadius: "var(--radius-md)",
                touchAction: "none", cursor: "move", border: "1px solid var(--border-field)" }}
              onPointerDown={(event) => {
                event.preventDefault();
                drag.current = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: photo.x, y: photo.y };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                event.preventDefault();
                onChange({ ...photo,
                  x: percent(photo.x + (event.key === "ArrowRight" ? 5 : event.key === "ArrowLeft" ? -5 : 0)),
                  y: percent(photo.y + (event.key === "ArrowDown" ? 5 : event.key === "ArrowUp" ? -5 : 0)),
                });
              }}>
              <img src={url} alt={t("cv.photo.alt")} draggable={false}
                onError={() => setPreview(null)}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${photo.x}% ${photo.y}%`,
                  transform: `scale(${photo.zoom})`, transformOrigin: `${photo.x}% ${photo.y}%` }} />
            </div>
          )}
          <p>{t("cv.photo.positionHint")}</p>
          <label>{t("cv.photo.zoom")}
            <input type="range" min={1} max={3} step={0.1} value={photo.zoom} disabled={busy}
              style={{ accentColor: "var(--action-primary)" }}
              onChange={(event) => onChange({ ...photo, zoom: Number(event.currentTarget.value) })} />
          </label>
          <button type="button" disabled={busy} onClick={remove}>{t("cv.photo.remove")}</button>
        </>
      )}
    </div>
  );
}
