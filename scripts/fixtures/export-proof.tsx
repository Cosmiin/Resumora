// Synthetic local-only proof entry, never imported by the application bundle.
import { createRoot } from "react-dom/client";
import { act } from "react";
import { DocumentPreview } from "../../apps/web/src/components/DocumentPreview";
import { LanguageContext } from "../../apps/web/src/components/ui";
import { maraReviewDraft } from "../../apps/web/src/base/fixture";
import { clone, fact, newOptionalEntry } from "../../apps/web/src/base/model";
import {
  chooseTemplate,
  cvTemplates,
} from "../../apps/web/src/templates/registry";
import {
  PhotoContext,
  type PhotoClient,
} from "../../apps/web/src/photo/client";
import { capturePrintDocument } from "../../apps/web/src/export/capture";
import { validatePdf } from "../../apps/web/src/export/pdf";
import "../../apps/web/src/styles.css";
const root = createRoot(document.getElementById("root")!);
const asOf = { year: "2026", month: "10" };
const portrait = document.createElement("canvas");
portrait.width = portrait.height = 320;
const ctx = portrait.getContext("2d")!;
ctx.fillStyle = "#d8e3df";
ctx.fillRect(0, 0, 320, 320);
ctx.fillStyle = "#17695d";
ctx.beginPath();
ctx.arc(160, 120, 60, 0, Math.PI * 2);
ctx.fill();
ctx.fillRect(80, 200, 160, 120);
const blob = await new Promise<Blob>((resolve) =>
  portrait.toBlob((b) => resolve(b!), "image/png"),
);
const photoClient: PhotoClient = {
  read: async () => blob,
  subscribe: () => () => {},
  cleanup: async () => {},
  upload: async () => {
    throw new Error("not used");
  },
  delete: async () => {},
};
let currentCapture: Awaited<ReturnType<typeof capturePrintDocument>>;
Object.assign(window, {
  exportProof: {
    templates: cvTemplates.map((t) => t.versionId),
    async render(
      index: number,
      locale: "ro" | "en",
      long: boolean,
      photo: boolean,
    ) {
      const draft = chooseTemplate(
        maraReviewDraft(),
        cvTemplates[index].versionId,
      );
      draft.language = locale;
      draft.name.value = "Mara Șerban Țăndărică";
      draft.summary.text =
        locale === "ro"
          ? "Am automatizat raportarea săptămânală a tichetelor de suport."
          : "Automated weekly support-ticket reporting.";
      draft.roles[0].context.value =
        locale === "ro"
          ? "Am scris instrucțiuni pentru colegi despre rularea și verificarea raportului."
          : "Wrote instructions for colleagues on running and checking the report.";
      draft.contacts[0].value.value =
        "mara.serban.synthetic.long.email@example.test";
      draft.contacts.at(-1)!.value.value =
        "https://example.test/a-very-long-path/synthetic-profile-automation-engineer";
      draft.presentation.photo = {
        assetId: "11111111-1111-4111-8111-111111111111",
        visible: photo,
        shape: "circle",
        crop: { version: 1, centerX: 0.5, centerY: 0.5, zoom: 1 },
      };
      const project = newOptionalEntry();
      project.title = fact("Synthetic custom project");
      project.details = fact(
        "SQL, Power Automate, Python, PostgreSQL, Supabase, REST API — 37 tickets, 12%.",
      );
      draft.optionalSections.push({
        id: "synthetic_project",
        kind: "custom",
        label: "Selected projects",
        entries: [project],
      });
      draft.presentation.order.push("synthetic_project");
      if (long) {
        const role = clone(draft.roles[0]);
        for (let i = 0; i < 5; i++) {
          const next = clone(role);
          next.id += `_${i}`;
          next.title.value = `Synthetic role ${i + 1}`;
          next.context.value = (next.context.value + " ").repeat(10);
          draft.roles.push(next);
        }
      }
      root.render(
        <LanguageContext.Provider value={locale === "en" ? "ro" : "en"}>
          <PhotoContext.Provider value={photoClient}>
            <DocumentPreview draft={draft} asOf={asOf} />
          </PhotoContext.Provider>
        </LanguageContext.Provider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      await document.fonts.ready;
      if (photo) {
        const deadline = Date.now() + 5000;
        while (!document.querySelector('canvas[data-photo-ready="true"]')) {
          if (Date.now() > deadline) throw new Error("photo timeout");
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
      currentCapture = await capturePrintDocument(
        document.querySelector("article.document")!,
      );
      return currentCapture;
    },
    async validate(base64: string) {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      return validatePdf(bytes, currentCapture.expected);
    },
  },
});

// Real affected controls with an injected offline boundary for local product inspection.
import { useState } from "react";
import { AppearanceExport } from "../../apps/web/src/export/AppearanceExport";
import { TranslationReview } from "../../apps/web/src/languages/TranslationReview";
import { translationItems } from "@resumora/contracts/editor/languages";
import type { LanguageProposal } from "@resumora/contracts/editor/language-transport";
function AppearanceProof() {
  const [draft, setDraft] = useState(() => maraReviewDraft());
  return <LanguageContext.Provider value="ro"><AppearanceExport draft={draft}
    snapshot={{id:"11111111-1111-4111-8111-111111111111",revision:1,parentId:null,createdAt:"now",reason:"save",draft}}
    pin={{kind:"base",versionId:"11111111-1111-4111-8111-111111111111",revision:1}}
    ready change={setDraft} asOf={asOf} transport={async()=>Response.json({error:{code:"pdfExportUnavailable"}},{status:503})}/></LanguageContext.Provider>;
}
Object.assign((window as any).exportProof, {
  appearance() { root.render(<AppearanceProof/>); },
  async review() {
    const draft=maraReviewDraft(),items=await translationItems(draft);
    const source={kind:"base" as const,documentId:draft.id,currentId:"synthetic-source",revision:1,fingerprint:"a".repeat(64)};
    let proposal:LanguageProposal={id:"synthetic-proposal",state:"ready",step:1,reviewRevision:0,review:null,accepted:null,
      request:{source,sourceLocale:"ro-RO",targetLocale:"en-GB",targetRevision:0,targetDocumentId:null,variantId:"lang_"+"b".repeat(64),sectionIds:[],glossary:[]},
      output:{schemaVersion:"cv-translation/1",sourceLocale:"ro-RO",targetLocale:"en-GB",completion:"complete",items:items.map(i=>({id:i.id,fieldId:i.fieldId,text:"Proposed: "+i.text,factIds:i.factIds,evidenceIds:i.evidenceIds})),warnings:[],ambiguousTerms:[],suggestedGlossary:[]}};
    const client={review:async(_id:string,_rev:number,review:NonNullable<LanguageProposal["review"]>)=>proposal={...proposal,review,reviewRevision:proposal.reviewRevision+1},
      accept:async()=>({kind:"base" as const,id:"synthetic-target",revision:1}),cancel:async()=>proposal,
      start:async()=>proposal,advance:async()=>proposal};
    root.render(<LanguageContext.Provider value="ro"><TranslationReview client={client} context={{pin:source,locale:"ro-RO",draft,items,accepted:true}} proposal={proposal} save={()=>{}} cancel={()=>{}}/></LanguageContext.Provider>);
  },
});
