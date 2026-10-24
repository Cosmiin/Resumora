import React from 'react';
import { injectCss } from '../core/injectCss.js';
import { FIELD_CSS } from './fieldCss.js';
import { FieldShell } from './FieldShell.jsx';
import { Icon } from '../core/Icon.jsx';
let n = 0;
const norm = s => String(s || '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function Select({ id, label, hint, error, optional, icon, options = [], value, defaultValue, onChange, disabled, size = 'md', placeholder = 'Choose an option', searchable, searchPlaceholder = 'Search…', emptyText = 'No matches', defaultOpen = false }) {
  injectCss('field', FIELD_CSS);
  const fid = React.useMemo(() => id || 'rz-s' + (++n), [id]);
  const opts = options.map(o => typeof o === 'string' ? { value: o, label: o } : o);
  const [inner, setInner] = React.useState(defaultValue ?? '');
  const cur = value !== undefined ? value : inner;
  const [open, setOpen] = React.useState(defaultOpen);
  const [q, setQ] = React.useState('');
  const [active, setActive] = React.useState(() => Math.max(0, opts.findIndex(o => o.value === (value !== undefined ? value : defaultValue))));
  const [up, setUp] = React.useState(false);
  const root = React.useRef(null), trig = React.useRef(null), list = React.useRef(null), typed = React.useRef({ s: '', t: 0 });
  const shown = searchable && q ? opts.filter(o => norm(o.label + ' ' + (o.description || '') + ' ' + (o.group || '')).includes(norm(q))) : opts;
  const sel = opts.find(o => o.value === cur);
  React.useEffect(() => { if (!open) return; const h = e => { if (root.current && !root.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  React.useEffect(() => { const l = list.current; if (!open || !l || active < 0) return; const el = l.querySelector('[data-idx="' + active + '"]'); if (!el) return; if (el.offsetTop < l.scrollTop) l.scrollTop = el.offsetTop - 4; else if (el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop + el.offsetHeight - l.clientHeight + 4; }, [active, open]);
  const openIt = () => { if (disabled) return; const r = trig.current.getBoundingClientRect(); setUp(window.innerHeight - r.bottom < 300 && r.top > 300); setQ(''); setActive(Math.max(0, opts.findIndex(o => o.value === cur))); setOpen(true); };
  const close = () => { setOpen(false); trig.current && trig.current.focus(); };
  const pick = o => { if (!o || o.disabled) return; if (value === undefined) setInner(o.value); onChange && onChange(o.value); close(); };
  const move = d => { if (!shown.length) return; let i = active; for (let k = 0; k < shown.length; k++) { i = (i + d + shown.length) % shown.length; if (!shown[i].disabled) break; } setActive(i); };
  const onKey = e => {
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openIt(); } return; }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home' && !searchable) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && !searchable) { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === 'Enter' || (e.key === ' ' && !searchable)) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Tab') setOpen(false);
    else if (!searchable && e.key.length === 1) { const now = Date.now(); typed.current.s = (now - typed.current.t > 600 ? '' : typed.current.s) + norm(e.key); typed.current.t = now; const i = shown.findIndex(o => norm(o.label).startsWith(typed.current.s)); if (i >= 0) setActive(i); }
  };
  const lead = icon || (sel && sel.icon);
  const actId = open && active >= 0 && shown[active] ? fid + '-o' + active : undefined;
  return <FieldShell id={fid} label={label} hint={hint} error={error} optional={optional}>
    <div className="rz-select" ref={root} onKeyDown={onKey}>
      <button type="button" ref={trig} id={fid} className={'rz-control rz-trigger' + (size === 'sm' ? ' rz-control--sm' : '')} data-open={open} data-state={error ? 'error' : undefined} data-disabled={!!disabled} disabled={disabled}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={fid + '-list'} aria-activedescendant={searchable ? undefined : actId} aria-invalid={!!error} aria-describedby={(error || hint) ? fid + '-msg' : undefined}
        onClick={() => open ? setOpen(false) : openIt()}>
        {lead && <span className="rz-adorn"><Icon name={lead} size={18} /></span>}
        <span className="rz-val" data-ph={!sel}>{sel ? sel.label : placeholder}</span>
        <span className="rz-chev2"><Icon name="chevron-down" size={18} /></span>
      </button>
      {open && <div className="rz-pop" data-up={up}>
        {searchable && <div className="rz-search"><Icon name="search" size={16} /><input autoFocus value={q} placeholder={searchPlaceholder} aria-label={searchPlaceholder} aria-controls={fid + '-list'} aria-activedescendant={actId} onChange={e => { setQ(e.target.value); setActive(0); }} /></div>}
        <ul className="rz-list" role="listbox" id={fid + '-list'} aria-labelledby={fid} ref={list}>
          {shown.length ? shown.map((o, i) => <React.Fragment key={o.value}>
            {o.group && (i === 0 || shown[i - 1].group !== o.group) && <li role="presentation" className="rz-grp">{o.group}</li>}
            <li id={fid + '-o' + i} data-idx={i} role="option" className="rz-oi" aria-selected={o.value === cur} aria-disabled={!!o.disabled} data-active={i === active}
              onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}>
              {o.icon && <span className="rz-oi-ic"><Icon name={o.icon} size={17} /></span>}
              <span className="rz-oi-t">{o.label}{o.description && <span className="rz-oi-d">{o.description}</span>}</span>
              {o.value === cur && <span className="rz-oi-ck"><Icon name="check" size={18} /></span>}
            </li>
          </React.Fragment>) : <li className="rz-empty" role="presentation">{emptyText}</li>}
        </ul>
      </div>}
    </div>
  </FieldShell>;
}
