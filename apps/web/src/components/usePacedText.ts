import { useEffect, useState } from 'react';

/** Display pacing is independent of provider delivery and durable result handling. */
export function usePacedText(text: string, identity: string) {
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [display, setDisplay] = useState({ identity, source: text, length: 0, skipped: false });
  // Reset before painting when an operation or provider attempt replaces the draft.
  // Prefix extensions keep the same progress even if many arrive between ticks.
  let current = display;
  if (display.identity !== identity || !text.startsWith(display.source)) {
    current = { identity, source: text, length: 0, skipped: false };
    setDisplay(current);
  } else if (display.source !== text) {
    current = { ...display, source: text };
    setDisplay(current);
  }
  const length = reduced || current.skipped ? text.length : current.length;
  const pending = length < text.length;
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!pending) return;
    // About 33 characters/second. Never speed up to drain a large network burst.
    const timer = setInterval(() => setDisplay(previous => {
      const code = previous.source.codePointAt(previous.length);
      const step = code !== undefined && code > 0xffff ? 2 : 1;
      return { ...previous, length: Math.min(previous.source.length, previous.length + step) };
    }), 30);
    return () => clearInterval(timer);
  }, [identity, pending]);
  return {
    text: text.slice(0, length), pending,
    showAll: () => setDisplay(previous => ({ ...previous, skipped: true })),
  };
}
