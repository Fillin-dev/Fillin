import { TemplateBookmark } from '../adapters/InputAdapter';

export function fieldAllowed(element: HTMLInputElement | HTMLTextAreaElement): boolean {
  return element.isConnected && !element.disabled && !element.readOnly &&
    element.getAttribute('aria-readonly') !== 'true' && !/password|one-time-code/i.test(element.autocomplete) &&
    (!(element instanceof HTMLInputElement) || ['text', 'search', 'url', 'tel', 'email'].includes(element.type));
}

export function bookmarkField(element: HTMLInputElement | HTMLTextAreaElement, start: number, end: number): TemplateBookmark | null {
  if (!fieldAllowed(element) || element.selectionStart === null || element.selectionEnd === null) return null;
  const original = element.value;
  if (start < 0 || end < start || end > original.length) return null;
  const selection = [element.selectionStart, element.selectionEnd];
  let changed = false;
  const invalidate = () => { changed = true; };
  const observer = new MutationObserver(invalidate);
  observer.observe(element, { attributes: true, attributeFilter: ['type', 'readonly', 'disabled', 'autocomplete', 'aria-readonly'] });
  element.addEventListener('input', invalidate);
  const valid = () => {
    if (observer.takeRecords().length) changed = true;
    return !changed && fieldAllowed(element) && element.value === original &&
      element.selectionStart === selection[0] && element.selectionEnd === selection[1];
  };
  return {
    isValid: valid,
    restore: () => {
      if (!valid()) return false;
      element.focus({ preventScroll: true });
      if (!valid()) return false;
      element.setSelectionRange(selection[0], selection[1]);
      return valid();
    },
    dispose: () => { observer.disconnect(); element.removeEventListener('input', invalidate); },
  };
}

export function bookmarkEditable(element: HTMLElement, start: number, end: number): TemplateBookmark | null {
  const allowed = () => element.isConnected && element.isContentEditable && element.getAttribute('aria-readonly') !== 'true';
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  if (!allowed() || !selection?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !element.contains(node)) return null;
  const text = node.textContent || '';
  if (start < 0 || end < start || end > text.length) return null;
  const range = selection.getRangeAt(0).cloneRange();
  let changed = false;
  const observer = new MutationObserver(() => { changed = true; });
  observer.observe(element, { subtree: true, childList: true, characterData: true, attributes: true });
  const valid = () => {
    if (observer.takeRecords().length) changed = true;
    return !changed && allowed() && node.isConnected && element.contains(node) && node.textContent === text;
  };
  return {
    isValid: valid,
    restore: () => {
      if (!valid()) return false;
      element.focus({ preventScroll: true });
      if (!valid()) return false;
      const current = window.getSelection();
      if (!current) return false;
      current.removeAllRanges(); current.addRange(range);
      return valid();
    },
    dispose: () => observer.disconnect(),
  };
}
