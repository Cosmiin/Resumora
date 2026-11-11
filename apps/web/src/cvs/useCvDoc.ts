import { useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { TailorLanguageSchema, TailoredCvSchema, type JobExtraction, type TailoredCv } from "@resumora/shared";
import { getPreferences, preferencesKey, savePreferences } from "../account/account-api.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { getCv } from "../cv/cv-api.ts";
import { getTemplate, type TemplateId } from "../cv/page/templates.ts";
import type { ExportCv } from "../export/export-files.ts";
import { getJob } from "../jobs/jobs-api.ts";
import { apiFetch } from "../lib/api.ts";
import { getTailored, listTailored, setTemplate } from "../tailor/tailored-api.ts";

const ListItemSchema = z.object({
  id: z.string(), jobId: z.string(), language: TailorLanguageSchema, template: TailoredCvSchema.shape.template,
  translatedFrom: z.string().nullable(), updatedAt: z.string(), inProgress: z.boolean(), jobTitle: z.string(), company: z.string().nullable(),
});
export type TailoredListItem = z.infer<typeof ListItemSchema>;

/** Every tailored CV the person has, with the job it was made for. */
export async function listAllTailored(): Promise<TailoredListItem[]> {
  return (await apiFetch("/v1/tailored", { schema: z.object({ items: z.array(ListItemSchema) }) })).items;
}

/** "Role, Company": how a tailored CV is named everywhere. */
export const jobName = (title: string | undefined, company: string | null | undefined) => [title?.trim(), company?.trim()].filter(Boolean).join(", ");

/** The CV a template or export page is about: the base CV, or one job's tailored CV. */
export type CvDoc = {
  kind: "base" | "tailored";
  cv: ExportCv;
  /** The tailored row, for its review state; absent for the base CV. */
  tailored?: TailoredCv;
  job: JobExtraction | null;
  template: TemplateId;
  /** The person's default template. */
  defaultTemplate: TemplateId;
  /** This CV's page, its template page and its export page. */
  links: { open: string; template: string; export: string };
};

/**
 * Loads the CV for `/cv/...` (the base CV) or `/jobs/:id/cv/...` (`?cv=<id>` picks a language copy, as on the
 * tailored CV's page). `saveTemplate` stores the pick: on the tailored CV, or as the default for the base CV.
 */
export function useCvDoc() {
  const { id: jobId } = useParams();
  const [search] = useSearchParams();
  const wanted = search.get("cv");
  const userId = useAuth().session?.user.id ?? "anonymous";
  const client = useQueryClient();
  const key = ["cv-doc", userId, jobId ?? "base", wanted];

  const doc = useQuery({
    queryKey: key,
    gcTime: 0,
    queryFn: async (): Promise<CvDoc | null> => {
      const preferences = await getPreferences();
      const defaultTemplate = getTemplate(preferences.defaultTemplate).id;
      if (!jobId) {
        const base = await getCv();
        return { kind: "base", cv: { content: base.content, language: base.content.locale, coverLetter: null }, job: null,
          template: defaultTemplate, defaultTemplate, links: { open: "/cv", template: "/cv/template", export: "/cv/export" } };
      }
      const items = await listTailored(jobId);
      const pick = items.find((item) => item.id === wanted) ?? items.find((item) => item.translatedFrom === null) ?? items[0];
      if (!pick) return null;
      const [tailored, job] = await Promise.all([getTailored(pick.id), getJob(jobId).catch(() => null)]);
      const page = `/jobs/${encodeURIComponent(jobId)}/cv`;
      const query = `?cv=${encodeURIComponent(tailored.id)}`;
      return { kind: "tailored", cv: tailored, tailored, job: job?.extracted ?? null, template: getTemplate(tailored.template).id, defaultTemplate,
        links: { open: page + query, template: `${page}/template${query}`, export: `${page}/export${query}` } };
    },
  });

  /** Saves the template for this CV; `asDefault` also makes it the person's default (always so for the base CV). */
  async function saveTemplate(template: TemplateId, asDefault: boolean): Promise<void> {
    const current = doc.data;
    if (!current) return;
    if (current.tailored) await setTemplate(current.tailored.id, template);
    if (asDefault || current.kind === "base") client.setQueryData(preferencesKey(userId === "anonymous" ? undefined : userId), await savePreferences({ defaultTemplate: template }));
    client.setQueryData<CvDoc | null>(key, (old) => (old ? { ...old, template, defaultTemplate: asDefault || old.kind === "base" ? template : old.defaultTemplate } : old));
  }

  return { doc, saveTemplate };
}
