import { openProfileDetails, openProfilePresentation } from "../test-profile";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { PhotoEditor } from "./PhotoEditor";
import {
  PhotoContext,
  PhotoClientError,
  createPhotoClient,
  type PhotoClient,
} from "./client";
import { LanguageContext } from "../components/ui";
import { blankDraft } from "../base/model";
import {
  decodeDraft,
  encodeDraft,
  isBaseDraft,
} from "@resumora/contracts/editor/transport";
import { AdapterError, MemoryBaseCvAdapter } from "../base/adapter";
import { App } from "../App";
import {
  cropRectangle,
  isPhoto,
  type CvPhoto,
} from "@resumora/contracts/editor/photo";
import { inspectPhoto } from "@resumora/contracts/editor/photo-format";
import { readFileSync } from "node:fs";
import { Blob as NativeBlob } from "node:buffer";
// Actual Chrome 156 canvas.toBlob('image/jpeg', .95) output from a synthetic portrait.
const canvasJpeg = readFileSync(
  `${import.meta.dirname}/fixtures/chrome-canvas.jpg`,
);
const id = "11111111-1111-4111-8111-111111111111";
function client(): PhotoClient {
  return {
    upload: vi.fn(async () => ({ id })),
    read: vi.fn(async () => new Blob()),
    delete: vi.fn(async () => {}),
    subscribe: () => () => {},
    cleanup: vi.fn(async () => {}),
  };
}
function file() {
  const f = new File(["test"], "portrait.png", { type: "image/png" });
  Object.defineProperty(f, "arrayBuffer", {
    value: async () => {
      const b = new Uint8Array(33),
        v = new DataView(b.buffer);
      b.set([137, 80, 78, 71, 13, 10, 26, 10]);
      v.setUint32(8, 13);
      b.set([73, 72, 68, 82], 12);
      v.setUint32(16, 400);
      v.setUint32(20, 600);
      return b.buffer;
    },
  });
  return f;
}
function photoFrame() {
  return screen.getByRole("img", { name: /Photo framing|Decupare fotografie/ });
}
function readPosition() {
  const values = screen
    .getByLabelText(/Photo position|Poziția fotografiei/)
    .textContent!.match(/\d+(?:\.\d+)?(?=%)/g)!
    .map(Number);
  return { x: values[0] / 100, y: values[1] / 100, zoom: values[2] / 100 };
}
function zoomTo(value: number) {
  const canvas = photoFrame();
  for (let n = 0; n < 30 && Math.abs(readPosition().zoom - value) > 0.01; n++)
    fireEvent.keyDown(canvas, { key: readPosition().zoom < value ? "+" : "-" });
}
function frameAt(x: number, y: number, width = 400, height = 600) {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const canvas = photoFrame(),
    current = readPosition(),
    rect = cropRectangle(width, height, {
      version: 1,
      centerX: current.x,
      centerY: current.y,
      zoom: current.zoom,
    });
  Object.defineProperty(canvas, "setPointerCapture", {
    value: vi.fn(),
    configurable: true,
  });
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    width: 360,
  } as DOMRect);
  fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(canvas, {
    clientX: (((current.x - x) * width) / rect.size) * 360,
    clientY: (((current.y - y) * height) / rect.size) * 360,
  });
  fireEvent.pointerUp(canvas);
}
beforeEach(() => {
  vi.stubGlobal("Blob", NativeBlob);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => callback(new Blob([canvasJpeg], { type: "image/jpeg" })),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 400, height: 600, close: vi.fn() })),
  );
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 400;
      naturalHeight = 600;
      onload: () => void = () => {};
      set src(v: string) {
        if (v) queueMicrotask(() => this.onload());
      }
    },
  );
  URL.createObjectURL = vi.fn(() => "blob:synthetic");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("uploads accepted canvas bytes from Chrome and saves a Base photo", async () => {
  const port = client(),
    adapter = new MemoryBaseCvAdapter();
  window.location.hash = "#base";
  await adapter.save({
    draft: blankDraft(),
    expectedRevision: 0,
    mode: "autosave",
    requestId: crypto.randomUUID(),
  });
  const selected = new File([canvasJpeg], "portrait.jpg", {
    type: "image/jpeg",
  });
  Object.defineProperty(selected, "arrayBuffer", {
    value: async () =>
      canvasJpeg.buffer.slice(
        canvasJpeg.byteOffset,
        canvasJpeg.byteOffset + canvasJpeg.byteLength,
      ),
  });
  vi.mocked(createImageBitmap).mockResolvedValue({
    width: 800,
    height: 1000,
    close: vi.fn(),
  } as unknown as ImageBitmap);
  render(
    <PhotoContext.Provider value={port}>
      <App adapter={adapter} />
    </PhotoContext.Provider>,
  );
  await openProfileDetails();
  fireEvent.change(await screen.findByLabelText("Alege o fotografie"), {
    target: { files: [selected] },
  });
  await screen.findByLabelText("Formă");
  expect(port.upload).not.toHaveBeenCalled();

  await waitFor(() => expect(port.upload).toHaveBeenCalledTimes(1));
  const uploaded = vi.mocked(port.upload).mock.calls[0][0];
  const bytes = new Uint8Array(await uploaded.arrayBuffer());
  expect(inspectPhoto(bytes)).toEqual({
    mime: "image/jpeg",
    width: 800,
    height: 1000,
  });
  // Direct metadata-bearing input still requires local normalization.
  expect(() => inspectPhoto(canvasJpeg)).toThrow("normalizeLocally");
  await screen.findByText("Fotografie salvată automat în CV.");
  expect((await adapter.load())?.draft.presentation.photo?.assetId).toBe(id);
});
it("automatically coalesces photo/crop changes; keyboard and direct framing serialize and closing before debounce sends nothing", async () => {
  const port = client(),
    commit = vi.fn(
      async (_photo: CvPhoto | null, _expected: CvPhoto | null) => true,
    );
  render(
    <PhotoContext.Provider value={port}>
      <LanguageContext.Provider value="en">
        <PhotoEditor value={null} commit={commit} />
      </LanguageContext.Provider>
    </PhotoContext.Provider>,
  );
  fireEvent.change(screen.getByLabelText("Choose a photo"), {
    target: { files: [file()] },
  });
  await screen.findByRole("img", { name: /Photo framing/ });
  expect(port.upload).not.toHaveBeenCalled();
  zoomTo(2);
  frameAt(0.6, 0.4);
  fireEvent.change(screen.getByLabelText("Shape"), {
    target: { value: "circle" },
  });

  await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
  const photo = commit.mock.calls[0][0] as unknown as CvPhoto;
  expect(photo).toMatchObject({
    assetId: id,
    shape: "circle",
    visible: true,
    crop: { zoom: 2, centerX: 0.6, centerY: 0.4 },
  });
  expect(port.upload).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Choose a photo"), {
    target: { files: [file()] },
  });
  await screen.findByLabelText("Shape");
  fireEvent.click(screen.getByRole("button", { name: "Close adjustments" }));
  expect(commit).toHaveBeenCalledTimes(1);
});
it("uncertain CV save retains uploaded asset for retry; component unmount discards late upload reply", async () => {
  const port = client(),
    commit = vi.fn(
      async (_photo: CvPhoto | null, _expected: CvPhoto | null) => false,
    );
  const view = render(
    <PhotoContext.Provider value={port}>
      <LanguageContext.Provider value="en">
        <PhotoEditor value={null} commit={commit} />
      </LanguageContext.Provider>
    </PhotoContext.Provider>,
  );
  fireEvent.change(screen.getByLabelText("Choose a photo"), {
    target: { files: [file()] },
  });
  await screen.findByLabelText("Shape");

  await screen.findByText(/Photo is not yet saved/);
  fireEvent.click(screen.getByRole("button", { name: "Retry photo save" }));

  await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
  expect(port.upload).toHaveBeenCalledTimes(1);
  view.unmount();
  let resolve!: (v: { id: string }) => void;
  port.upload = vi.fn(
    () =>
      new Promise<{ id: string }>((r) => {
        resolve = r;
      }),
  );
  commit.mockClear();
  const second = render(
    <PhotoContext.Provider value={port}>
      <LanguageContext.Provider value="en">
        <PhotoEditor value={null} commit={commit} />
      </LanguageContext.Provider>
    </PhotoContext.Provider>,
  );
  fireEvent.change(screen.getByLabelText("Choose a photo"), {
    target: { files: [file()] },
  });
  await screen.findByLabelText("Shape");

  await waitFor(() => expect(port.upload).toHaveBeenCalledTimes(1));
  second.unmount();
  await act(async () => resolve({ id }));
  expect(commit).not.toHaveBeenCalled();
});
it("deletion confirmation explicitly names existing tailored CVs and client uses owned authenticated route", async () => {
  const transport = vi.fn(async (_path: string, _init?: RequestInit) =>
      Response.json({ deleted: true }),
    ),
    port = createPhotoClient(transport),
    notify = vi.fn();
  port.subscribe(notify);
  render(
    <PhotoContext.Provider value={port}>
      <LanguageContext.Provider value="en">
        <PhotoEditor
          value={{
            assetId: id,
            crop: { version: 1, centerX: 0.5, centerY: 0.5, zoom: 1 },
            shape: "square",
            visible: true,
          }}
          commit={async () => true}
        />
      </LanguageContext.Provider>
    </PhotoContext.Provider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Delete photo everywhere" }),
  );
  const group = screen.getByRole("group", { name: "Confirm photo deletion" });
  expect(group.textContent).toContain("existing tailored CVs");
  expect(
    transport.mock.calls.filter((c) => c[1]?.method === "DELETE"),
  ).toHaveLength(0);
  fireEvent.click(
    within(group).getByRole("button", { name: "Delete permanently" }),
  );
  await waitFor(() => expect(notify).toHaveBeenCalledWith(id));
  expect(transport).toHaveBeenCalledWith("/v1/photos/" + id, {
    method: "DELETE",
  });
});
it("strict wire format keeps old drafts and approved wording alongside photo, rejecting unsafe coordinates", () => {
  const old = blankDraft();
  expect(decodeDraft(encodeDraft(old))).toEqual(old);
  old.presentation.photo = {
    assetId: id,
    crop: { version: 1, centerX: 0.5, centerY: 0.5, zoom: 2 },
    shape: "circle",
    visible: true,
  };
  old.presentation.approvedWording = {
    field: {
      text: "Approved wording",
      sources: [{ id: "fact", text: "Supported", sourceId: "manual" }],
    },
  };
  expect(decodeDraft(encodeDraft(old))).toEqual(old);
  expect(
    isBaseDraft({
      ...old,
      presentation: {
        ...old.presentation,
        photo: {
          ...old.presentation.photo,
          crop: { ...old.presentation.photo.crop, zoom: NaN },
        },
      },
    }),
  ).toBe(false);
});
it("actual App photo commit merges late text edits and preserves presentation overlays in immutable history", async () => {
  const port = client(),
    adapter = new MemoryBaseCvAdapter(),
    draft = blankDraft();
  draft.presentation.approvedWording = { field: { text: "Keep", sources: [] } };
  await adapter.save({
    draft,
    expectedRevision: 0,
    mode: "autosave",
    requestId: crypto.randomUUID(),
  });
  let release!: (v: { id: string }) => void;
  port.upload = vi.fn(
    () =>
      new Promise<{ id: string }>((resolve) => {
        release = resolve;
      }),
  );
  window.location.hash = "#base";
  render(
    <PhotoContext.Provider value={port}>
      <App adapter={adapter} />
    </PhotoContext.Provider>,
  );
  await openProfileDetails();
  fireEvent.change(await screen.findByLabelText("Alege o fotografie"), {
    target: { files: [file()] },
  });
  await screen.findByLabelText("Formă");

  await waitFor(() => expect(port.upload).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
    target: { value: "Mara" },
  });
  await openProfilePresentation();
  fireEvent.change(screen.getByRole("combobox", { name: "Șablon" }), {
    target: { value: "template_archive_2_1_0" },
  });
  await act(async () => release({ id }));
  await screen.findByText("Fotografie salvată automat în CV.");
  const head = await adapter.load();
  expect(head?.draft.name.value).toBe("Mara");
  expect(head?.draft.presentation.templateVersionId).toBe(
    "template_archive_2_1_0",
  );
  expect(head?.draft.presentation.photo?.assetId).toBe(id);
  expect(head?.draft.presentation.approvedWording).toEqual(
    draft.presentation.approvedWording,
  );
  expect(
    (await adapter.history()).at(-1)?.draft.presentation.photo,
  ).toBeUndefined();
});
it.each(["replay", "expired"] as const)(
  "allows further photo edits after %s reconciliation and blocks unrelated photo changes",
  async (recovery) => {
    const port = client(),
      adapter = new MemoryBaseCvAdapter(),
      draft = blankDraft();
    draft.presentation.photo = {
      assetId: "22222222-2222-4222-8222-222222222222",
      crop: { version: 1, centerX: 0.5, centerY: 0.5, zoom: 1 },
      shape: "square",
      visible: true,
    };
    await adapter.save({
      draft,
      expectedRevision: 0,
      mode: "autosave",
      requestId: crypto.randomUUID(),
    });
    const persist = adapter.save.bind(adapter),
      save = vi.spyOn(adapter, "save").mockImplementation(persist);
    save.mockImplementationOnce(async (input) => {
      await persist(input);
      throw Error("lost response");
    });
    if (recovery === "expired")
      save.mockRejectedValueOnce(new AdapterError("expired"));
    window.location.hash = "#base";
    render(
      <PhotoContext.Provider value={port}>
        <App adapter={adapter} />
      </PhotoContext.Provider>,
    );
    await openProfileDetails();
    fireEvent.change(await screen.findByLabelText("Alege o fotografie"), {
      target: { files: [file()] },
    });
    await screen.findByLabelText("Formă");
    await screen.findByText(/Fotografia nu este încă salvată/);
    zoomTo(2);
    frameAt(0.6, 0.4);
    fireEvent.change(screen.getByLabelText("Formă"), {
      target: { value: "circle" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Afișează în acest CV/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reîncearcă salvarea fotografiei" }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Reîncearcă salvarea fotografiei" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Reîncearcă aceeași salvare" }),
    );
    if (recovery === "expired")
      fireEvent.click(
        await screen.findByRole("button", { name: "Verifică starea salvată" }),
      );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    fireEvent.click(
      screen.getByRole("button", { name: "Reîncearcă salvarea fotografiei" }),
    );
    await screen.findByText("Fotografie salvată automat în CV.");
    expect((await adapter.load())?.draft.presentation.photo).toMatchObject({
      assetId: id,
      shape: "circle",
      visible: false,
      crop: { version: 1, centerX: 0.6, centerY: 0.4, zoom: 2 },
    });
    expect(save).toHaveBeenCalledTimes(3);
    expect(port.upload).toHaveBeenCalledTimes(1);
    expect((await adapter.history()).at(-1)?.draft.presentation.photo).toEqual(
      draft.presentation.photo,
    );
    fireEvent.click(screen.getByRole("button", { name: "Închide ajustările" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Ajustează fotografia" }),
    );
    await screen.findByLabelText("Formă");
    fireEvent.click(
      screen.getByRole("button", { name: "Anulează ultima modificare" }),
    );
    // Undo has its own existing App autosave; settle that unrelated write first.
    await waitFor(() => expect(save).toHaveBeenCalledTimes(4));
    const unrelatedPhoto = structuredClone(
      (await adapter.load())?.draft.presentation.photo,
    );
    zoomTo(3);
    await screen.findByText(/Fotografia nu este încă salvată/);
    expect(save).toHaveBeenCalledTimes(4);
    expect((await adapter.load())?.draft.presentation.photo).toEqual(
      unrelatedPhoto,
    );
  },
);

it.each([
  [400, 600, 1],
  [400, 600, 2],
  [600, 400, 1],
  [600, 400, 2],
])(
  "clamps large pointer deltas on both axes and keeps movement/save working (%i×%i, zoom %i)",
  async (width, height, zoom) => {
    vi.mocked(createImageBitmap).mockResolvedValue({
      width,
      height,
      close: vi.fn(),
    } as unknown as ImageBitmap);
    vi.stubGlobal("PointerEvent", MouseEvent);
    const commit = vi.fn(
      async (_photo: CvPhoto | null, _expected: CvPhoto | null) => true,
    );
    render(
      <PhotoContext.Provider value={client()}>
        <LanguageContext.Provider value="en">
          <PhotoEditor value={null} commit={commit} />
        </LanguageContext.Provider>
      </PhotoContext.Provider>,
    );
    fireEvent.change(screen.getByLabelText("Choose a photo"), {
      target: { files: [file()] },
    });
    await screen.findByLabelText("Shape");
    zoomTo(zoom);
    const canvas = screen.getByRole("img", { name: /Photo framing/ });
    Object.defineProperty(canvas, "setPointerCapture", { value: vi.fn() });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 360,
    } as DOMRect);
    const bounds = {
      min: cropRectangle(width, height, {
        version: 1,
        centerX: 0,
        centerY: 0,
        zoom,
      }).crop,
      max: cropRectangle(width, height, {
        version: 1,
        centerX: 1,
        centerY: 1,
        zoom,
      }).crop,
    };
    fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0 });
    for (const [clientX, clientY] of [
      [3600, 3600],
      [-3600, -3600],
    ]) {
      fireEvent.pointerMove(canvas, { clientX, clientY });
      const { x, y } = readPosition();
      expect(x).toBeCloseTo(
        clientX > 0 ? bounds.min.centerX : bounds.max.centerX,
      );
      expect(y).toBeCloseTo(
        clientY > 0 ? bounds.min.centerY : bounds.max.centerY,
      );
    }
    fireEvent.pointerMove(canvas, { clientX: -3564, clientY: -3564 });
    if (bounds.min.centerX < bounds.max.centerX)
      expect(readPosition().x).toBeLessThan(bounds.max.centerX);
    if (bounds.min.centerY < bounds.max.centerY)
      expect(readPosition().y).toBeLessThan(bounds.max.centerY);
    fireEvent.pointerUp(canvas);

    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    const saved = commit.mock.calls[0][0]!;
    expect(isPhoto(saved)).toBe(true);
    expect(cropRectangle(width, height, saved.crop).crop).toEqual(saved.crop);
    for (const axis of ["centerX", "centerY"]) {
      for (const value of [-0.5, 1.5]) {
        const invalid = { ...saved, crop: { ...saved.crop, [axis]: value } };
        expect(isPhoto(invalid)).toBe(false);
        expect(() => cropRectangle(width, height, invalid.crop)).toThrow(
          "invalidPhotoCrop",
        );
      }
    }
  },
);

