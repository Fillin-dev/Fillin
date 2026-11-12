import { afterEach, expect, it, vi } from 'vitest';
import { resolveInlineTemplate } from '@fillin/shared';
import { normalizeInline, startNativeInline, stopInlineSession, isInlineSessionActive } from './InlineSession';

const template = () => resolveInlineTemplate('🐴\n{{name}}{{cursor}}\n{{company}}', { now: new Date(0), locale: 'en-US' });
afterEach(() => {
  stopInlineSession(); document.body.innerHTML = ''; vi.restoreAllMocks();
  for (const key of ['execCommand', 'queryCommandSupported', 'queryCommandEnabled']) delete (document as unknown as Record<string, unknown>)[key];
});

it('normalizes single-line output and every placeholder/cursor offset without changing the source layout', () => {
  const source = template(); const result = normalizeInline(source, true);
  expect(result.text).toBe('🐴‹name›‹company›');
  expect(result.placeholders.map((p) => result.text.slice(p.start, p.end))).toEqual(['‹name›', '‹company›']);
  expect(result.cursorOffset).toBe('🐴‹name›'.length);
  expect(result.fieldsBeforeCursor).toBe(1);
  expect(source.text).toContain('\n');
});

it('rejects password and protected fields before reading values or invoking editing commands', () => {
  document.body.innerHTML = '<input type="password">';
  const field = document.querySelector('input')!;
  const value = vi.spyOn(field, 'value', 'get').mockImplementation(() => { throw new Error('private'); });
  expect(startNativeInline(field, 0, 0, template(), () => true)).toEqual({ result: 'unavailable' });
  expect(value).not.toHaveBeenCalled(); expect(isInlineSessionActive()).toBe(false);
});

it('does not fall back to a value setter when native undo-aware commands are unavailable', () => {
  document.body.innerHTML = '<textarea>/go</textarea>';
  const field = document.querySelector('textarea')!; field.focus(); field.setSelectionRange(3, 3);
  const setter = vi.spyOn(HTMLTextAreaElement.prototype, 'value', 'set');
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
  Object.defineProperty(document, 'queryCommandSupported', { configurable: true, value: vi.fn(() => false) });
  expect(startNativeInline(field, 0, 3, template(), () => true)).toEqual({ result: 'unavailable' });
  expect(field.value).toBe('/go'); expect(setter).not.toHaveBeenCalled();
});

it('restores the original selection on an unchanged rejected native command and disables that field', () => {
  document.body.innerHTML = '<textarea>/go</textarea>';
  const field = document.querySelector('textarea')!; field.focus(); field.setSelectionRange(3, 3);
  const command = vi.fn(() => false);
  Object.defineProperty(document, 'execCommand', { configurable: true, value: command });
  for (const key of ['queryCommandSupported', 'queryCommandEnabled']) Object.defineProperty(document, key, { configurable: true, value: () => true });
  expect(startNativeInline(field, 0, 3, template(), () => true)).toEqual({ result: 'unavailable' });
  expect([field.selectionStart, field.selectionEnd]).toEqual([3, 3]);
  expect(field.value).toBe('/go');
  expect(startNativeInline(field, 0, 3, template(), () => true)).toEqual({ result: 'unavailable' });
  expect(command).toHaveBeenCalledTimes(1);
});

it('never overwrites a value changed by a rejecting host and never starts navigation for it', () => {
  document.body.innerHTML = '<textarea>/go</textarea>';
  const field = document.querySelector('textarea')!; field.focus(); field.setSelectionRange(3, 3);
  Object.defineProperty(document, 'execCommand', { configurable: true, value: () => { field.value = 'Host replacement'; return false; } });
  for (const key of ['queryCommandSupported', 'queryCommandEnabled']) Object.defineProperty(document, key, { configurable: true, value: () => true });
  expect(startNativeInline(field, 0, 3, template(), () => true)).toEqual({ result: 'failed' });
  expect(field.value).toBe('Host replacement'); expect(isInlineSessionActive()).toBe(false);
  expect(document.querySelector('#fillin-inline-error')).toHaveTextContent('Review the text');
});
