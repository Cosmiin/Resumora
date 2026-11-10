import { useEffect, useState } from "react";
import type { CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { supabase } from "../../lib/supabase.ts";

/** The saved photo and crop, shown in the template's header-right slot. */
export function CvPhoto({ photo }: { photo: CvContent["basics"]["photo"] }) {
  const path = photo?.path;
  const [signedPhoto, setSignedPhoto] = useState<{ path: string; url: string } | null>(null);
  const photoUrl = path && signedPhoto?.path === path ? signedPhoto.url : null;
  useEffect(() => {
    if (!path) return;
    let active = true;
    supabase.storage.from("cv-photos").createSignedUrl(path, 3600).then(({ data, error }) => {
      if (active) setSignedPhoto(!error && data ? { path, url: data.signedUrl } : null);
    }).catch(() => { if (active) setSignedPhoto(null); });
    return () => { active = false; };
  }, [path]);

  if (!photo || !photoUrl) return null;
  return (
    <div className="cv-photo" style={{ width: 96, height: 96, borderRadius: photo.shape === "round" ? "50%" : undefined, overflow: "hidden", float: "right", marginInlineStart: "var(--space-4)" }}>
      <img src={photoUrl} alt={t("cv.photo.alt")} draggable={false} onError={() => setSignedPhoto(null)}
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${photo.x}% ${photo.y}%`,
          transform: `scale(${photo.zoom})`, transformOrigin: `${photo.x}% ${photo.y}%` }} />
    </div>
  );
}