it("opening a saved frame does not autosave and upload failure retains the prior asset without retry loop", async () => {
  const port = client(),
    commit = vi.fn(async () => true),
    value: CvPhoto = {
      assetId: id,
      crop: { version: 1, centerX: 0.5, centerY: 0.5, zoom: 1 },
      shape: "square",
      visible: true,
    };
  render(
    <PhotoContext.Provider value={port}>
      <LanguageContext.Provider value="en">
        <PhotoEditor value={value} commit={commit} />
      </LanguageContext.Provider>
    </PhotoContext.Provider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Adjust photo" }));
  await screen.findByLabelText("Shape");
  await act(async () => {
    await new Promise((r) => setTimeout(r, 750));
  });
  expect(commit).not.toHaveBeenCalled();
  expect(port.upload).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Zoom in" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Center" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Save photo" })).toBeNull();
  vi.mocked(port.upload).mockRejectedValue(new Error("photoUnavailable"));
  fireEvent.change(screen.getByLabelText("Choose a photo"), {
    target: { files: [file()] },
  });
  await screen.findByText(/Photo upload failed/);
  expect(commit).not.toHaveBeenCalled();
  expect(value.assetId).toBe(id);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 750));
  });
  expect(port.upload).toHaveBeenCalledTimes(1);
});
it("holding a drag never dispatches an upload; release coalesces one automatic save", async () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const port = client(),
    commit = vi.fn(async () => true);
  render(
    <PhotoContext.Provider value={port}>
      <LanguageContext.Provider value="en">
        <PhotoEditor value={null} commit={commit} />
      </LanguageContext.Provider>
    </PhotoContext.Provider>,
  );
  fireEvent.change(screen.getByLabelText("Choose a photo"), {
    target: { files: [file()] },
  });
  const canvas = await screen.findByRole("img", { name: /Photo framing/ });
  Object.defineProperty(canvas, "setPointerCapture", { value: vi.fn() });
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    width: 88,
  } as DOMRect);
  fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(canvas, { clientX: 8, clientY: 8 });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 750));
  });
  expect(port.upload).not.toHaveBeenCalled();
  fireEvent.pointerUp(canvas);
  await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
  expect(port.upload).toHaveBeenCalledTimes(1);
});

