import { useState } from "react";
import { webcrypto } from "node:crypto";
import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { GuidedExperience } from "./GuidedExperience";
import { LanguageContext } from "./ui";
import { blankDraft, newRole, fact } from "../base/model";

it.each(["AI_DISABLED", "AI_UNCONFIGURED"])("explains %s without suggesting a retry will repair setup", async (code) => {
  Object.defineProperty(crypto, "subtle", { configurable: true, value: webcrypto.subtle });
  const initial = blankDraft();
  initial.language = "en";
  const role = newRole();
  role.title = fact("Analyst");
  role.context = fact("Prepared reports.");
  initial.roles = [role];
  const request = vi.fn(async () => { throw { code }; });
  function Harness() {
    const [draft, change] = useState(initial);
    return <LanguageContext value="en"><GuidedExperience draft={draft} targetId={role.id} change={change} ready saveFailed={false} request={request} /></LanguageContext>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Improve your experience through questions" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("AI assistance is currently unavailable");
  expect(alert.textContent).toContain("service needs to be configured");
  expect(alert.textContent).not.toContain("try again");
  expect(screen.queryByRole("button", { name: "Check result" })).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
});
