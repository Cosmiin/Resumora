import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { AppearanceExport, safePdfFilename } from "./AppearanceExport";
import { maraReviewDraft } from "../base/fixture";
const validate = vi.hoisted(() =>
  vi.fn(async () => ({ pages: 1, characters: 10, bytes: 1000 })),
);
vi.mock("./pdf", () => ({ validatePdf: validate }));
const version = "11111111-1111-4111-8111-111111111111";
const draft = maraReviewDraft(),
  snapshot = {
    id: version,
    revision: 1,
    parentId: null,
    createdAt: "now",
    reason: "save" as const,
    draft,
  };
const props = {
  draft,
  snapshot,
  pin: { kind: "base" as const, versionId: version, revision: 1 },
  ready: true,
  change: vi.fn(),
  asOf: { year: "2026", month: "10" },
};
const open = () =>
  fireEvent.click(screen.getByRole("button", { name: "Aspect și export" }));
it("opens and switches appearance without making any model/export request", () => {
  const transport = vi.fn();
  render(<AppearanceExport {...props} transport={transport} />);
  open();
  fireEvent.change(screen.getByRole("combobox", { name: "Șablon" }), {
    target: { value: "template_signal_2_1_0" },
  });
  expect(props.change).toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});
it("unavailable export retains the preview and provides no fake download", async () => {
  const transport = vi.fn(async (_path: string, _options?: RequestInit) =>
    Response.json({ error: { code: "pdfExportUnavailable" } }, { status: 503 }),
  );
  render(<AppearanceExport {...props} transport={transport} />);
  open();
  fireEvent.click(screen.getByRole("button", { name: "Pregătește PDF" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "nu este încă disponibil",
  );
  expect(screen.queryByRole("link", { name: "Descarcă PDF" })).toBeNull();
  expect(screen.getByText(draft.name.value)).toBeTruthy();
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual(
    props.pin,
  );
});
it("checks actual response bytes and source pin before enabling a named download", async () => {
  const create = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:synthetic-pdf");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const transport = vi.fn(
    async () =>
      new Response(new Uint8Array(1000), {
        headers: {
          "Content-Type": "application/pdf",
          "X-Document-Version": version,
          "X-Document-Revision": "1",
        },
      }),
  );
  render(<AppearanceExport {...props} transport={transport} />);
  open();
  fireEvent.click(screen.getByRole("button", { name: "Pregătește PDF" }));
  const link = await screen.findByRole("link", { name: "Descarcă PDF" });
  expect(validate).toHaveBeenCalled();
  expect(create).toHaveBeenCalled();
  expect(link.getAttribute("download")).toMatch(/\.pdf$/);
  fireEvent.change(screen.getByRole("textbox", { name: "Numele fișierului" }), {
    target: { value: "../Mara șerban?.pdf" },
  });
  expect(link.getAttribute("download")).toBe("Mara_serban.pdf");
});
it("source changes abort a pending export and discard its late response", async () => {
  let resolve!: (value: Response) => void;
  let signal: AbortSignal;
  const transport = vi.fn((_path: string, options: RequestInit = {}) => {
    signal = options.signal as AbortSignal;
    return new Promise<Response>((r) => (resolve = r));
  });
  const view = render(<AppearanceExport {...props} transport={transport} />);
  open();
  fireEvent.click(screen.getByRole("button", { name: "Pregătește PDF" }));
  view.rerender(
    <AppearanceExport
      {...props}
      snapshot={{ ...snapshot, revision: 2 }}
      pin={{ ...props.pin, revision: 2 }}
      transport={transport}
    />,
  );
  expect(signal!.aborted).toBe(true);
  resolve(
    new Response(new Uint8Array(1000), {
      headers: {
        "Content-Type": "application/pdf",
        "X-Document-Version": version,
        "X-Document-Revision": "1",
      },
    }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Pregătește PDF",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  expect(screen.queryByRole("link", { name: "Descarcă PDF" })).toBeNull();
});
it("sanitizes filenames and never permits a path or blank extension", () => {
  expect(safePdfFilename("../../\n")).toBe("CV.pdf");
  expect(safePdfFilename("Mara Șerban.pdf")).toBe("Mara_Serban.pdf");
});
