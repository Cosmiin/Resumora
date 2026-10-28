import { useEffect, useRef, useState } from 'react';
import { documentLimits } from '@resumora/contracts/intelligence/model';
import { importedDraft } from '@resumora/contracts/editor/import';
import type { BaseDraft } from '../base/model';
import type { IntelligenceClient, ImportStatus } from '../base/intelligence';
import { Button, useCopy } from './ui';
export function ImportDocument({client,revision,start}:{client:IntelligenceClient;revision:number;start:(draft:BaseDraft)=>void}){
  const t=useCopy(),[file,setFile]=useState<File|null>(null),[status,setStatus]=useState<ImportStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const operation=useRef<string|null>(null),session=useRef(0);
  useEffect(()=>()=>{session.current++},[]);
  function select(files:FileList|null){
    if(busy)return;if(!files||files.length!==1){setError(t('Alege un singur document.','Choose one document.'));return}
    const f=files[0];if(!/\.(pdf|docx|doc)$/i.test(f.name)||f.size<1||f.size>documentLimits.bytes){setError(t('PDF, DOCX sau DOC nevid, maximum 10 MB.','Nonempty PDF, DOCX or DOC, maximum 10 MB.'));return}
    session.current++;setFile(f);setStatus(null);setError('');operation.current=crypto.randomUUID();
  }
  async function run(checkOnly=false){if(!operation.current||!file||busy)return;const generation=session.current;setBusy(true);setError('');
    try{const result=checkOnly?await client.importStatus(operation.current):await client.importDocument(file,operation.current,revision);
      if(generation===session.current)setStatus(result);
    }catch{if(generation===session.current)setError(t('Rezultatul este necunoscut. Verifică operațiunea înainte de o nouă încărcare; nu relansăm automat.','Outcome unknown. Check the existing operation before a new upload; no automatic rerun.'));}
    finally{if(generation===session.current)setBusy(false)}
  }
  return <section className="card file-card"><h2>{t('Importă CV-ul','Import CV')}</h2>
    <p>{t('PDF (inclusiv scanat), DOCX sau DOC · maximum 10 pagini și 10 MB. AI identifică întâi un CV, apoi extrage informațiile pentru verificare.','PDF (including scans), DOCX or DOC · maximum 10 pages and 10 MB. AI first identifies a CV, then extracts information for your review.')}</p>
    <p className="small muted">{t('Documentul este privat. Informațiile extrase rămân neconfirmate până le verifici. Conversia Word și procesarea AI necesită configurare; indisponibilitatea este afișată explicit.','The document is private. Extracted information stays unconfirmed until you review it. Word conversion and AI processing require configuration; unavailability is shown explicitly.')}</p>
    <div className="dropzone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();select(e.dataTransfer.files)}}>
      <label>{t('Alege documentul','Choose document')}<input aria-label={t('Document CV','CV document')} type="file" accept=".pdf,.docx,.doc" disabled={busy} onChange={e=>select(e.target.files)}/></label>
      {file&&<p>{file.name} · {file.size.toLocaleString()} bytes</p>}
    </div>
    <div className="actions"><Button variant="primary" disabled={!file||busy||!!status} onClick={()=>void run()}>{busy?t('Verificăm documentul…','Checking document…'):t('Încarcă și analizează','Upload and analyse')}</Button>
      <Button disabled={!operation.current||busy} onClick={()=>void run(true)}>{t('Verifică operațiunea','Check operation')}</Button>
      <Button disabled={!operation.current} onClick={async()=>{if(!operation.current)return;session.current++;setBusy(true);try{await client.cancelImport(operation.current);setStatus({id:operation.current,state:'cancelled'});}catch{setError(t('Anularea nu este confirmată. Verifică operațiunea.','Cancellation is unconfirmed. Check the operation.'));}finally{setBusy(false)}}}>{t('Anulează importul','Cancel import')}</Button></div>
    {status&&<p role="status">{status.state}{status.error?` · ${status.error}`:''}</p>}{error&&<p role="alert">{error}</p>}
    {status?.review&&<Button variant="primary" onClick={()=>{if(status.review)start(importedDraft(status.review));}}>{t('Deschide informațiile neconfirmate','Open unconfirmed facts')}</Button>}
  </section>;
}
