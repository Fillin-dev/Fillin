import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TextInputAdapter } from './TextInputAdapter';
import { ContentEditableAdapter } from './ContentEditableAdapter';
import { AdapterFactory } from './AdapterFactory';

import { GoogleDocsAdapter } from './GoogleDocsAdapter';

describe('Input Adapters', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GoogleDocsAdapter', () => {
    let adapter: GoogleDocsAdapter;
    let writeText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { platform: 'Win32', clipboard: { writeText } });
      adapter = GoogleDocsAdapter.getInstance();
      adapter.resetBuffer();
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('records keys and manages rolling buffer', () => {
      adapter.recordKey('/');
      adapter.recordKey('e');
      adapter.recordKey('m');
      adapter.recordKey('a');
      adapter.recordKey('i');
      adapter.recordKey('l');

      expect(adapter.getText()).toBe('/email');
      expect(adapter.getCursorPosition()).toBe(6);

      adapter.recordKey('Backspace');
      expect(adapter.getText()).toBe('/emai');
    });

    it('resets buffer cleanly', () => {
      adapter.recordKey('/');
      adapter.recordKey('s');
      adapter.resetBuffer();

      expect(adapter.getText()).toBe('');
      expect(adapter.getCursorPosition()).toBe(0);
    });

    it('executes delete commands and inserts replacement text', () => {
      const deleteCommands: string[] = [];
      let insertedText = '';

      // Mock execCommand
      document.execCommand = (
        commandId: string,
        _showUI?: boolean,
        value?: string
      ) => {
        if (commandId === 'delete') {
          deleteCommands.push('delete');
          return true;
        }
        if (commandId === 'insertText') {
          insertedText = value || '';
          return true;
        }
        return false;
      };

      adapter.recordKey('/');
      adapter.recordKey('e');
      adapter.recordKey('m');
      adapter.recordKey('a');
      adapter.recordKey('i');
      adapter.recordKey('l');

      adapter.replaceText(0, 6, 'test@example.com');

      expect(deleteCommands.length).toBe(6);
      expect(insertedText).toBe('test@example.com');
      expect(adapter.getText()).toBe('');
      expect(writeText).not.toHaveBeenCalled();
      expect(document.getElementById('fillin-docs-toast')).toBeNull();
    });

    it('waits for clipboard success before prompting to paste', async () => {
      document.execCommand = vi.fn().mockReturnValue(false);
      let finishCopy!: () => void;
      writeText.mockReturnValue(new Promise<void>((resolve) => { finishCopy = resolve; }));
      adapter.recordKey('/');
      adapter.replaceText(0, 1, 'fallback text');

      expect(writeText).toHaveBeenCalledWith('fallback text');
      expect(document.getElementById('fillin-docs-toast')).toBeNull();
      expect(adapter.getText()).toBe('');
      // Finishing the copy must not clear keys typed after expansion.
      adapter.recordKey('x');
      finishCopy();
      await vi.advanceTimersByTimeAsync(0);

      const toast = document.getElementById('fillin-docs-toast');
      expect(toast?.textContent).toContain('Snippet Copied!');
      expect(toast?.textContent).toContain('Ctrl+V');
      expect(adapter.getText()).toBe('x');
    });

    it('falls back when direct insertion throws', async () => {
      document.execCommand = vi.fn((command: string) => {
        if (command === 'insertText') throw new Error('Unsupported command');
        return true;
      });
      adapter.replaceText(0, 0, 'fallback text');
      await vi.advanceTimersByTimeAsync(0);

      expect(writeText).toHaveBeenCalledWith('fallback text');
      expect(document.getElementById('fillin-docs-toast')?.textContent).toContain('Snippet Copied!');
    });

    it.each(['rejects', 'throws', 'unavailable'])('reports failure when clipboard %s', async (failure) => {
      document.execCommand = vi.fn().mockReturnValue(false);
      if (failure === 'rejects') {
        writeText.mockRejectedValue(new Error('Permission denied'));
      } else if (failure === 'throws') {
        writeText.mockImplementation(() => { throw new Error('Clipboard blocked'); });
      } else {
        vi.stubGlobal('navigator', { platform: 'Win32' });
      }

      adapter.replaceText(0, 0, 'fallback text');
      await vi.advanceTimersByTimeAsync(0);

      const message = document.getElementById('fillin-docs-toast')?.textContent;
      expect(message).toContain('Could not insert or copy');
      expect(message).not.toContain('Snippet Copied!');
      expect(message).not.toContain('to paste');
    });

    it('does not copy or prompt for empty content', () => {
      document.execCommand = vi.fn().mockReturnValue(false);
      adapter.replaceText(0, 0, '');
      expect(writeText).not.toHaveBeenCalled();
      expect(document.getElementById('fillin-docs-toast')).toBeNull();
    });
  });

  describe('TextInputAdapter', () => {
    let input: HTMLInputElement;
    let adapter: TextInputAdapter;

    beforeEach(() => {
      input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);
      adapter = new TextInputAdapter(input);
    });

    it('reads text and cursor position correctly', () => {
      input.value = 'hello world';
      input.selectionStart = 5;

      expect(adapter.getText()).toBe('hello world');
      expect(adapter.getCursorPosition()).toBe(5);
    });

    it('replaces text correctly and updates cursor', () => {
      input.value = 'hello /trigger world';
      input.selectionStart = 14;

      // replace '/trigger' with 'replaced'
      adapter.replaceText(6, 14, 'replaced');

      expect(input.value).toBe('hello replaced world');
      expect(input.selectionStart).toBe(14); // 6 + 8
    });

    it('dispatches composed input and change events to cross shadow DOM boundaries', () => {
      let inputEventReceived: Event | null = null;
      let changeEventReceived: Event | null = null;

      input.addEventListener('input', (e) => {
        inputEventReceived = e;
      });
      input.addEventListener('change', (e) => {
        changeEventReceived = e;
      });

      adapter.replaceText(0, 0, 'new test');

      expect(inputEventReceived).not.toBeNull();
      expect((inputEventReceived as unknown as Event).bubbles).toBe(true);
      expect((inputEventReceived as unknown as Event).composed).toBe(true);

      expect(changeEventReceived).not.toBeNull();
      expect((changeEventReceived as unknown as Event).bubbles).toBe(true);
      expect((changeEventReceived as unknown as Event).composed).toBe(true);
    });
  });

  describe('ContentEditableAdapter', () => {
    let div: HTMLDivElement;
    let adapter: ContentEditableAdapter;

    beforeEach(() => {
      div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);
      adapter = new ContentEditableAdapter(div);

      // JSDOM has limited Selection support, but we can set it up
      const textNode = document.createTextNode('hello /trigger world');
      div.appendChild(textNode);

      const range = document.createRange();
      range.setStart(textNode, 14);
      range.collapse(true);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    it('reads text and cursor position correctly', () => {
      expect(adapter.getText()).toBe('hello /trigger world');
      expect(adapter.getCursorPosition()).toBe(14);
    });

    it('replaces text correctly and updates cursor', () => {
      adapter.replaceText(6, 14, 'replaced');

      expect(div.textContent).toBe('hello replaced world');

      const selection = window.getSelection();
      expect(selection?.anchorOffset).toBe(14); // 6 + 8
    });
  });

  describe('AdapterFactory', () => {
    it('returns TextInputAdapter for input elements', () => {
      const input = document.createElement('input');
      const textarea = document.createElement('textarea');

      expect(AdapterFactory.getAdapter(input)).toBeInstanceOf(TextInputAdapter);
      expect(AdapterFactory.getAdapter(textarea)).toBeInstanceOf(
        TextInputAdapter
      );
    });

    it('returns ContentEditableAdapter for contenteditable elements', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);
      div.setAttribute('contenteditable', 'true');
      div.contentEditable = 'true';

      expect(AdapterFactory.getAdapter(div)).toBeInstanceOf(
        ContentEditableAdapter
      );
    });

    it('returns null for standard elements', () => {
      const div = document.createElement('div');
      expect(AdapterFactory.getAdapter(div)).toBeNull();
      expect(AdapterFactory.getAdapter(null)).toBeNull();
    });

    it('returns GoogleDocsAdapter when on Google Docs canvas', () => {
      vi.spyOn(window.location, 'hostname', 'get').mockReturnValue(
        'docs.google.com'
      );
      vi.spyOn(window.location, 'pathname', 'get').mockReturnValue(
        '/document/d/12345/edit'
      );

      const docsCanvas = document.createElement('div');
      docsCanvas.className = 'kix-appview-editor';
      document.body.appendChild(docsCanvas);

      expect(AdapterFactory.getAdapter(docsCanvas)).toBeInstanceOf(
        GoogleDocsAdapter
      );
    });

    it('returns TextInputAdapter when on Google Docs title input', () => {
      vi.spyOn(window.location, 'hostname', 'get').mockReturnValue(
        'docs.google.com'
      );
      vi.spyOn(window.location, 'pathname', 'get').mockReturnValue(
        '/document/d/12345/edit'
      );

      const titleInput = document.createElement('input');
      titleInput.className = 'docs-title-input';
      titleInput.type = 'text';
      document.body.appendChild(titleInput);

      expect(AdapterFactory.getAdapter(titleInput)).toBeInstanceOf(
        TextInputAdapter
      );
    });
  });
});
