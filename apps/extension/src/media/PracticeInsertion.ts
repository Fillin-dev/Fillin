import type { MediaSnippet } from '@fillin/shared';
import type { AssetRecord } from '../storage/MediaAssetRepository';
import { bookmarkEditable } from '../content/templates/bookmarks';

export type PracticeTarget = NonNullable<ReturnType<typeof capturePracticeTarget>>;
export function capturePracticeTarget(editor: HTMLElement, snippet: MediaSnippet) {
  const selection = getSelection();
  const node = selection?.anchorNode;
  if (
    !selection?.isCollapsed ||
    !node ||
    node.nodeType !== Node.TEXT_NODE ||
    !editor.contains(node)
  )
    return null;
  const end = selection.anchorOffset,
    start = end - snippet.trigger.length;
  const text = node.textContent || '';
  if (
    start < 0 ||
    text.slice(start, end) !== snippet.trigger ||
    (start > 0 && !/\s/.test(text[start - 1]))
  )
    return null;
  const bookmark = bookmarkEditable(editor, start, end);
  return bookmark ? { editor, bookmark, start, end, node } : null;
}

export async function insertPracticeMedia(
  target: PracticeTarget,
  snippet: MediaSnippet,
  asset: AssetRecord,
  options: { caption: boolean; animate: boolean },
  context: 'practice' | 'editor' = 'practice'
): Promise<void> {
  const source =
    snippet.mime === 'image/gif' && !options.animate ? asset.thumbnail : asset.original;
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not prepare the image. Try again.'));
    reader.readAsDataURL(source);
  });
  if (context === 'editor') {
    const probe = document.createElement('img');
    probe.src = url;
    try {
      await probe.decode();
    } catch {
      throw new Error('This page blocked image insertion. Download the original instead.');
    }
  }
  if (!target.bookmark.isValid() || !target.bookmark.restore() || !target.bookmark.isValid())
    throw new Error(
      `The ${context === 'practice' ? 'practice field' : 'original editor'} changed. Close the preview and try your shortcut again.`
    );
  const wrapper = document.createElement('span');
  const id = crypto.randomUUID();
  wrapper.dataset.fillinPractice = id;
  const image = document.createElement('img');
  image.src = url;
  image.alt = snippet.alt;
  image.style.cssText = 'max-width:100%;height:auto;vertical-align:middle';
  wrapper.append(image);
  if (options.caption && snippet.caption) {
    const caption = document.createElement('span');
    caption.style.whiteSpace = 'pre-wrap';
    caption.textContent = snippet.caption;
    wrapper.append(document.createElement('br'), caption);
  }
  const range = document.createRange();
  range.setStart(target.node, target.start);
  range.setEnd(target.node, target.end);
  const selection = getSelection();
  if (!selection) throw new Error('The insertion position is unavailable.');
  selection.removeAllRanges();
  selection.addRange(range);
  const accepted = document.execCommand('insertHTML', false, wrapper.outerHTML);
  const inserted = target.editor.querySelector<HTMLElement>(`[data-fillin-practice="${id}"]`);
  const insertedImage = inserted?.querySelector('img');
  if (!accepted || !inserted || !insertedImage || insertedImage.getAttribute('src') !== url) {
    throw new Error(
      `Could not confirm insertion. Check the ${context === 'practice' ? 'practice field' : 'editor'} before trying again.`
    );
  }
  await insertedImage.decode();
  if (!inserted.isConnected || !target.editor.contains(inserted))
    throw new Error(
      `The ${context === 'practice' ? 'practice field' : 'editor'} changed during insertion. Check it before trying again.`
    );
  target.editor.focus();
  const caret = document.createRange();
  caret.selectNodeContents(inserted);
  caret.collapse(false);
  selection.removeAllRanges();
  selection.addRange(caret);
}