it.each([
  ["configuration", /photo service is not configured/],
  ["reserve", /prepare the photo save in your account/],
  ["storage_write", /save or verify the photo file/],
  ["finalize", /photo save could not be confirmed/],
] as const)(
  "typed photo failure %s preserves prior photo with a specific reason",
  async (phase, reason) => {
    const port = client(),
      commit = vi.fn(async () => true),
      prior: CvPhoto = {
        assetId: id,
        crop: { version: 1, centerX: 0.5, centerY: 0.5, zoom: 1 },
        shape: "square",
        visible: true,
      };
    vi.mocked(port.upload).mockRejectedValue(
      new PhotoClientError("photoUnavailable", 503, phase),
    );
    render(
      <PhotoContext.Provider value={port}>
        <LanguageContext.Provider value="en">
          <PhotoEditor value={prior} commit={commit} />
        </LanguageContext.Provider>
      </PhotoContext.Provider>,
    );
    fireEvent.change(screen.getByLabelText("Choose a photo"), {
      target: { files: [file()] },
    });
    await screen.findByText(reason);
    expect(commit).not.toHaveBeenCalled();
    expect(prior.assetId).toBe(id);
    expect(
      screen.getByRole("button", { name: "Retry photo save" }),
    ).toBeTruthy();
  },
);
it("typed photo client accepts only known failure phases", async () => {
  const port = createPhotoClient(async () =>
    Response.json(
      { error: { code: "photoUnavailable", phase: "storage_write" } },
      { status: 503 },
    ),
  );
  await expect(port.upload(new Blob(), id)).rejects.toMatchObject({
    phase: "storage_write",
    status: 503,
    message: "photoUnavailable",
  });
  const unknown = createPhotoClient(async () =>
    Response.json(
      { error: { code: "photoUnavailable", phase: "PRIVATE_UNTRUSTED_PHASE" } },
      { status: 503 },
    ),
  );
  await expect(unknown.upload(new Blob(), id)).rejects.toMatchObject({
    phase: undefined,
    status: 503,
  });
});

