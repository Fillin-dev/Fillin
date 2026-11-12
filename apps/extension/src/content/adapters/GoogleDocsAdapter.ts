import { InputAdapter } from './InputAdapter';

export class GoogleDocsAdapter implements InputAdapter {
  getTarget() { return document.activeElement instanceof HTMLElement ? document.activeElement : document.body; }
  private static instance: GoogleDocsAdapter | null = null;
  private buffer: string = '';
  private maxBufferSize: number = 30;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.attachListeners();
    }
  }

  public static getInstance(): GoogleDocsAdapter {
    if (!this.instance) {
      this.instance = new GoogleDocsAdapter();
    }
    return this.instance;
  }

  public static isGoogleDocs(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      if (
        window.location.hostname.includes('docs.google.com') &&
        window.location.pathname.includes('/document/')
      ) {
        return true;
      }
      if (
        window.top &&
        window.top !== window &&
        window.top.location.hostname.includes('docs.google.com')
      ) {
        return true;
      }
    } catch {
      // Cross-origin top window fallback
    }
    if (typeof document !== 'undefined') {
      if (
        document.querySelector('.docs-texteventtarget-iframe, .kix-appview-editor, .docs-editor') ||
        document.body?.classList.contains('docs-texteventtarget-iframe') ||
        document.documentElement?.classList.contains('docs-texteventtarget-iframe')
      ) {
        return true;
      }
    }
    return false;
  }

  public static isDocsCanvas(element: Element | null): boolean {
    if (!this.isGoogleDocs()) return false;

    // If we are inside an iframe on Google Docs, it is the typing target
    try {
      if (window.self !== window.top) {
        return true;
      }
    } catch {
      return true;
    }

    if (!element) {
      return !!document.querySelector('.docs-texteventtarget-iframe, .kix-appview-editor');
    }

    // Standard inputs (title input) or comments are NOT the canvas
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return false;
    }
    if (
      element instanceof HTMLElement &&
      element.isContentEditable &&
      !element.classList.contains('docs-texteventtarget-iframe') &&
      !element.closest('.docs-texteventtarget-iframe')
    ) {
      return false;
    }

    return (
      element.classList.contains('docs-texteventtarget-iframe') ||
      !!element.closest('.docs-texteventtarget-iframe, .kix-appview-editor, .kix-canvas-tile-content') ||
      element === document.body
    );
  }

  public recordKey(key: string): void {
    if (key === 'Backspace') {
      this.buffer = this.buffer.slice(0, -1);
    } else if (key.length === 1) {
      this.buffer += key;
      if (this.buffer.length > this.maxBufferSize) {
        this.buffer = this.buffer.slice(this.buffer.length - this.maxBufferSize);
      }
    }
  }

  public resetBuffer(): void {
    this.buffer = '';
  }

  private attachListeners(): void {
    // Reset buffer on mouse click anywhere (user moved cursor)
    window.addEventListener('mousedown', () => this.resetBuffer(), true);

    // Reset buffer on cursor navigation keys
    window.addEventListener(
      'keydown',
      (e) => {
        const navKeys = [
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Home',
          'End',
          'PageUp',
          'PageDown',
          'Escape',
        ];
        if (navKeys.includes(e.key)) {
          this.resetBuffer();
        }
      },
      true
    );

    window.addEventListener('blur', () => this.resetBuffer());
  }

  public getDocsTarget(): { doc: Document; el: HTMLElement | null } {
    const iframe = document.querySelector('iframe.docs-texteventtarget-iframe') as HTMLIFrameElement | null;
    if (iframe) {
      try {
        if (iframe.contentDocument) {
          const doc = iframe.contentDocument;
          const el = doc.body || (doc.querySelector('[contenteditable]') as HTMLElement | null);
          return { doc, el };
        }
      } catch {
        // Cross-origin fallback
      }
    }
    return { doc: document, el: document.activeElement as HTMLElement | null };
  }

  getText(): string {
    return this.buffer;
  }

  getCursorPosition(): number | null {
    return this.buffer.length;
  }

  private showDocsToast(result: 'copied' | 'failed') {
    try {
      const targetDoc = window.top ? window.top.document : document;
      const existing = targetDoc.getElementById('fillin-docs-toast');
      if (existing) existing.remove();

      const toast = targetDoc.createElement('div');
      toast.id = 'fillin-docs-toast';
      toast.setAttribute('role', 'status');
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #111827;
        color: #ffffff;
        padding: 10px 16px;
        border-radius: 12px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 10px 25px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1);
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 2147483647;
      `;

      const isMac = typeof navigator !== 'undefined' && navigator.platform?.toUpperCase().includes('MAC');
      const pasteKey = isMac ? '⌘V' : 'Ctrl+V';

      toast.innerHTML = result === 'copied' ? `
        <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#4f46e5;border-radius:6px;font-size:12px;">⚡</span>
        <span><strong>Snippet Copied!</strong> Press <kbd style="background:#374151;padding:2px 6px;border-radius:4px;font-size:12px;font-family:monospace;">${pasteKey}</kbd> to paste</span>
      ` : '<span>Could not insert or copy the snippet. Try again or copy it from the Fillin popup.</span>';

      targetDoc.body.appendChild(toast);

      setTimeout(() => {
        toast.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    } catch {
      // ignore
    }
  }

  private async copySnippetToClipboard(text: string): Promise<'copied' | 'failed'> {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        this.showDocsToast('failed');
        return 'failed';
      }
      await navigator.clipboard.writeText(text);
      this.showDocsToast('copied');
      return 'copied';
    } catch {
      this.showDocsToast('failed');
      return 'failed';
    }
  }

  async replaceText(start: number, end: number, newContent: string, isHtml?: boolean): Promise<'inserted' | 'copied' | 'failed'> {
    let cleanText = newContent;
    if (isHtml) {
      cleanText = cleanText.replace(/<br\s*\/?>/gi, '\n');
      cleanText = cleanText.replace(/<\/p>/gi, '\n\n');
      const tmp = document.createElement('DIV');
      tmp.innerHTML = cleanText;
      cleanText = tmp.textContent || tmp.innerText || '';
      cleanText = cleanText.trim();
    }

    const charsToDelete = Math.max(0, end - start);
    const { doc, el } = this.getDocsTarget();

    if (el) {
      try {
        el.focus();
      } catch {
        // ignore
      }
    }

    // 1. Delete the trigger characters from Google Docs
    for (let i = 0; i < charsToDelete; i++) {
      doc.execCommand('delete', false);
    }

    // 2. Attempt direct insertText via execCommand
    let insertSuccess = false;
    if (cleanText) {
      try {
        insertSuccess = doc.execCommand('insertText', false, cleanText);
      } catch {
        insertSuccess = false;
      }
    }

    // 3. Copy only if direct insertion failed, and confirm the copy before prompting to paste.
    if (cleanText && !insertSuccess) {
      this.resetBuffer();
      return this.copySnippetToClipboard(cleanText);
    }

    // 4. Reset the buffer
    this.resetBuffer();
    return insertSuccess ? 'inserted' : 'failed';
  }
}
