import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentPreview } from "../components/DocumentPreview";
import { maraReviewDraft } from "../base/fixture";
import { clone } from "../base/model";
import { PhotoContext, type PhotoClient } from "../photo/client";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import type { CvPhoto } from "@resumora/contracts/editor/photo";
import { chooseTemplate, cvTemplates } from "./registry";

const photo: CvPhoto = {
  assetId: "11111111-1111-4111-8111-111111111111",
  crop: { version: 1, centerX: 0.6, centerY: 0.4, zoom: 2 },
  shape: "circle",
  visible: true,
};
const draw = vi.fn();
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 400;
      naturalHeight = 600;
      onload: () => void = () => {};
      set src(value: string) {
        if (value) queueMicrotask(() => this.onload());
      }
    },
  );
  URL.createObjectURL = vi.fn(() => "blob:synthetic-owned-photo");
  URL.revokeObjectURL = vi.fn();
  draw.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

it.each(cvTemplates)(
  "$name uses actual saved crop/mask and retains photo on a layout change",
  async (template) => {
    const port: PhotoClient = {
      upload: vi.fn(async () => ({ id: photo.assetId })),
      read: vi.fn(async () => new Blob()),
      delete: vi.fn(async () => {}),
      subscribe: () => () => {},
      cleanup: vi.fn(async () => {}),
    };
    const original = maraReviewDraft();
    original.presentation.photo = clone(photo);
    const next = decodeDraft(
      encodeDraft(chooseTemplate(original, template.versionId)),
    );
    expect(next.presentation.photo).toEqual(photo);
    expect(original.presentation.templateVersionId).toBeUndefined();
    const view = (draft: typeof next) => (
      <PhotoContext.Provider value={port}>
        <DocumentPreview draft={draft} asOf={{ year: "2026", month: "10" }} />
      </PhotoContext.Provider>
    );
    const { container, rerender } = render(view(next));
    const canvas = await screen.findByRole("img", {
      name: "Fotografie de profil",
    });
    await waitFor(() => expect(draw).toHaveBeenCalled());
    // The real shared PhotoPreview/cropRectangle chooses a 200px source crop at140,140.
    expect(draw).toHaveBeenCalledWith(
      expect.anything(),
      140,
      140,
      200,
      200,
      0,
      0,
      320,
      320,
    );
    expect(canvas.classList.contains("photo-circle")).toBe(true);
    expect(
      canvas.parentElement?.classList.contains(
        template.photoPlacement === "above"
          ? "document-identity"
          : "document-nameband",
      ),
    ).toBe(true);
    const text = container.querySelector("article.document")!.textContent;
    const square = clone(next);
    square.presentation.photo!.shape = "square";
    rerender(view(square));
    await waitFor(() =>
      expect(screen.getByRole("img").classList.contains("photo-square")).toBe(
        true,
      ),
    );
    expect(square.presentation.photo?.crop).toEqual(photo.crop);
    const hidden = clone(square);
    hidden.presentation.photo!.visible = false;
    rerender(view(hidden));
    expect(container.querySelector("canvas.document-photo")).toBeNull();
    expect(container.querySelector("article.document")!.textContent).toBe(text);
    expect(port.upload).not.toHaveBeenCalled();
    expect(port.delete).not.toHaveBeenCalled();
    expect(decodeDraft(encodeDraft(hidden)).presentation).toEqual(
      hidden.presentation,
    );
  },
);
