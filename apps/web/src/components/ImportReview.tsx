import { useState } from 'react';
import { allFacts, type BaseDraft } from '../base/model';
import { Button, useCopy } from './ui';
export function ImportReview({draft,confirm,disabled}:{draft:BaseDraft;confirm:(ids:string[])=>void;disabled:boolean}){
  const t=useCopy(),review=draft.importReview!;
  const [selected,setSelected]=useState<string[]>([]);
  const pending=review.extraction.candidates.filter(c=>allFacts(draft).some(f=>f.sourceClaimId===c.id&&f.status==='extracted_unconfirmed'));
  if(!pending.length)return null;
  return <section className="card"><h2>{t('Verifică informațiile importate','Review imported facts')}</h2>
    <p>{t('Selectează informațiile pe care le-ai verificat. Corectează valorile în editor; datele lipsă rămân necunoscute. Salvarea automată a schiței nu confirmă informațiile.','Select the facts you have reviewed. Correct values in the editor; missing details remain unknown. Draft autosave does not confirm facts.')}</p>
    {!!review.extraction.warnings.length&&<p className="notice">{review.extraction.warnings.join(' · ')}</p>}
    {!!review.extraction.omittedPages.length&&<p role="alert">{t('Pagini neprocesate: ','Unprocessed pages: ')}{review.extraction.omittedPages.join(', ')}</p>}
    <Button onClick={()=>setSelected(pending.filter(c=>!c.warning&&c.confidence!=='low').map(c=>c.id))}>{t('Selectează informațiile fără avertismente','Select facts without warnings')}</Button>
    {pending.map(c=><label key={c.id} className="import-evidence"><input type="checkbox" checked={selected.includes(c.id)} onChange={()=>setSelected(ids=>ids.includes(c.id)?ids.filter(id=>id!==c.id):[...ids,c.id])}/>
      <span><strong>{c.value}</strong> · {t('pagina','page')} {c.page}<br/><q>{c.quote}</q><br/>{c.confidence}{c.warning?` · ${c.warning}`:''}</span></label>)}
    <Button variant="primary" disabled={disabled||!selected.length} onClick={()=>confirm(selected)}>{t('Confirmă și salvează CV-ul verificat','Confirm and save reviewed CV')}</Button>
  </section>;
}
