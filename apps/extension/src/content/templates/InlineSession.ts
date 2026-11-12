import type { InlineTemplate, EditablePlaceholder } from '@fillin/shared';
import { fieldAllowed } from './bookmarks';

type Field = HTMLInputElement | HTMLTextAreaElement;
export type InlineStartResult = { result: 'inserted'; insertedLength: number } | { result: 'unavailable' | 'failed' };
let session: InlineSession | null = null;
let opening = false;
const disabledHosts = new WeakSet<Field>();
export const isInlineSessionActive = () => opening || session !== null;
export const stopInlineSession = () => session?.stop();

function allowed(field: Field): boolean {
  return fieldAllowed(field) && !field.matches(':disabled') && !field.closest('[inert]') &&
    (field instanceof HTMLTextAreaElement || field.type === 'text');
}

/** Map every range from LF output to the text accepted by a single-line input. */
export function normalizeInline(template: InlineTemplate, singleLine: boolean): InlineTemplate {
  if (!singleLine) return { ...template, placeholders: template.placeholders.map((p) => ({ ...p })) };
  const offset = (position: number) => template.text.slice(0, position).replace(/\n/g, '').length;
  return { ...template, text: template.text.replace(/\n/g, ''),
    cursorOffset: template.cursorOffset === null ? null : offset(template.cursorOffset),
    placeholders: template.placeholders.map((p) => ({ ...p, start: offset(p.start), end: offset(p.end) })),
  };
}

function stoppedNotice() {
  const notice = document.createElement('div'); notice.id = 'fillin-inline-error'; notice.setAttribute('role', 'status');
  notice.textContent = 'Inline editing stopped because this field changed. Review the text before trying again.';
  notice.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:2147483647;padding:14px;background:#172033;color:white;border-radius:12px;font:13px/1.5 system-ui;pointer-events:none';
  document.getElementById(notice.id)?.remove(); document.documentElement.append(notice);
  setTimeout(() => notice.remove(), 6000);
}

export function startNativeInline(field: Field, start: number, end: number, raw: InlineTemplate, eligible: () => boolean): InlineStartResult {
  if (!eligible() || !allowed(field) || !field.matches(':focus') || disabledHosts.has(field)) return { result: 'unavailable' };
  if (typeof document.execCommand !== 'function' || !document.queryCommandSupported?.('insertText') || !document.queryCommandEnabled?.('insertText')) return { result: 'unavailable' };
  const template = normalizeInline(raw, field instanceof HTMLInputElement);
  if (!template.placeholders.length || template.placeholders.length > 100 || template.text.length > 100_000 ||
    !Number.isInteger(template.fieldsBeforeCursor) || template.fieldsBeforeCursor < 0 || template.fieldsBeforeCursor > template.placeholders.length ||
    (template.cursorOffset !== null && (!Number.isInteger(template.cursorOffset) || template.cursorOffset < 0 || template.cursorOffset > template.text.length)) ||
    template.placeholders.some((p, n, all) => !Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < 0 || p.end <= p.start || p.end > template.text.length || (n > 0 && all[n - 1].end > p.start))) return { result: 'unavailable' };
  const original = field.value;
  if (start < 0 || end < start || end > original.length) return { result: 'unavailable' };
  const expected = original.slice(0, start) + template.text + original.slice(end);
  if (original.length > 200_000 || expected.length > 200_000 || (field.maxLength >= 0 && expected.length > field.maxLength)) return { result: 'unavailable' };
  const previous = { start: field.selectionStart, end: field.selectionEnd };
  if (previous.start === null || previous.end === null) return { result: 'unavailable' };
  stopInlineSession(); opening = true;
  document.dispatchEvent(new Event('fillin-inline-open'));
  let receipts = 0, trusted = true, committed = false;
  const receipt = (event: Event) => { receipts++; trusted = trusted && event.isTrusted && (event as InputEvent).inputType === 'insertText'; };
  field.addEventListener('input', receipt, true);
  try {
    field.setSelectionRange(start, end);
    committed = document.execCommand('insertText', false, template.text);
  } catch { /* A blocked native command must never be replaced by a value setter. */ }
  finally { field.removeEventListener('input', receipt, true); opening = false; }
  if (!eligible() || !allowed(field) || !field.matches(':focus')) {
    disabledHosts.add(field); stoppedNotice(); return { result: 'failed' };
  }
  if (!committed && field.value === original) {
    field.setSelectionRange(previous.start, previous.end); disabledHosts.add(field); return { result: 'unavailable' };
  }
  // Chromium can emit several insertText events for one multiline command.
  // Confirm the whole native transaction and final value, not an event count.
  if (!committed || receipts < 1 || !trusted || field.value !== expected) {
    disabledHosts.add(field); stoppedNotice(); return { result: 'failed' };
  }
  session = new InlineSession(field, expected, template.placeholders.map((p) => ({ ...p, start: start + p.start, end: start + p.end })),
    start + (template.cursorOffset ?? template.text.length), template.fieldsBeforeCursor, eligible);
  session.begin();
  return { result: 'inserted', insertedLength: template.text.length };
}

