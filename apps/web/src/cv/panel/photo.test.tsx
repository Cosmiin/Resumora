import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent } from "@resumora/shared";
import { cvReducer } from "../edit/cvReducer.ts";
import { HeaderEdit } from "../edit/sections/HeaderEdit.tsx";
import { PhotoField } from "./PhotoField.tsx";

const storage = vi.hoisted(() => ({ upload: vi.fn(), createSignedUrl: vi.fn(), remove: vi.fn(), from: vi.fn() }));
vi.mock("../../lib/supabase.ts", () => ({ supabase: { storage: { from: storage.from } } }));
vi.mock("../../auth/AuthProvider.tsx", () => ({ useAuth: () => ({ session: { user: { id: "user-a" } } }) }));
const shrink = vi.hoisted(() => ({ shrinkPhoto: vi.fn() }));
vi.mock("./shrink-photo.ts", () => shrink);

const initialPhoto = { path: "user-a/photo.jpg", x: 50, y: 50, zoom: 1 };
function Field({ initial = null }: { initial?: CvContent["basics"]["photo"] }) {
  const [cv, dispatch] = useReducer(cvReducer, { ...emptyCv(), basics: { ...emptyCv().basics, photo: initial } });
  return <>
    <HeaderEdit basics={cv.basics} dispatch={dispatch} />
    <output data-testid="photo">{JSON.stringify(cv.basics.photo)}</output>
  </>;
}
const contentPhoto = () => JSON.parse(screen.getByTestId("photo").textContent!);

beforeEach(() => {
  vi.resetAllMocks();
  storage.from.mockReturnValue(storage);
  storage.upload.mockResolvedValue({ data: {}, error: null });
  storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://example.test/photo" }, error: null });
  storage.remove.mockResolvedValue({ data: [], error: null });
});

