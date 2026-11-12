/** Ephemeral hidden mirror: never retained between positioning operations. */
export function caretRect(
  element: HTMLElement,
  range: Range | null,
  shadow: ShadowRoot
): DOMRect | null {
  if (range) {
    const rect = range.getBoundingClientRect();
    if (rect.height) return rect;
    const previous = range.cloneRange();
    if (previous.startOffset > 0) {
      previous.setStart(previous.startContainer, previous.startOffset - 1);
      const before = previous.getBoundingClientRect();
      if (before.height)
        return new DOMRect(
          getComputedStyle(element).direction === 'rtl' ? before.left : before.right,
          before.top,
          0,
          before.height
        );
    }
    return null;
  }
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return null;
  const position = element.selectionStart;
  // Bound geometry work on huge fields; the hotkey/palette remain available.
  if (position === null || element.value.length > 10000) return null;
  const style = getComputedStyle(element);
  if (!['horizontal-tb', ''].includes(style.writingMode)) return null;
  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  const rect = element.getBoundingClientRect();
  if (Math.abs(rect.width - element.offsetWidth) > 2) return null;
  for (const name of [
    'box-sizing',
    'padding',
    'border-width',
    'border-style',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'font-variant',
    'line-height',
    'letter-spacing',
    'word-spacing',
    'text-transform',
    'text-indent',
    'text-align',
    'direction',
    'tab-size',
  ]) {
    mirror.style.setProperty(name, style.getPropertyValue(name));
  }
  mirror.style.cssText += `;position:fixed;left:-100000px;top:0;visibility:hidden;box-sizing:border-box;width:${rect.width}px;white-space:${element instanceof HTMLTextAreaElement && element.wrap !== 'off' ? 'pre-wrap' : 'pre'};overflow-wrap:break-word;`;
  mirror.textContent = element.value.slice(0, position);
  marker.textContent = element.value.slice(position, position + 1) || '.';
  mirror.append(marker);
  mirror.append(document.createTextNode(element.value.slice(position + 1)));
  shadow.append(mirror);
  try {
    const root = mirror.getBoundingClientRect();
    const cursor = marker.getBoundingClientRect();
    return new DOMRect(
      rect.left + cursor.left - root.left - element.scrollLeft,
      element instanceof HTMLInputElement
        ? rect.top + (rect.height - cursor.height) / 2
        : rect.top + cursor.top - root.top - element.scrollTop,
      0,
      cursor.height || parseFloat(style.fontSize) * 1.4
    );
  } finally {
    mirror.textContent = '';
    mirror.remove();
  }
}
