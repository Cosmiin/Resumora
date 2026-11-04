import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePacedText } from './usePacedText';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('reveals a burst gradually and keeps revealing after delivery stops', () => {
  vi.useFakeTimers();
  const text = 'A clear description of work, tools and responsibilities. '.repeat(5);
  const { result, rerender } = renderHook(({ text }) => usePacedText(text, 'role-1'), { initialProps: { text: '' } });
  rerender({ text });
  act(() => vi.advanceTimersByTime(500));
  expect(result.current.text.length).toBeGreaterThan(0);
  expect(result.current.text.length).toBeLessThan(40);
  expect(text.startsWith(result.current.text)).toBe(true);
  expect(result.current.pending).toBe(true);
  act(() => vi.advanceTimersByTime(15000));
  expect(result.current.text).toBe(text);
  expect(result.current.pending).toBe(false);
});

it('resets immediately for fallback replacement and a different operation', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ text, id }) => usePacedText(text, id), { initialProps: { text: 'Original draft', id: 'a' } });
  act(() => vi.advanceTimersByTime(200));
  expect(result.current.text).not.toBe('');
  rerender({ text: 'Replacement draft', id: 'a' });
  expect(result.current.text).toBe('');
  act(() => vi.advanceTimersByTime(100));
  expect('Replacement draft'.startsWith(result.current.text)).toBe(true);
  rerender({ text: 'Replacement draft', id: 'b' });
  expect(result.current.text).toBe('');
  rerender({ text: '', id: 'b' });
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.text).toBe('');
});

it('allows skipping the animation without waiting for more ticks', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ text }) => usePacedText(text, 'a'), { initialProps: { text: 'A long description' } });
  act(() => result.current.showAll());
  expect(result.current.text).toBe('A long description');
  rerender({ text: 'A long description with more detail' });
  expect(result.current.text).toBe('A long description with more detail');
  expect(result.current.pending).toBe(false);
});

it('honours reduced motion and cancels animation on unmount', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const { result, unmount } = renderHook(() => usePacedText('Readable immediately', 'a'));
  expect(result.current.text).toBe('Readable immediately');
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
