// Remember only the right-click target; never record typing or selection text.
export function installSelectionGuard(): void {
  let target: Element | null = null;
  let clickedAt = 0;
  document.addEventListener('contextmenu', (event) => {
    if (!event.isTrusted) return;
    const node = event.composedPath()[0];
    target = node instanceof Element ? node : null;
    clickedAt = Date.now();
  }, true);
  window.addEventListener('pagehide', () => { target = null; });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'FILLIN_VERIFY_SELECTION' || sender.id !== chrome.runtime.id) return false;
    const selectedTarget = target;
    target = null;
    respond({ allowed: !!selectedTarget && Date.now() - clickedAt < 30_000 &&
      isSafeSelection(selectedTarget, message.text) });
    return false;
  });
}

export function isSafeSelection(target: Element, text: unknown): boolean {
  if (!target.isConnected || typeof text !== 'string' || !text.trim()) return false;
  if (target.closest('[data-fillin-ui], #fillin-suggestions-host, #fillin-palette-host')) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (target.disabled || target.readOnly || /password|one-time-code/i.test(target.autocomplete)) return false;
    if (target instanceof HTMLInputElement && !['text', 'search', 'url', 'tel', 'email'].includes(target.type)) return false;
    // Check exclusions before accessing any input value.
    const start = target.selectionStart;
    const end = target.selectionEnd;
    return start !== null && end !== null && end > start && target.value.slice(start, end) === text;
  }
  const editable = target.closest('[contenteditable]');
  const selection = window.getSelection();
  if (!editable) {
    return !!selection && !selection.isCollapsed && selection.toString() === text &&
      selection.rangeCount > 0 && selection.getRangeAt(0).intersectsNode(target);
  }
  if (!(editable instanceof HTMLElement) || !editable.isContentEditable || editable.getAttribute('aria-readonly') === 'true') return false;
  return !!selection && !selection.isCollapsed && !!selection.anchorNode && !!selection.focusNode &&
    editable.contains(selection.anchorNode) && editable.contains(selection.focusNode) && selection.toString() === text;
}
