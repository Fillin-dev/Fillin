import { InputAdapter, CursorInsertionResult } from './InputAdapter';
import { replaceTrigger } from '@fillin/shared';
import { bookmarkEditable } from '../templates/bookmarks';

export class ContentEditableAdapter implements InputAdapter {
  constructor(private element: HTMLElement) {}

  prepareTemplateInsertion(start: number, end: number) {
    return bookmarkEditable(this.element, start, end);
  }

  canCopyTemplate() {
    return this.element.isConnected && this.element.isContentEditable && this.element.getAttribute('aria-readonly') !== 'true';
  }

  canPlaceTemplateCursor(content: string, cursorOffset: number): boolean {
    if (!Number.isInteger(cursorOffset) || cursorOffset < 0 || cursorOffset > content.length) return false;
    const text = content.replace(/\r\n?/g, '\n');
    const offset = content.slice(0, cursorOffset).replace(/\r\n?/g, '\n').length;
    const start = text.slice(0, offset).lastIndexOf('\n') + 1;
    const newline = text.indexOf('\n', offset);
    const line = text.slice(start, newline < 0 ? text.length : newline);
    const before = line.slice(0, offset - start), after = line.slice(offset - start);
    // Blink canonicalizes empty inline/line-boundary positions into adjacent
    // formatting nodes, sometimes dropping collapsed boundary whitespace.
    // Refuse these mappings before mutation and offer a clean copy instead.
    return !!line.trim() && !(!before.trim() && /^[ \t]/.test(line)) && !(!after.trim() && /[ \t]$/.test(line));
  }

  replaceTextWithCursor(start: number, end: number, content: string, cursorOffset: number): CursorInsertionResult {
    const node = window.getSelection()?.anchorNode;
    if (!this.canCopyTemplate() || !node || node.nodeType !== Node.TEXT_NODE || !this.element.contains(node) ||
      !Number.isInteger(cursorOffset) || cursorOffset < 0 || cursorOffset > content.length ||
      start < 0 || end < start || end > (node.textContent?.length ?? 0)) return { result: 'failed' };
    if (!this.canPlaceTemplateCursor(content, cursorOffset)) return { result: 'failed' };
    const text = content.replace(/\r\n?/g, '\n');
    const offset = content.slice(0, cursorOffset).replace(/\r\n?/g, '\n').length;
    if (text.includes('\n')) return this.insertMultilineWithCursor(node, start, end, text, offset);
    const expected = replaceTrigger(node.textContent || '', { trigger: '', start, end }, text).text;
    if (this.replaceText(start, end, text, false) !== 'inserted' || !this.canCopyTemplate() ||
      !node.isConnected || !this.element.contains(node) || node.textContent !== expected) return { result: 'failed' };
    // One verified text node gives an exact UTF-16 mapping, including emoji and
    // newlines, while keeping surrounding elements and formatting intact.
    const range = document.createRange(); range.setStart(node, start + offset); range.collapse(true);
    const selection = window.getSelection();
    if (!selection) return { result: 'failed' };
    selection.removeAllRanges(); selection.addRange(range);
    if (selection.anchorNode !== node || selection.focusNode !== node || selection.anchorOffset !== start + offset || !selection.isCollapsed) return { result: 'failed' };
    return { result: 'inserted', insertedLength: text.length };
  }

  private insertMultilineWithCursor(node: Node, start: number, end: number, text: string, offset: number): CursorInsertionResult {
    // A raw LF in a normal rich editor collapses to whitespace when the user
    // types. Use real line breaks and map each UTF-16 offset to a text node.
    const fragment = document.createDocumentFragment();
    const nodes: Node[] = [];
    const texts = new Map<Node, string>();
    const lines = text.split('\n');
    let position = 0;
    let caret: { node: Text; offset: number } | null = null;
    for (const [index, line] of lines.entries()) {
      const chunk = document.createTextNode(line);
      nodes.push(chunk); texts.set(chunk, line); fragment.append(chunk);
      if (!caret && offset >= position && offset <= position + line.length) caret = { node: chunk, offset: offset - position };
      position += line.length;
      if (index < lines.length - 1) {
        const br = document.createElement('br'); nodes.push(br); fragment.append(br); position++;
      }
    }
    if (!caret || !node.parentNode) return { result: 'failed' };
    const finalNode = nodes[nodes.length - 1] as Text;
    const parent = node.parentNode;
    const insertion = document.createRange(); insertion.setStart(node, start); insertion.setEnd(node, end);
    insertion.deleteContents(); insertion.insertNode(fragment);
    const selection = window.getSelection();
    if (!selection) return { result: 'failed' };
    const initialEnd = document.createRange(); initialEnd.setStart(finalNode, finalNode.length); initialEnd.collapse(true);
    selection.removeAllRanges(); selection.addRange(initialEnd);
    this.element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    if (!this.canCopyTemplate() || !this.element.contains(parent) || nodes.some((item, index) =>
      !item.isConnected || item.parentNode !== parent ||
      (texts.has(item) && item.textContent !== texts.get(item)) ||
      (index < nodes.length - 1 && item.nextSibling !== nodes[index + 1])
    )) return { result: 'failed' };
    const target = caret;
    const range = document.createRange(); range.setStart(target.node, target.offset); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
    if (selection.anchorNode !== target.node || selection.focusNode !== target.node || selection.anchorOffset !== target.offset || !selection.isCollapsed) return { result: 'failed' };
    return { result: 'inserted', insertedLength: text.length };
  }

  getText(): string {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return '';
    const node = selection.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }
    return '';
  }

  getCursorPosition(): number | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const node = selection.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) {
      return selection.anchorOffset;
    }
    return null;
  }

  replaceText(start: number, end: number, newContent: string, isHtml?: boolean): 'inserted' | 'failed' {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 'failed';
    const node = selection.anchorNode;
    
    if (node?.nodeType === Node.TEXT_NODE) {
      if (isHtml) {
        // We want to replace text from `start` to `end` within `node`.
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Use insertHTML to insert the rich text
        if (!document.execCommand('insertHTML', false, newContent)) return 'failed';
        
        this.element.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const originalText = node.textContent || '';
        const result = replaceTrigger(originalText, { trigger: '', start, end }, newContent);
        
        node.textContent = result.text;
        
        const range = document.createRange();
        range.setStart(node, result.cursorPosition);
        range.setEnd(node, result.cursorPosition);
        
        selection.removeAllRanges();
        selection.addRange(range);
        
        this.element.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return 'inserted';
    }
    return 'failed';
  }
}
