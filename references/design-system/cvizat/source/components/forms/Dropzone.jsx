import React from 'react';
import { injectCss } from '../core/injectCss.js';
import { FIELD_CSS } from './fieldCss.js';
import { Icon } from '../core/Icon.jsx';
import { IconButton } from '../core/IconButton.jsx';
export function Dropzone({ title = 'Drop your CV here', accept = '.pdf,.docx', acceptLabel = 'PDF or DOCX, up to 10 MB', file, onFile, onRemove }) {
  injectCss('field', FIELD_CSS);
  const [drag, setDrag] = React.useState(false);
  if (file) return <div className="rz-file">
    <span style={{ width:40, height:40, borderRadius:12, background:'var(--pine-100)', color:'var(--pine-600)', display:'grid', placeItems:'center', flexShrink:0 }}><Icon name="file-text" size={20} /></span>
    <span style={{ flex:1, minWidth:0 }}><b style={{ display:'block', fontSize:'.9rem', fontWeight:650, color:'var(--text-strong)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</b><span style={{ display:'flex', alignItems:'center', gap:5, fontSize:'.76rem', color:'var(--status-good-fg)', marginTop:2 }}><Icon name="circle-check" size={13} />Uploaded{file.size ? ' · ' + file.size : ''}</span></span>
    {onRemove && <IconButton icon="x" label="Remove file" size="sm" onClick={onRemove} />}
  </div>;
  const pick = f => f && onFile && onFile({ name:f.name, size: Math.max(1, Math.round(f.size / 1024)) + ' KB', file:f });
  return <label className="rz-drop" data-drag={drag} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}>
    <input type="file" accept={accept} onChange={e => pick(e.target.files[0])} />
    <span className="rz-drop-ic"><Icon name="upload" size={24} /></span>
    <b style={{ font:'650 1rem var(--font-display)', color:'var(--text-strong)' }}>{drag ? 'Drop to upload' : title}</b>
    <span style={{ fontSize:'.82rem', color:'var(--text-muted)' }}>or <u style={{ color:'var(--text-accent)', fontWeight:650, textUnderlineOffset:2 }}>browse files</u> · {acceptLabel}</span>
  </label>;
}
