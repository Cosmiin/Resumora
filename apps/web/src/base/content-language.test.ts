import { it, expect } from 'vitest';
import { contentLanguage } from '@resumora/contracts/editor/content-language';
import { importedDraft } from '@resumora/contracts/editor/import';
import { encodeDraft, decodeDraft } from '@resumora/contracts/editor/transport';
import type { ImportReview } from '@resumora/contracts/intelligence/model';
it.each(['en','ro'] as const)('preserves detected %s content language through import and saving', language => {
 const review={id:'import',sourceHash:'a'.repeat(64),format:'docx',parserVersion:'test',pages:null,admission:{kind:'cv',reason:'CV',pages:[]},extraction:{schemaVersion:'cv-extraction/1',detectedLanguage:language,candidates:[{id:'c1',path:'name',value:'Synthetic',quote:'Synthetic',page:null,confidence:'high'}],warnings:[],omittedPages:[]},confirmedIds:[]} as unknown as ImportReview;
 const draft=decodeDraft(encodeDraft(importedDraft(review)));
 expect(contentLanguage(draft)).toBe(language);
 expect(draft.documentLocale).toBe(language==='en'?'en-GB':'ro-RO');
});
it('respects explicit document output language and falls back for historical drafts',()=>{
 expect(contentLanguage({documentLocale:'en-GB',language:'ro'})).toBe('en');
 expect(contentLanguage({language:'ro'})).toBe('ro');
});
