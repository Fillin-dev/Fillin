import { afterEach, expect, it, vi } from 'vitest';
import { bookmarkEditable, bookmarkField } from './bookmarks';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

it('never reads protected field values to create a bookmark', () => {
  for (const attributes of ['type="password"', 'readonly', 'disabled', 'autocomplete="one-time-code"', 'autocomplete="new-password"']) {
    document.body.innerHTML = `<input ${attributes}>`;
    const field = document.querySelector('input')!;
    const read = vi.spyOn(field, 'value', 'get').mockImplementation(() => { throw new Error('private'); });
    expect(bookmarkField(field, 0, 0)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  }
});

it('invalidates native bookmarks on edits, selection movement and protected attribute changes', () => {
  for (const change of ['edit', 'selection', 'attribute', 'removed']) {
    document.body.innerHTML = '<input value="/reply">';
    const field = document.querySelector('input')!;
    field.setSelectionRange(6, 6);
    const bookmark = bookmarkField(field, 0, 6)!;
    expect(bookmark.isValid()).toBe(true);
    if (change === 'edit') { field.dispatchEvent(new Event('input')); }
    if (change === 'selection') field.setSelectionRange(0, 0);
    if (change === 'attribute') { field.type = 'password'; field.type = 'text'; }
    if (change === 'removed') field.remove();
    expect(bookmark.isValid()).toBe(false);
    if (change !== 'selection') expect(bookmark.isValid()).toBe(false);
    expect(bookmark.restore()).toBe(false);
    bookmark.dispose();
  }
});

it('restores a contenteditable range, but refuses a host rerender', () => {
  document.body.innerHTML = '<div contenteditable="true">Before <strong>/reply</strong> after</div>';
  const field = document.querySelector('div')!;
  Object.defineProperty(field, 'isContentEditable', { value: true });
  const node = field.querySelector('strong')!.firstChild!;
  const range = document.createRange(); range.setStart(node, 6); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  const bookmark = bookmarkEditable(field, 0, 6)!;
  expect(bookmark.restore()).toBe(true);
  field.innerHTML = 'Before <strong>/reply</strong> after';
  expect(bookmark.isValid()).toBe(false);
  expect(bookmark.restore()).toBe(false);
  bookmark.dispose();
});
