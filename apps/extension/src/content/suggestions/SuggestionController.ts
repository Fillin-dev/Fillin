import { detectTrigger, Snippet, resolveTemplate } from '@fillin/shared';
import { AdapterFactory } from '../adapters/AdapterFactory';
import { GoogleDocsAdapter } from '../adapters/GoogleDocsAdapter';
import { expandSnippet } from '../expansion/ExpansionCoordinator';
import { caretRect } from './caret';

type Context = {
  element: HTMLElement;
  token: string;
  start: number;
  end: number;
  range: Range | null;
};

export class SuggestionController {
  private enabled = false;
  private composing = false;
  private host: HTMLDivElement | null = null;
  private panel: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private context: Context | null = null;
  private dismissed: Context | null = null;
  private matches: Snippet[] = [];
  private selected = -1;
  private frame = 0;
  private fieldObserver: MutationObserver | null = null;

  constructor(
    private dependencies: {
      snippets: () => Snippet[];
      allowed: () => boolean;
      target: () => Element | null;
      paletteOpen: () => boolean;
    }
  ) {
    document.addEventListener('input', this.refresh, true);
    document.addEventListener('selectionchange', this.refresh);
    document.addEventListener('keydown', this.keydown, true);
    document.addEventListener('pointerdown', this.pointerdown, true);
    document.addEventListener('focusout', this.blur, true);
    document.addEventListener('compositionstart', this.compositionStart, true);
    document.addEventListener('compositionend', this.compositionEnd, true);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('scroll', this.position, true);
    window.addEventListener('resize', this.position);
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    this.close();
    this.dismissed = null;
  }
  close() {
    this.fieldObserver?.disconnect();
    this.fieldObserver = null;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.host?.remove();
    this.host = null;
    this.panel = null;
    this.shadow = null;
    this.context = null;
    this.matches = [];
    this.selected = -1;
  }
  destroy() {
    this.close();
    document.removeEventListener('input', this.refresh, true);
    document.removeEventListener('selectionchange', this.refresh);
    document.removeEventListener('keydown', this.keydown, true);
    document.removeEventListener('pointerdown', this.pointerdown, true);
    document.removeEventListener('focusout', this.blur, true);
    document.removeEventListener('compositionstart', this.compositionStart, true);
    document.removeEventListener('compositionend', this.compositionEnd, true);
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('scroll', this.position, true);
    window.removeEventListener('resize', this.position);
  }
  private eligible() {
    return (
      this.enabled &&
      !this.composing &&
      !document.hidden &&
      this.dependencies.allowed() &&
      !this.dependencies.paletteOpen()
    );
  }
  private read(): Context | null {
    if (!this.eligible()) return null;
    const target = this.dependencies.target();
    if (
      !(target instanceof HTMLElement) ||
      !target.isConnected ||
      target.closest('[id^="fillin-"]')
    )
      return null;
    if (GoogleDocsAdapter.isDocsCanvas(target)) return null;
    if (
      target.getAttribute('aria-readonly') === 'true' ||
      /(?:current-password|new-password|one-time-code)/.test(
        target.getAttribute('autocomplete') || ''
      )
    )
      return null;
    if (
      target.closest('[role="combobox"], [role="listbox"]') ||
      target.hasAttribute('aria-autocomplete')
    )
      return null;
    let text = '',
      cursor = 0,
      range: Range | null = null;
    let element = target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      if (
        target instanceof HTMLInputElement &&
        !['text', 'search', 'url', 'tel', 'email'].includes(target.type)
      )
        return null;
      if (
        target.disabled ||
        target.readOnly ||
        target.selectionStart === null ||
        target.selectionStart !== target.selectionEnd
      )
        return null;
      cursor = target.selectionStart;
      text = target.value.slice(Math.max(0, cursor - 128), cursor);
    } else {
      const editable = target.closest<HTMLElement>(
        '[contenteditable="true"], [contenteditable="plaintext-only"]'
      );
      if (
        !editable ||
        !editable.isContentEditable ||
        editable.getAttribute('aria-readonly') === 'true'
      )
        return null;
      element = editable;
      const selection = element.ownerDocument.getSelection();
      if (
        !selection?.isCollapsed ||
        !selection.rangeCount ||
        selection.anchorNode?.nodeType !== Node.TEXT_NODE ||
        !element.contains(selection.anchorNode)
      )
        return null;
      range = selection.getRangeAt(0).cloneRange();
      cursor = selection.anchorOffset;
      text = (selection.anchorNode.textContent || '').slice(Math.max(0, cursor - 128), cursor);
    }
    const match = text.match(/\/[a-zA-Z0-9_-]{2,}$/);
    if (!match) return null;
    const token = match[0];
    const detection = detectTrigger(text, text.length, [token]);
    if (!detection || (detection.start === 0 && cursor > text.length)) return null;
    return { element, token, start: cursor - token.length, end: cursor, range };
  }
  private same(a: Context | null, b: Context | null) {
    return (
      !!a &&
      !!b &&
      a.element === b.element &&
      a.token === b.token &&
      a.start === b.start &&
      a.end === b.end &&
      a.range?.startContainer === b.range?.startContainer
    );
  }
  private refresh = () => {
    if (!this.enabled) return;
    const next = this.read();
    if (!next) {
      this.close();
      this.dismissed = null;
      return;
    }
    if (this.same(next, this.dismissed)) return;
    this.dismissed = null;
    if (this.same(next, this.context)) {
      this.position();
      return;
    }
    this.close();
    const matches = this.dependencies
      .snippets()
      .filter((s) => s.trigger.startsWith(next.token))
      .sort(
        (a, b) =>
          Number(b.trigger === next.token) - Number(a.trigger === next.token) ||
          a.trigger.localeCompare(b.trigger)
      )
      .slice(0, 5);
    if (!matches.length) return;
    this.context = next;
    this.matches = matches;
    this.render();
  };
  private render() {
    this.host = document.createElement('div');
    this.host.id = 'fillin-suggestions-host';
    this.host.style.cssText =
      'all:initial;position:fixed;inset:0 auto auto 0;width:0;height:0;z-index:2147483647;';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `*{box-sizing:border-box} .panel{position:fixed;width:300px;max-width:calc(100vw - 16px);background:#fff;color:#172133;border:1px solid #d8e0ed;border-radius:12px;box-shadow:0 8px 30px #14233a26;padding:6px;font:12px/1.5 system-ui,sans-serif}button{display:block;width:100%;padding:9px 10px;border:0;background:transparent;color:inherit;text-align:left;border-radius:7px;cursor:pointer;font:inherit}button:hover,button[data-selected=true]{background:#edf3ff}strong{display:block;color:#234fc6;font:600 12px/1.5 ui-monospace,monospace}.preview{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#475467;font-size:11px}.hint{margin:4px 8px;color:#475467;font-size:10px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}`;
    this.panel = document.createElement('div');
    this.panel.className = 'panel';
    this.panel.style.maxHeight = 'calc(100vh - 16px)';
    this.panel.style.overflowY = 'auto';
    this.panel.setAttribute('role', 'region');
    this.panel.setAttribute('aria-label', 'Fillin shortcut suggestions');
    this.matches.forEach((snippet, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.tabIndex = -1;
      button.setAttribute('aria-label', `Insert ${snippet.trigger}`);
      const title = document.createElement('strong');
      title.textContent = snippet.trigger;
      const preview = document.createElement('span');
      preview.className = 'preview';
      let text = snippet.kind === 'media' ? `${snippet.mime === 'image/gif' ? 'GIF' : 'Image'} · ${snippet.caption || snippet.originalFilename}` : snippet.content;
      if (snippet.templateVersion === 1) {
        try {
          text = resolveTemplate(text, {
            now: new Date(),
            locale: navigator.language || 'en-US',
            dateFormat: snippet.dateFormat,
            preview: true,
          });
        } catch {
          text = 'Template unavailable';
        }
      } else if (snippet.isHtml) {
        const template = document.createElement('template');
        template.innerHTML = text;
        template.content.querySelectorAll('script,style').forEach((node) => node.remove());
        text = template.content.textContent || '';
      }
      preview.textContent = text.slice(0, 180);
      button.append(title, preview);
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener('click', event => this.insert(index, event.isTrusted));
      this.panel!.append(button);
    });
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '↑↓ choose · Enter inserts a choice · Esc dismisses';
    const status = document.createElement('span');
    status.className = 'sr';
    status.setAttribute('role', 'status');
    status.textContent = `${this.matches.length} Fillin shortcuts available. Use up and down to choose.`;
    this.panel.append(hint, status);
    this.shadow.append(style, this.panel);
    document.documentElement.append(this.host);
    this.position();
    this.fieldObserver = new MutationObserver(() => this.close());
    this.fieldObserver.observe(this.context!.element, {
      attributes: true,
      attributeFilter: [
        'readonly',
        'disabled',
        'type',
        'contenteditable',
        'aria-readonly',
        'autocomplete',
      ],
    });
  }
  private insert(index: number, trusted = false) {
    const captured = this.context,
      snippet = this.matches[index];
    const current = this.read();
    if (snippet?.kind === 'media' && !trusted) return;
    if (
      !captured ||
      !snippet ||
      !this.same(captured, current) ||
      !this.dependencies
        .snippets()
        .some(
          (s) =>
            s.id === snippet.id &&
            s.updatedAt === snippet.updatedAt &&
            s.content === snippet.content
        )
    ) {
      this.close();
      return;
    }
    if (captured.range) {
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(captured.range);
    }
    const adapter = AdapterFactory.getAdapter(captured.element);
    this.close();
    if (adapter)
      void expandSnippet(
        adapter,
        snippet,
        captured.start,
        captured.end,
        () => this.enabled && this.dependencies.allowed() && captured.element.isConnected && this.dependencies.snippets().includes(snippet)
      );
  }
  private keydown = (event: KeyboardEvent) => {
    if (!this.host) return;
    if (!this.eligible() || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
      this.close();
      return;
    }
    if (event.key === 'Escape') {
      this.dismissed = this.context;
      this.close();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.key === 'Tab') {
      this.close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.selected =
        event.key === 'ArrowDown'
          ? (this.selected + 1) % this.matches.length
          : (this.selected <= 0 ? this.matches.length : this.selected) - 1;
      this.panel
        ?.querySelectorAll('button')
        .forEach((button, index) => (button.dataset.selected = String(index === this.selected)));
      const status = this.panel?.querySelector('[role=status]');
      if (status) status.textContent = `${this.matches[this.selected].trigger}. Enter to insert.`;
    } else if (event.key === 'Enter') {
      if (this.selected >= 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.insert(this.selected, event.isTrusted);
      } else this.close();
    }
  };
  private pointerdown = (event: PointerEvent) => {
    if (event.composedPath().includes(this.host!)) return;
    this.close();
    this.dismissed = null;
  };
  private blur = () => {
    this.close();
    this.dismissed = null;
  };
  private compositionStart = () => {
    this.composing = true;
    this.close();
  };
  private compositionEnd = () => {
    this.composing = false;
    this.refresh();
  };
  private visibility = () => {
    if (document.hidden) this.close();
  };
  private position = () => {
    if (!this.host || !this.context || !this.shadow || !this.panel || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.context || !this.shadow || !this.panel || !this.same(this.context, this.read())) {
        this.close();
        return;
      }
      const rect = caretRect(this.context.element, this.context.range, this.shadow);
      const field = this.context.element.getBoundingClientRect();
      if (
        !rect ||
        rect.bottom < 0 ||
        rect.top > innerHeight ||
        rect.left < field.left - 2 ||
        rect.left > field.right + 2 ||
        rect.bottom < field.top ||
        rect.top > field.bottom
      ) {
        this.close();
        return;
      }
      const bounds = this.panel.getBoundingClientRect();
      this.panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - bounds.width - 8))}px`;
      const below = rect.bottom + 6;
      this.panel.style.top = `${Math.max(8, Math.min(below + bounds.height <= innerHeight - 8 ? below : rect.top - bounds.height - 6, innerHeight - bounds.height - 8))}px`;
    });
  };
}
