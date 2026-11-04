import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { JobsWorkspace } from "./JobsWorkspace";
import { WorkspaceContext, WorkspaceRegistry } from "../workspace/context";
import { LanguageContext } from "./ui";
import { blankDraft } from "../base/model";
import { workspaceLocation } from "../base/routes";
it.each(["fr-CA", "ar"])(
  "discovers and reopens retained %s job copies after Base deletion or replacement",
  async (locale) => {
    const id = crypto.randomUUID(),
      draft = blankDraft();
    draft.language = locale;
    draft.documentLocale = locale;
    const job = {
      id,
      state: "draft",
      versionId: null,
      createdAt: "2026-11-03T00:00:00Z",
      snapshotId: null,
      snapshotRevision: null,
      intake: { text: "Original employer advert", title: "Retained job" },
      requirements: [],
    };
    const versions = [
      { id: "retained", revision: 2, locale },
      { id: "other", revision: 1, locale: locale === "ar" ? "fr-CA" : "ar" },
    ];
    const context = {
      source: {
        pin: {
          kind: "job",
          jobId: id,
          currentId: "retained",
          revision: 2,
          locale,
        },
        locale,
        draft,
        items: [],
        accepted: true,
      },
      versions,
    };
    const calls: string[] = [],
      onDocument = vi.fn(),
      navigate = vi.fn();
    const registry = new WorkspaceRegistry(async (path: string) => {
      calls.push(path);
      if (path.startsWith("/v1/document-languages"))
        return Response.json(context);
      if (path === `/v1/jobs/${id}`) return Response.json(job);
      if (path.includes("/cv?locale="))
        return Response.json({ id: "retained", revision: 2, locale, draft });
      if (path.endsWith("/workflow") || path.includes("/workflow?"))
        return Response.json({
          revision: 1,
          extracted: null,
          reviewed: null,
          operations: [],
          duplicates: [],
          sourceParentId: null,
        });
      return Response.json(null);
    });
    const props = {
      location: workspaceLocation(`#/jobs/${id}`),
      profile: null,
      snapshot: null,
      ready: false,
      navigate,
      onDocument,
      onProfileAccepted: vi.fn(),
    };
    const view = render(
      <LanguageContext value="en">
        <WorkspaceContext value={registry}>
          <JobsWorkspace {...props} />
        </WorkspaceContext>
      </LanguageContext>,
    );
    await waitFor(() =>
      expect(onDocument).toHaveBeenCalledWith(
        id,
        "Retained job",
        locale,
        "retained:2",
      ),
    );
    expect(
      (
        screen.getByRole("combobox", {
          name: "CV language",
        }) as HTMLSelectElement
      ).value,
    ).toBe(locale);
    expect(
      screen
        .getAllByRole("option")
        .map((option) => (option as HTMLOptionElement).value),
    ).toEqual(expect.arrayContaining(versions.map((v) => v.locale)));
    expect(calls.filter((path) => path.includes("/cv?locale="))).toEqual([
      `/v1/jobs/${id}/cv?locale=${locale}`,
    ]);
    const replacement = blankDraft();
    replacement.language = "en";
    replacement.documentLocale = "en-GB";
    view.rerender(
      <LanguageContext value="en">
        <WorkspaceContext value={registry}>
          <JobsWorkspace {...props} profile={replacement} />
        </WorkspaceContext>
      </LanguageContext>,
    );
    expect(
      (
        screen.getByRole("combobox", {
          name: "CV language",
        }) as HTMLSelectElement
      ).value,
    ).toBe(locale);
    const other = versions[1].locale;
    fireEvent.change(screen.getByRole("combobox", { name: "CV language" }), {
      target: { value: other },
    });
    expect(navigate).toHaveBeenCalledWith(
      `#/jobs/${id}/cv/${other}?panel=details`,
    );
    view.rerender(
      <LanguageContext value="en">
        <WorkspaceContext value={registry}>
          <JobsWorkspace
            {...props}
            location={workspaceLocation(`#/jobs/${id}?panel=cv`)}
            profile={replacement}
          />
        </WorkspaceContext>
      </LanguageContext>,
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        `#/jobs/${id}/cv/${locale}?panel=cv`,
      ),
    );
  },
);
