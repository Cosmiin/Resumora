import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { blankDraft, newRole, fact } from "../base/model";
import {
  experiencePoints,
  experienceText,
  type DiagnosticAssessment,
} from "@resumora/contracts/intelligence/experience";
import { experiencePolicy } from "@resumora/contracts/intelligence/experience-policy";
import { ExperienceEnrichment } from "./ExperienceEnrichment";
import { ExperienceDetailPanel } from "./ExperienceDetailPanel";
import { LanguageContext } from "./ui";

const text =
  "Supported Romanian market-entry planning through partner outreach.";
function fixture(locale: "ro" | "en" = "en") {
  const d = blankDraft(),
    r = newRole();
  d.language = "en";
  d.documentLocale = "en";
  r.title = fact("Global Market Developer");
  r.context = fact(text);
  d.roles = [r];
  const value: DiagnosticAssessment = {
    rubric: "experience-quality/3",
    policyVersion: experiencePolicy.version,
    feedbackLocale: locale,
    scope: "complete",
    score: 65,
    experience: null,
    dimensions: ["contribution", "methods", "scope", "outcome"].map(
      (dimension) => ({
        dimension: dimension as any,
        grade: "missing",
        evidence: [],
      }),
    ),
    points: experiencePoints(text).map((point) => ({
      id: "p0",
      point,
      meaningful: true,
      contribution: "partial",
      clarity: "specific",
      specificity: "partial",
      issue: "contribution",
      score: 65,
      duplicateOf: null,
      strength:
        locale === "ro"
          ? "Precizează piața românească și scopul activității."
          : "Identifies the Romanian market and business purpose.",
      improvement:
        locale === "ro"
          ? "Nu este clar ce ai făcut personal."
          : "Your personal involvement in outreach is unclear.",
      suggestedQuestion:
        locale === "ro"
          ? "Ce ai făcut personal în contactarea partenerilor?"
          : "What did you personally do during the partner outreach?",
    })),
  };
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      assessment: { body: text, fingerprint: "a".repeat(64), value },
    },
  };
  return { d, r, value };
}
function view(f = fixture(), locale: "ro" | "en" = "en") {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const request = vi.fn(async () => {
    throw Error("Unexpected model call");
  });
  let latest = f.d;
  function Surface() {
    const [draft, setDraft] = useState(f.d);
    latest = draft;
    return (
      <LanguageContext value={locale}>
        <ExperienceEnrichment
          draft={draft}
          targetId={f.r.id}
          change={setDraft}
          ready
          saveFailed={false}
          request={request}
        />
      </LanguageContext>
    );
  }
  const result = render(<Surface />);
  return {
    ...result,
    request,
    get latest() {
      return latest;
    },
  };
}
it("shows concrete strengths and improvements, then opens the saved question without inference", async () => {
  const h = view();
  fireEvent.click(
    screen.getByRole("button", { name: /Supported Romanian.*Edit/ }),
  );
  expect(
    screen.getByText("Identifies the Romanian market and business purpose."),
  ).toBeTruthy();
  expect(
    screen.getAllByText("Your personal involvement in outreach is unclear.")
      .length,
  ).toBeGreaterThan(0);
  fireEvent.click(
    screen.getByRole("button", { name: "Help me add more detail" }),
  );
  await screen.findByRole("textbox", {
    name: "What did you personally do during the partner outreach?",
  });
  expect(h.request).not.toHaveBeenCalled();
  expect(experienceText(h.latest, h.latest.roles[0].id)).toBe(text);
});
it("uses an already confirmed answer rather than asking the diagnostic question again", async () => {
  const f = fixture();
  f.d.answers.push({
    id: "answer",
    targetId: f.r.id,
    question: "ownership",
    questionText: f.value.points[0].suggestedQuestion!,
    text: "I contacted prospective partners.",
    status: "confirmed",
    sourceId: "manual",
  });
  const h = view(f);
  fireEvent.click(
    screen.getByRole("button", { name: /Supported Romanian.*Edit/ }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Help me add more detail" }),
  );
  await screen.findByRole("button", { name: "Show me the point" });
  expect(
    screen.queryByRole("textbox", {
      name: f.value.points[0].suggestedQuestion!,
    }),
  ).toBeNull();
  expect(h.request).not.toHaveBeenCalled();
});
it("renders saved Romanian feedback for Romanian content and keeps missing coverage neutral", () => {
  const f = fixture("ro");
  f.d.documentLocale = "ro";
  const h = view(f, "ro");
  fireEvent.click(screen.getByRole("button", { name: /Supported Romanian/ }));
  expect(
    screen.getByText("Precizează piața românească și scopul activității."),
  ).toBeTruthy();
  expect(screen.queryByText("Missing", { exact: true })).toBeNull();
  expect(h.request).not.toHaveBeenCalled();
});
it("hides personalized prose in the wrong locale while retaining the current numerical assessment", () => {
  const f = fixture("ro");
  view(f, "en");
  fireEvent.click(
    screen.getByRole("button", { name: /Supported Romanian.*Edit/ }),
  );
  expect(screen.queryByText(f.value.points[0].strength!)).toBeNull();
  expect(
    screen.getByRole("button", { name: "Update feedback language" }),
  ).toBeTruthy();
  expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("65");
});
it("renders experience observations without manufacturing an outcome warning", () => {
  const f = fixture(),
    observation = {
      status: "clear" as const,
      strength:
        "The entry describes different partner-related responsibilities.",
      improvement: null,
      evidencePointIds: ["p0"],
    };
  f.value.experience = {
    distinctiveness: observation,
    professionalValue: {
      ...observation,
      strength: "The contribution supports a stated market-entry purpose.",
    },
    coherence: {
      ...observation,
      strength:
        "The responsibilities form an understandable account of the work.",
    },
    priorityPointId: "p0",
  };
  const score = {
    queue: vi.fn(),
    check: vi.fn(),
    running: false,
    preparing: false,
    current: true,
    automatic: true,
  };
  render(
    <LanguageContext value="en">
      <ExperienceDetailPanel
        assessment={f.d.experienceEnrichment![f.r.id].assessment}
        body={text}
        score={score}
        ready
      />
    </LanguageContext>,
  );
  expect(screen.getByText(observation.strength)).toBeTruthy();
  expect(screen.getAllByText("Not stated", { exact: true })).toHaveLength(4);
  expect(
    screen.queryByText("Explain the result or why the work mattered."),
  ).toBeNull();
});
