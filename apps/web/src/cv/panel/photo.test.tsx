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
  it("disables the upload button while uploading, then opens editing", async () => {
    let finishUpload!: () => void;
    const pendingUpload = new Promise<{ error: null }>((resolve) => {
      finishUpload = () => resolve({ error: null });
    });
    storage.upload.mockReturnValueOnce(pendingUpload);
    render(<Field />);
    const button = screen.getByRole("button", { name: "Upload photo" });
    expect(screen.getByText("JPG, PNG or WebP")).toBeInTheDocument();
    await userEvent.tab();
    expect(button).toHaveFocus();
    await userEvent.upload(screen.getByLabelText("Upload photo"),
      new File(["photo"], "portrait.png", { type: "image/png" }));
    expect(screen.getByRole("button", { name: "Uploading photo..." })).toBeDisabled();
    await act(async () => {
      finishUpload();
      await pendingUpload;
    });
    expect(screen.getByRole("slider", { name: "Photo zoom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("does not change content when an upload resolves after unmount", async () => {
    let finishUpload!: () => void;
    const pendingUpload = new Promise<{ error: null }>((resolve) => {
      finishUpload = () => resolve({ error: null });
    });
    storage.upload.mockReturnValueOnce(pendingUpload);
    const onChange = vi.fn();
    const { unmount } = render(<PhotoField photo={null} onChange={onChange} />);
    await userEvent.upload(screen.getByLabelText("Upload photo"),
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
    await user.upload(screen.getByLabelText("Upload photo"), file);
    expect(await screen.findByRole("img", { name: "CV photo" })).toHaveAttribute("src", "https://example.test/photo");
    const photo = contentPhoto();
    expect(photo).toEqual({ path: expect.stringMatching(/^user-a\/[\w-]+\.jpg$/), x: 50, y: 50, zoom: 1 });
    expect(storage.upload).toHaveBeenCalledWith(photo.path, file, { contentType: "image/jpeg" });
    expect(storage.from).toHaveBeenCalledWith("cv-photos");
    expect(storage.createSignedUrl).toHaveBeenCalledWith(photo.path, 3600);
    fireEvent.change(screen.getByRole("slider", { name: "Photo zoom" }), { target: { value: "2.3" } });
    expect(contentPhoto()).toEqual({ ...photo, zoom: 2.3 });
    expect(screen.getByRole("img")).toHaveStyle({ transform: "scale(2.3)" });
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Upload photo")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(contentPhoto()).toEqual({ ...photo, zoom: 2.3 });
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByText("Drag the photo or use the arrow keys to adjust its position.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adjust photo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(contentPhoto()).toBeNull();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeInTheDocument();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each([["image/png", "png"], ["image/webp", "webp"]])("removes then uploads %s without deleting stored photos", async (type, ext) => {
    render(<Field initial={initialPhoto} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    await userEvent.upload(screen.getByLabelText("Upload photo"), new File(["photo"], "portrait", { type }));
    await waitFor(() => expect(contentPhoto()?.path).toMatch(new RegExp(`^user-a/[\\w-]+\\.${ext}$`)));
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["image/gif", 10, "Choose a JPEG, PNG or WebP photo."],
  ])("rejects %s of %i bytes before uploading", async (type, size, message) => {
    render(<Field />);
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(screen.getByLabelText("Upload photo"), new File([new Uint8Array(size)], "portrait", { type }));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(contentPhoto()).toBeNull();
  });

  it("accepts a photo exactly 2 MB as it is", async () => {
    render(<Field />);
    await userEvent.upload(screen.getByLabelText("Upload photo"),
      new File([new Uint8Array(2097152)], "portrait.png", { type: "image/png" }));
    await waitFor(() => expect(contentPhoto()).not.toBeNull());
    expect(shrink.shrinkPhoto).not.toHaveBeenCalled();
  });

  it("shrinks a photo over 2 MB in the browser and uploads only the shrunk JPEG", async () => {
    const small = new Blob([new Uint8Array(900_000)], { type: "image/jpeg" });
    shrink.shrinkPhoto.mockResolvedValue(small);
    render(<Field />);
    const big = new File([new Uint8Array(2097153)], "portrait.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Upload photo"), big);
    await waitFor(() => expect(contentPhoto()?.path).toMatch(/^user-a\/[\w-]+\.jpg$/));
    expect(shrink.shrinkPhoto).toHaveBeenCalledWith(big, 2097152);
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.upload).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/), small, { contentType: "image/jpeg" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so, and uploads nothing, when a large photo can't be shrunk", async () => {
    shrink.shrinkPhoto.mockResolvedValue(null);
    render(<Field />);
    await userEvent.upload(screen.getByLabelText("Upload photo"),
      new File([new Uint8Array(2097153)], "portrait.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't make this photo small enough. Please try another photo.");
    expect(storage.upload).not.toHaveBeenCalled();
    expect(contentPhoto()).toBeNull();
  });

  it("leaves the CV without a photo when uploading after removal fails", async () => {
    storage.upload.mockResolvedValue({ error: { message: "offline" } });
    render(<Field initial={initialPhoto} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    await userEvent.upload(screen.getByLabelText("Upload photo"), new File(["photo"], "new.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't upload this photo. Please try again.");
    expect(contentPhoto()).toBeNull();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeEnabled();
  });

  it("loads an existing photo and saves position changes from dragging", async () => {
    // jsdom does not implement pointer events or pointer capture.
    vi.stubGlobal("PointerEvent", MouseEvent);
    try {
      render(<Field initial={initialPhoto} />);
      await screen.findByRole("img");
      await userEvent.click(screen.getByRole("button", { name: "Adjust photo" }));
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

  it.each(["click", "Enter", " "])("opens an existing saved photo for editing with %s", async (action) => {
    render(<Field initial={initialPhoto} />);
    await screen.findByRole("img");
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Upload photo")).not.toBeInTheDocument();
    const photo = screen.getByRole("button", { name: "Adjust photo" });
    if (action === "click") await userEvent.click(photo);
    else {
      photo.focus();
      await userEvent.keyboard(action === "Enter" ? "{Enter}" : " ");
    }
    expect(screen.getByRole("slider", { name: "Photo zoom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
    expect(contentPhoto()).toEqual(initialPhoto);
  });

  it.each(["signing", "image"])("still allows editing and removal when %s fails", async (failure) => {
    if (failure === "signing") storage.createSignedUrl.mockResolvedValue({ data: null, error: { message: "missing" } });
    render(<Field initial={initialPhoto} />);
    await waitFor(() => expect(storage.createSignedUrl).toHaveBeenCalled());
    if (failure === "image") fireEvent.error(await screen.findByRole("img"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Adjust photo" }));
    expect(screen.getByRole("slider", { name: "Photo zoom" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(contentPhoto()).toBeNull();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