class InlineSession {
  private index = 0;
  private composing = false;
  private pending = false;
  private observer: MutationObserver;
  private hint: HTMLElement;
  private hintText: HTMLElement;
  constructor(private field: Field, private snapshot: string, private ranges: EditablePlaceholder[],
    private finalCursor: number, private fieldsBeforeCursor: number, private eligible: () => boolean) {
    this.hint = document.createElement('div'); this.hint.id = 'fillin-inline-hint'; this.hint.dataset.fillinUi = 'true';
    this.hint.setAttribute('role', 'status'); this.hint.setAttribute('aria-live', 'polite'); this.hint.setAttribute('aria-atomic', 'true');
    const shadow = this.hint.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 32px);pointer-events:none}.hint{font:12px/1.5 system-ui;background:#fff;color:#344054;border:1px solid #d8e2ff;border-radius:12px;padding:10px 16px;box-shadow:0 8px 30px #17203326}.hint strong{color:#2457f5}';
    this.hintText = document.createElement('div'); this.hintText.className = 'hint'; shadow.append(style, this.hintText);
    this.observer = new MutationObserver((records) => {
      if (!allowed(this.field) || records.some((r) => r.type === 'attributes' && r.target === this.field)) this.stop();
    });
  }
  begin() {
    document.documentElement.append(this.hint);
    this.field.addEventListener('keydown', this.keydown, true);
    this.field.addEventListener('beforeinput', this.beforeInput, true);
    this.field.addEventListener('input', this.input, true);
    this.field.addEventListener('select', this.selection);
    this.field.addEventListener('blur', this.blur);
    this.field.addEventListener('pointerup', this.afterPointer);
    this.field.addEventListener('compositionstart', this.compositionStart);
    this.field.addEventListener('compositionend', this.compositionEnd);
    document.addEventListener('selectionchange', this.selection);
    document.addEventListener('pointerdown', this.pointer, true);
    window.addEventListener('pagehide', this.blur);
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
    this.observer.observe(this.field, { attributes: true, attributeFilter: ['type', 'readonly', 'disabled', 'autocomplete', 'aria-readonly', 'maxlength'] });
    this.choose(0);
  }
  stop() {
    if (session !== this) return;
    session = null;
    this.observer.disconnect(); this.hint.remove();
    this.field.removeEventListener('keydown', this.keydown, true);
    this.field.removeEventListener('beforeinput', this.beforeInput, true);
    this.field.removeEventListener('input', this.input, true);
    this.field.removeEventListener('select', this.selection);
    this.field.removeEventListener('blur', this.blur);
    this.field.removeEventListener('pointerup', this.afterPointer);
    this.field.removeEventListener('compositionstart', this.compositionStart);
    this.field.removeEventListener('compositionend', this.compositionEnd);
    document.removeEventListener('selectionchange', this.selection);
    document.removeEventListener('pointerdown', this.pointer, true);
    window.removeEventListener('pagehide', this.blur);
    this.snapshot = ''; this.ranges = [];
  }
  private valid(checkValue = true): boolean {
    return session === this && this.eligible() && allowed(this.field) && this.field.matches(':focus') &&
      (!checkValue || this.field.value === this.snapshot);
  }
  private inside() {
    const range = this.ranges[this.index];
    const start = this.field.selectionStart, end = this.field.selectionEnd;
    return !!range && start !== null && end !== null && start >= range.start && end <= range.end;
  }
  private choose(index: number) {
    if (!this.valid()) { this.stop(); return; }
    this.index = index;
    const range = this.ranges[index]; this.field.setSelectionRange(range.start, range.end);
    const title = document.createElement('strong'); title.textContent = `Field ${index + 1}/${this.ranges.length} · ${range.name.replace(/_/g, ' ')}`;
    this.hintText.replaceChildren(title, document.createTextNode(' — Tab next · Shift+Tab back · Esc finish'));
  }
  private selection = () => {
    if (this.pending || this.composing) return;
    if (!this.valid() || !this.inside()) this.stop();
  };
  private blur = () => this.stop();
  private pointer = (event: PointerEvent) => { if (!event.composedPath().includes(this.field)) this.stop(); };
  private afterPointer = () => queueMicrotask(this.selection);
  private compositionStart = () => { if (!this.valid() || !this.inside()) this.stop(); else this.composing = true; };
  private compositionEnd = () => { this.composing = false; queueMicrotask(this.selection); };
  private keydown = (raw: Event) => {
    const event = raw as KeyboardEvent;
    if (!this.valid() || !this.inside()) { this.stop(); return; }
    if (event.isComposing || this.composing) return;
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { this.stop(); return; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.stop(); return; }
    if (event.key === 'Enter' && this.field instanceof HTMLInputElement) { this.stop(); return; }
    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.shiftKey) this.choose(Math.max(0, this.index - 1));
    else if (this.index < this.ranges.length - 1) this.choose(this.index + 1);
    else {
      const position = this.finalCursor, expected = this.snapshot;
      this.stop();
      if (this.eligible() && allowed(this.field) && this.field.value === expected && this.field.matches(':focus')) this.field.setSelectionRange(position, position);
    }
  };
  private supported(type: string) {
    return ['insertText', 'insertFromPaste', 'insertLineBreak', 'insertCompositionText', 'insertFromComposition', 'insertReplacementText'].includes(type) ||
      type.startsWith('delete') && type !== 'deleteByDrag';
  }
  private beforeInput = (raw: Event) => {
    const event = raw as InputEvent;
    if (!event.isTrusted || !this.supported(event.inputType) || !this.valid() || !this.inside()) { this.stop(); return; }
    const range = this.ranges[this.index];
    if (this.field.selectionStart === this.field.selectionEnd &&
      (event.inputType.endsWith('Backward') && this.field.selectionStart === range.start || event.inputType.endsWith('Forward') && this.field.selectionStart === range.end)) this.stop();
  };
  private input = (event: Event) => {
    const change = event as InputEvent;
    if (!change.isTrusted || !this.supported(change.inputType) || !this.valid(false)) { this.stop(); return; }
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      if (!this.valid(false)) { this.stop(); return; }
      const range = this.ranges[this.index], text = this.field.value;
      const before = this.snapshot.slice(0, range.start), after = this.snapshot.slice(range.end);
      if (text.length > 200_000 || text.length < before.length + after.length || !text.startsWith(before) || !text.endsWith(after)) { this.stop(); return; }
      const delta = text.length - this.snapshot.length;
      range.end += delta;
      for (let index = this.index + 1; index < this.ranges.length; index++) { this.ranges[index].start += delta; this.ranges[index].end += delta; }
      if (this.index < this.fieldsBeforeCursor) this.finalCursor += delta;
      this.snapshot = text;
      if (!this.inside()) this.stop();
    });
  };
}
