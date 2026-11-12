import { InputAdapter, CursorInsertionResult } from './InputAdapter';
import { replaceTrigger } from '@fillin/shared';
import { bookmarkField, fieldAllowed } from '../templates/bookmarks';
import { startNativeInline } from '../templates/InlineSession';
import type { InlineTemplate } from '@fillin/shared';

export class TextInputAdapter implements InputAdapter {
  getTarget() { return this.element; }
  constructor(private element: HTMLInputElement | HTMLTextAreaElement) {}

  startInlineEditing(start: number, end: number, template: InlineTemplate, eligible: () => boolean) {
    return startNativeInline(this.element, start, end, template, eligible);
  }

  prepareTemplateInsertion(start: number, end: number) {
    return bookmarkField(this.element, start, end);
  }

  canCopyTemplate() { return fieldAllowed(this.element); }

  replaceTextWithCursor(start: number, end: number, content: string, cursorOffset: number): CursorInsertionResult {
    if (!fieldAllowed(this.element) || this.element.selectionStart === null ||
      !Number.isInteger(cursorOffset) || cursorOffset < 0 || cursorOffset > content.length ||
      start < 0 || end < start || end > this.element.value.length) return { result: 'failed' };
    const normalize = (text: string) => this.element instanceof HTMLInputElement
      ? text.replace(/[\r\n]/g, '') : text.replace(/\r\n?/g, '\n');
    const text = normalize(content);
    const relative = normalize(content.slice(0, cursorOffset)).length;
    const inserted = this.replaceText(start, end, text, false);
    // Controlled-field handlers have run. Only position the caret after the
    // text is confirmed and the original field remains eligible and connected.
    if (inserted !== 'inserted' || !fieldAllowed(this.element) || this.element.selectionStart === null) return { result: 'failed' };
    this.element.setSelectionRange(start + relative, start + relative);
    if (this.element.selectionStart !== start + relative || this.element.selectionEnd !== start + relative) return { result: 'failed' };
    return { result: 'inserted', insertedLength: text.length };
  }

  getText(): string {
    return this.element.value;
  }

  private withTextType<T>(operation: () => T): T | null {
    if (this.element instanceof HTMLInputElement) {
      const type = this.element.type;
      const supportedTypes = ['text', 'search', 'url', 'tel', 'password'];
      
      if (!supportedTypes.includes(type)) {
        try {
          this.element.type = 'text';
          const result = operation();
          this.element.type = type;
          return result;
        } catch (e) {
          return null;
        }
      }
    }
    
    try {
      return operation();
    } catch (e) {
      return null;
    }
  }

  getCursorPosition(): number | null {
    return this.withTextType(() => this.element.selectionStart);
  }

  replaceText(start: number, end: number, newContent: string, isHtml?: boolean): 'inserted' | 'failed' {
    if (this.element.readOnly || this.element.disabled || this.element.type === 'password') return 'failed';
    let finalContent = newContent;
    if (isHtml) {
      // Replace <br> and <p> with newlines, then strip tags
      finalContent = finalContent.replace(/<br\s*\/?>/gi, '\n');
      finalContent = finalContent.replace(/<\/p>/gi, '\n\n');
      const tmp = document.createElement('DIV');
      tmp.innerHTML = finalContent;
      finalContent = tmp.textContent || tmp.innerText || '';
      finalContent = finalContent.trim();
    }
    
    const originalText = this.getText();
    const result = replaceTrigger(originalText, { trigger: '', start, end }, finalContent);
    
    // Bypass React's value setter override to ensure 'input' events trigger state updates
    let NativeSetter = null;
    
    // In some environments, the prototype might directly be HTMLInputElement, or we need to grab it from the window
    if (this.element instanceof HTMLTextAreaElement) {
      NativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    } else {
      NativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    }

    if (NativeSetter) {
      NativeSetter.call(this.element, result.text);
    } else {
      this.element.value = result.text;
    }
    
    this.withTextType(() => {
      this.element.selectionStart = result.cursorPosition;
      this.element.selectionEnd = result.cursorPosition;
    });
    
    this.element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    return this.element.value === result.text ? 'inserted' : 'failed';
  }
}