describe("CV photo", () => {
  it("applies a replacement upload after dragging the existing photo", async () => {
    let finishUpload!: () => void;
    const pendingUpload = new Promise<{ error: null }>((resolve) => {
      finishUpload = () => resolve({ error: null });
    });
    storage.upload.mockReturnValueOnce(pendingUpload);
    vi.stubGlobal("PointerEvent", MouseEvent);
    try {
      render(<Field initial={initialPhoto} />);
      await screen.findByRole("img");
      await userEvent.upload(screen.getByLabelText("Choose a photo"),
        new File(["photo"], "replacement.png", { type: "image/png" }));
      const preview = screen.getByRole("group", { name: "Photo position" });
      preview.setPointerCapture = vi.fn();
      vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({ width: 120, height: 120 } as DOMRect);
      fireEvent.pointerDown(preview, { clientX: 60, clientY: 60 });
      fireEvent.pointerMove(preview, { clientX: 90, clientY: 30 });
      fireEvent.pointerUp(preview);
      expect(contentPhoto()).toEqual({ ...initialPhoto, x: 25, y: 75 });
      await act(async () => {
        finishUpload();
        await pendingUpload;
      });
      expect(contentPhoto()).toEqual({
        path: expect.stringMatching(/^user-a\/[\w-]+\.png$/), x: 50, y: 50, zoom: 1,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not change content when an upload resolves after unmount", async () => {
    let finishUpload!: () => void;
    const pendingUpload = new Promise<{ error: null }>((resolve) => {
      finishUpload = () => resolve({ error: null });
    });
    storage.upload.mockReturnValueOnce(pendingUpload);
    const onChange = vi.fn();
    const { unmount } = render(<PhotoField photo={null} onChange={onChange} />);
    await userEvent.upload(screen.getByLabelText("Choose a photo"),
      new File(["photo"], "portrait.jpg", { type: "image/jpeg" }));
    expect(storage.upload).toHaveBeenCalledOnce();
    unmount();
    await act(async () => {
      finishUpload();
      await pendingUpload;
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uploads, previews, zooms and removes a photo through the content", async () => {
    const user = userEvent.setup();
    render(<Field />);
    const file = new File(["photo"], "portrait.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Choose a photo"), file);
    expect(await screen.findByRole("img", { name: "CV photo" })).toHaveAttribute("src", "https://example.test/photo");
    const photo = contentPhoto();
    expect(photo).toEqual({ path: expect.stringMatching(/^user-a\/[\w-]+\.jpg$/), x: 50, y: 50, zoom: 1 });
    expect(storage.upload).toHaveBeenCalledWith(photo.path, file, { contentType: "image/jpeg" });
    expect(storage.from).toHaveBeenCalledWith("cv-photos");
    expect(storage.createSignedUrl).toHaveBeenCalledWith(photo.path, 3600);
    fireEvent.change(screen.getByRole("slider", { name: "Photo zoom" }), { target: { value: "2.3" } });
    expect(contentPhoto()).toEqual({ ...photo, zoom: 2.3 });
    expect(screen.getByRole("img")).toHaveStyle({ transform: "scale(2.3)" });
    await user.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(contentPhoto()).toBeNull();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each([["image/png", "png"], ["image/webp", "webp"]])("replaces a photo with %s without deleting stored photos", async (type, ext) => {
    render(<Field initial={initialPhoto} />);
    await userEvent.upload(screen.getByLabelText("Choose a photo"), new File(["photo"], "portrait", { type }));
    await waitFor(() => expect(contentPhoto()?.path).toMatch(new RegExp(`^user-a/[\\w-]+\\.${ext}$`)));
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["image/gif", 10, "Choose a JPEG, PNG or WebP photo."],
  ])("rejects %s of %i bytes before uploading", async (type, size, message) => {
    render(<Field />);
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(screen.getByLabelText("Choose a photo"), new File([new Uint8Array(size)], "portrait", { type }));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(contentPhoto()).toBeNull();
  });

  it("accepts a photo exactly 2 MB as it is", async () => {
    render(<Field />);
    await userEvent.upload(screen.getByLabelText("Choose a photo"),
      new File([new Uint8Array(2097152)], "portrait.png", { type: "image/png" }));
    await waitFor(() => expect(contentPhoto()).not.toBeNull());
    expect(shrink.shrinkPhoto).not.toHaveBeenCalled();
  });

  it("shrinks a photo over 2 MB in the browser and uploads only the shrunk JPEG", async () => {
    const small = new Blob([new Uint8Array(900_000)], { type: "image/jpeg" });
    shrink.shrinkPhoto.mockResolvedValue(small);
    render(<Field />);
    const big = new File([new Uint8Array(2097153)], "portrait.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Choose a photo"), big);
    await waitFor(() => expect(contentPhoto()?.path).toMatch(/^user-a\/[\w-]+\.jpg$/));
    expect(shrink.shrinkPhoto).toHaveBeenCalledWith(big, 2097152);
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.upload).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/), small, { contentType: "image/jpeg" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so, and uploads nothing, when a large photo can't be shrunk", async () => {
    shrink.shrinkPhoto.mockResolvedValue(null);
    render(<Field />);
    await userEvent.upload(screen.getByLabelText("Choose a photo"),
      new File([new Uint8Array(2097153)], "portrait.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't make this photo small enough. Please try another photo.");
    expect(storage.upload).not.toHaveBeenCalled();
    expect(contentPhoto()).toBeNull();
  });

  it("keeps the previous photo when uploading fails", async () => {
    storage.upload.mockResolvedValue({ error: { message: "offline" } });
    render(<Field initial={initialPhoto} />);
    await userEvent.upload(screen.getByLabelText("Choose a photo"), new File(["photo"], "new.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't upload this photo. Please try again.");
    expect(contentPhoto()).toEqual(initialPhoto);
  });

  it("loads an existing photo and saves position changes from dragging", async () => {
    // jsdom does not implement pointer events or pointer capture.
    vi.stubGlobal("PointerEvent", MouseEvent);
    try {
      render(<Field initial={initialPhoto} />);
      await screen.findByRole("img");
      const preview = screen.getByRole("group", { name: "Photo position" });
      preview.setPointerCapture = vi.fn();
      vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({ width: 120, height: 120 } as DOMRect);
      fireEvent.pointerDown(preview, { clientX: 60, clientY: 60 });
      fireEvent.pointerMove(preview, { clientX: 90, clientY: 30 });
      fireEvent.pointerUp(preview);
      expect(contentPhoto()).toEqual({ ...initialPhoto, x: 25, y: 75 });
      expect(screen.getByRole("img")).toHaveStyle({ objectPosition: "25% 75%" });
      fireEvent.keyDown(preview, { key: "ArrowRight" });
      expect(contentPhoto().x).toBe(30);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("still allows removal when the signed preview fails", async () => {
    storage.createSignedUrl.mockResolvedValue({ data: null, error: { message: "missing" } });
    render(<Field initial={initialPhoto} />);
    await waitFor(() => expect(storage.createSignedUrl).toHaveBeenCalled());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(contentPhoto()).toBeNull();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