it("offers a larger direct frame without sliders, supports focused wheel/pinch zoom, and saves only after release", async () => {
  class TouchPointer extends MouseEvent {
    pointerId: number;
    constructor(
      type: string,
      init: MouseEventInit & { pointerId?: number } = {},
    ) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  vi.stubGlobal("PointerEvent", TouchPointer);
  const port = client(),
    commit = vi.fn(async () => true);
  render(
    <PhotoContext value={port}>
      <LanguageContext value="en">
        <PhotoEditor value={null} commit={commit} />
      </LanguageContext>
    </PhotoContext>,
  );
  fireEvent.drop(screen.getByRole("region", { name: "Optional photo" }), {
    dataTransfer: { files: [file()] },
  });
  const frame = await screen.findByRole("img", { name: /Photo framing/ });
  Object.defineProperty(frame, "setPointerCapture", { value: vi.fn() });
  expect(screen.queryByRole("slider")).toBeNull();
  frame.focus();
  fireEvent.wheel(frame, { deltaY: -90 });
  expect(readPosition().zoom).toBeGreaterThan(1);
  fireEvent.click(screen.getByRole("button", { name: "Reset framing" }));
  expect(readPosition().zoom).toBe(1);
  fireEvent.pointerDown(frame, { pointerId: 1, clientX: 50, clientY: 100 });
  fireEvent.pointerDown(frame, { pointerId: 2, clientX: 150, clientY: 100 });
  fireEvent.pointerMove(frame, { pointerId: 2, clientX: 250, clientY: 100 });
  expect(readPosition().zoom).toBe(2);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 700));
  });
  expect(port.upload).not.toHaveBeenCalled();
  fireEvent.pointerUp(frame, { pointerId: 1 });
  expect(port.upload).not.toHaveBeenCalled();
  fireEvent.pointerCancel(frame, { pointerId: 2 });
  await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
  expect(port.upload).toHaveBeenCalledTimes(1);
});
