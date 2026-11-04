import { useEffect, useRef } from "react";
import { cropRectangle, type CvPhoto } from "@resumora/contracts/editor/photo";
import { usePhotoUrl } from "./client";
import { Button, useCopy } from "../components/ui";
export function PhotoPreview({ photo }: { photo: CvPhoto | null | undefined }) {
  const t = useCopy(),
    source = usePhotoUrl(photo?.visible ? photo.assetId : undefined),
    canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) delete canvas.current.dataset.photoReady;
    if (!source.url || !photo) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active || !canvas.current) return;
      const rect = cropRectangle(
          image.naturalWidth,
          image.naturalHeight,
          photo.crop,
        ),
        ctx = canvas.current.getContext("2d");
      ctx?.clearRect(0, 0, 320, 320);
      ctx?.drawImage(
        image,
        rect.x,
        rect.y,
        rect.size,
        rect.size,
        0,
        0,
        320,
        320,
      );
      if (ctx) canvas.current.dataset.photoReady = "true";
    };
    image.src = source.url;
    return () => {
      active = false;
      image.src = "";
    };
  }, [source.url, photo]);
  if (!photo?.visible) return null;
  if (source.unavailable)
    return (
      <div className="photo-unavailable">
        <p role="status">
          {t(
            "Fotografia nu mai este disponibilă. Înlocuiește-o sau elimin-o din acest CV.",
            "Photo unavailable. Replace it or remove it from this CV.",
          )}
        </p>
        <Button type="button" onClick={source.retry}>
          {t("Reîncarcă fotografia din previzualizare", "Retry preview photo")}
        </Button>
      </div>
    );
  if (!source.url)
    return (
      <span role="status">{t("Se încarcă fotografia…", "Loading photo…")}</span>
    );
  return (
    <canvas
      ref={canvas}
      width={320}
      height={320}
      className={`document-photo photo-${photo.shape}`}
      role="img"
      aria-label={t("Fotografie de profil", "Profile photo")}
    />
  );
}
