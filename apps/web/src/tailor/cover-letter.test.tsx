import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CoverLetter, type CvContent, type Job, type TailoredCv } from "@resumora/shared";

const tailoredApi = vi.hoisted(() => ({ writeLetter: vi.fn(), saveLetter: vi.fn() }));
vi.mock("./tailored-api.ts", () => tailoredApi);
vi.mock("../cv/enrich/useVoice.ts", () => ({ useVoice: vi.fn() }));
import { useVoice } from "../cv/enrich/useVoice.ts";

import { CoverLetterTab, pickLetter } from "./CoverLetterTab.tsx";
import { LetterPage } from "./LetterPage.tsx";

const content: CvContent = {
  ...emptyCv("en"),
  basics: { ...emptyCv("en").basics, fullName: "Ana Pop", email: "ana@example.test", phone: "+40 700 000 000", location: "Cluj" },
};
const letter: CoverLetter = { body: "First paragraph.\n\nSecond paragraph.", hiringManager: null, whyCompany: null, generatedAt: "2026-11-08T10:00:00Z" };
const tailored = (coverLetter: CoverLetter | null): TailoredCv => ({
  id: "tc-1", jobId: "job-1", language: "en", translatedFrom: null, content, baseSnapshot: content, baseSnapshotAt: "2026-11-08T09:00:00Z",
  template: "classic", tone: "neutral", instruction: null, review: null, score: null, coverLetter, version: 1,
  createdAt: "2026-11-08T09:00:00Z", updatedAt: "2026-11-08T09:00:00Z",
} as TailoredCv);
const job = { id: "job-1", status: "ready", userThoughts: "Love the remote setup",
  extracted: { title: "Payroll Engineer", company: "Globex" } } as unknown as Job;
const today = new Date("2026-11-08T12:00:00Z");

function renderTab(coverLetter: CoverLetter | null, onLetter = vi.fn()) {
  render(<CoverLetterTab cv={tailored(coverLetter)} job={job} letter={coverLetter} onLetter={onLetter} today={today} />);
  return onLetter;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useVoice).mockReturnValue({ state: "unavailable", count: null, connecting: false, partial: "", partialWords: [], seconds: 0,
    interrupted: false, start: vi.fn(), stop: vi.fn(), onFinal: vi.fn() });
  tailoredApi.writeLetter.mockResolvedValue({ coverLetter: letter, flags: [] });
  tailoredApi.saveLetter.mockImplementation(async (_id: string, edit: Partial<CoverLetter>) => ({ coverLetter: { ...letter, ...edit } }));
});

describe("Cover letter tab", () => {
  it("shows Write letter when there's no letter yet, and writes one with the side fields", async () => {
    const onLetter = renderTab(null);
    expect(screen.getByText("Uses your thoughts on the role ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Why Globex?"), "Their payroll tools");
    await userEvent.type(screen.getByLabelText("Hiring manager"), "Maria Ionescu");
    await userEvent.click(screen.getByRole("button", { name: "Write letter" }));
    expect(tailoredApi.writeLetter).toHaveBeenCalledWith("tc-1", { whyCompany: "Their payroll tools", hiringManager: "Maria Ionescu" });
    await waitFor(() => expect(onLetter).toHaveBeenCalledWith(letter));
  });

  it("shows the flags a written letter still has", async () => {
    tailoredApi.writeLetter.mockResolvedValue({ coverLetter: letter, flags: [{ rule: "number", detail: "A number that isn't in your CV" }] });
    renderTab(null);
    await userEvent.click(screen.getByRole("button", { name: "Write letter" }));
    expect(await screen.findByText(/A number that isn't in your CV/)).toBeInTheDocument();
  });

  it("asks before Regenerate replaces the letter", async () => {
    renderTab(letter);
    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(tailoredApi.writeLetter).not.toHaveBeenCalled();
    expect(screen.getByText("This replaces the letter, your edits included.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(tailoredApi.writeLetter).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await userEvent.click(screen.getByRole("button", { name: "Replace it" }));
    expect(tailoredApi.writeLetter).toHaveBeenCalledWith("tc-1", { whyCompany: "", hiringManager: "" });
  });

  it("autosaves edits to the body", async () => {
    const onLetter = renderTab(letter);
    const body = screen.getByLabelText("Letter text");
    expect(body).toHaveValue(letter.body);
    await userEvent.type(body, " More.");
    await waitFor(() => expect(tailoredApi.saveLetter).toHaveBeenCalledWith("tc-1",
      { body: `${letter.body} More.`, hiringManager: "", whyCompany: "" }), { timeout: 3000 });
    expect(tailoredApi.saveLetter).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onLetter).toHaveBeenCalled());
  });
});

describe("pickLetter", () => {
  const edited = { ...letter, body: "Edited." };
  it("uses the letter written or edited since this row was loaded", () => {
    expect(pickLetter(tailored(letter), { letter: edited, loadedAt: "2026-11-08T09:00:00Z" })).toEqual(edited);
    expect(pickLetter(tailored(letter), undefined)).toEqual(letter);
  });

  it("drops it once the row was reloaded (a re-translation replaced the copy's letter)", () => {
    expect(pickLetter(tailored(letter), { letter: edited, loadedAt: "2026-11-08T08:00:00Z" })).toEqual(letter);
  });
});

describe("Cover letter tab while writing", () => {
  it("locks the side fields until the letter comes back", async () => {
    tailoredApi.writeLetter.mockReturnValue(new Promise(() => {}));
    renderTab(letter);
    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await userEvent.click(screen.getByRole("button", { name: "Replace it" }));
    expect(screen.getByLabelText("Hiring manager")).toBeDisabled();
    expect(screen.getByLabelText("Why Globex?")).toBeDisabled();
    expect(screen.getByLabelText("Letter text")).toBeDisabled();
  });
});

describe("Letter page", () => {
  const header = { basics: content.basics, role: "Payroll Engineer", company: "Globex", date: today };

  it("renders the header, Re: line, greeting and signature with a manager name", () => {
    render(<LetterPage {...header} locale="en" hiringManager="Maria Ionescu" body={<p>Body</p>} />);
    expect(screen.getAllByText("Ana Pop")).toHaveLength(2);
    expect(screen.getByText("ana@example.test · +40 700 000 000 · Cluj")).toBeInTheDocument();
    expect(screen.getByText("November 8, 2026")).toBeInTheDocument();
    expect(screen.getByText("Re: Payroll Engineer, Globex")).toBeInTheDocument();
    expect(screen.getByText("Dear Maria Ionescu,")).toBeInTheDocument();
    expect(screen.getByText("Kind regards,")).toBeInTheDocument();
  });

  it("greets the hiring team without a manager name", () => {
    render(<LetterPage {...header} locale="en" hiringManager="  " body={<p>Body</p>} />);
    expect(screen.getByText("Dear Hiring Team,")).toBeInTheDocument();
  });

  it("formats the date and the app-added words in the letter's language", () => {
    render(<LetterPage {...header} locale="de" hiringManager={null} body={<p>Body</p>} />);
    expect(screen.getByText("8. November 2026")).toBeInTheDocument();
    expect(screen.getByText("Betreff: Payroll Engineer, Globex")).toBeInTheDocument();
    expect(screen.getByText("Sehr geehrte Damen und Herren,")).toBeInTheDocument();
    expect(screen.getByText("Mit freundlichen Grüßen")).toBeInTheDocument();
  });
});
