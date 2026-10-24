const done = new Set();
export function injectCss(id, css) {
  if (typeof document === 'undefined' || done.has(id)) return;
  done.add(id);
  const s = document.createElement('style'); s.setAttribute('data-cvz', id); s.textContent = css; document.head.appendChild(s);
}
