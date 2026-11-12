import { afterEach, expect, it, vi } from 'vitest';
import { expandSnippet } from './ExpansionCoordinator';
import { statsService } from '../../services/StatsService';
import { TextInputAdapter } from '../adapters/TextInputAdapter';
import { ContentEditableAdapter } from '../adapters/ContentEditableAdapter';
import { GoogleDocsAdapter } from '../adapters/GoogleDocsAdapter';
import { cancelTemplateDialog } from '../templates/TemplateDialog';

afterEach(() => { cancelTemplateDialog(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const template = (content: string) => ({ content, templateVersion: 1 as const });

it.each([
  ['input', '{{cursor}}abc', 'abc', 0],
  ['input', 'abc{{cursor}}', 'abc', 3],
  ['input', '{{cursor}}', '', 0],
  ['input', '🐴\n{{cursor}}Best', '🐴Best', 2],
  ['textarea', 'A\r\n🐴{{cursor}}\r\nB', 'A\n🐴\nB', 4],
] as const)('places the caret correctly in %s for %s', async (tag, content, expected, offset) => {
  const stats = vi.spyOn(statsService, 'recordExpansion').mockResolvedValue({} as never);
  document.body.innerHTML = `<${tag}></${tag}>`;
  const field = document.querySelector(tag)! as HTMLInputElement | HTMLTextAreaElement;
  field.value = 'Before /cur after'; field.focus(); field.setSelectionRange(11, 11);
  const result = await expandSnippet(new TextInputAdapter(field), template(content), 7, 11);
  expect(result).toBe('inserted');
  expect(field.value).toBe(`Before ${expected} after`);
  expect(field.selectionStart).toBe(7 + offset);
  expect(field.selectionEnd).toBe(7 + offset);
  expect(stats).toHaveBeenCalledTimes(1);
  expect(stats).toHaveBeenCalledWith(4, expected.length);
});

it('positions after field substitution and never reinterprets cursor text in an answer', async () => {
  vi.spyOn(statsService, 'recordExpansion').mockResolvedValue({} as never);
  document.body.innerHTML = '<textarea>/cur</textarea>';
  const field = document.querySelector('textarea')!; field.focus(); field.setSelectionRange(4, 4);
  const result = expandSnippet(new TextInputAdapter(field), template('{{name}} {{name}}{{cursor}}\nBye'), 0, 4);
  const root = document.querySelector('#fillin-template-host')!.shadowRoot!;
  root.querySelector('input')!.value = '🐴{{cursor}}';
  root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(await result).toBe('inserted');
  const prefix = '🐴{{cursor}} 🐴{{cursor}}';
  expect(field.value).toBe(prefix + '\nBye');
  expect(field.selectionStart).toBe(prefix.length);
});

it('does not place a caret or count a confirmed insertion after controlled-field handlers replace the value', async () => {
  const stats = vi.spyOn(statsService, 'recordExpansion').mockResolvedValue({} as never);
  document.body.innerHTML = '<input value="/cur">';
  const field = document.querySelector('input')!; field.focus(); field.setSelectionRange(4, 4);
  field.addEventListener('input', () => { field.value = 'Host changed the value'; });
  const result = await expandSnippet(new TextInputAdapter(field), template('Hi{{cursor}} there'), 0, 4);
  expect(result).toBe('failed');
  expect(field.value).toBe('Host changed the value');
  expect(field.selectionStart).not.toBe(2);
  expect(stats).not.toHaveBeenCalled();
});

it('maps rich-text offsets within one verified text node and preserves its neighboring markup', async () => {
  vi.spyOn(statsService, 'recordExpansion').mockResolvedValue({} as never);
  document.body.innerHTML = '<div contenteditable="true">Before <strong>/cur</strong> <em>after</em></div>';
  const field = document.querySelector('div')!;
  Object.defineProperty(field, 'isContentEditable', { value: true });
  const node = field.querySelector('strong')!.firstChild!;
  const range = document.createRange(); range.setStart(node, 4); range.collapse(true);
  field.focus(); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  expect(await expandSnippet(new ContentEditableAdapter(field), template('🐴{{cursor}}\nBest'), 0, 4)).toBe('inserted');
  const strong = field.querySelector('strong')!;
  expect(Array.from(strong.childNodes).map((item) => item.nodeName === 'BR' ? '\n' : item.textContent).join('')).toBe('🐴\nBest');
  expect(field.querySelector('em')!.textContent).toBe('after');
  expect(window.getSelection()!.anchorNode!.textContent).toBe('🐴');
  expect(window.getSelection()!.anchorOffset).toBe(2);
});

it('offers clean copying when a rich editor has no reliable text-node mapping', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { language: 'en-US', clipboard: { writeText } });
  document.body.innerHTML = '<div contenteditable="true"><strong>Original</strong></div>';
  const field = document.querySelector('div')!;
  Object.defineProperty(field, 'isContentEditable', { value: true });
  const range = document.createRange(); range.setStart(field, 0); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  const adapter = new ContentEditableAdapter(field);
  const replace = vi.spyOn(adapter, 'replaceText');
  const result = expandSnippet(adapter, template('Hi{{cursor}}\nBest'), 0, 0);
  const root = document.querySelector('#fillin-template-host')!.shadowRoot!;
  expect(root.querySelector('h2')!.textContent).toBe('Copy snippet');
  expect(root.querySelector('header p')!.textContent).toContain('Cursor placement is unavailable');
  expect(root.querySelector('pre')!.textContent).toBe('Hi\nBest');
  expect(root.activeElement?.textContent).toBe('Copy completed message');
  root.querySelectorAll('button')[1].click();
  await vi.waitFor(() => expect(root.querySelector('[role=status]')!.textContent).toContain('Message copied'));
  expect(writeText).toHaveBeenCalledWith('Hi\nBest');
  cancelTemplateDialog(); expect(await result).toBe('copied');
  expect(replace).not.toHaveBeenCalled();
  expect(field.textContent).toBe('Original');
});

it('refuses a multiline cursor mapping after a host rerender removes inserted nodes', async () => {
  const stats = vi.spyOn(statsService, 'recordExpansion').mockResolvedValue({} as never);
  document.body.innerHTML = '<div contenteditable="true">/cur</div>';
  const field = document.querySelector('div')!;
  Object.defineProperty(field, 'isContentEditable', { value: true });
  const node = field.firstChild!;
  const range = document.createRange(); range.setStart(node, 4); range.collapse(true);
  field.focus(); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  field.addEventListener('input', () => { field.innerHTML = '<em>Host replacement</em>'; }, { once: true });
  expect(await expandSnippet(new ContentEditableAdapter(field), template('A{{cursor}}\nB'), 0, 4)).toBe('failed');
  expect(field.innerHTML).toBe('<em>Host replacement</em>');
  expect(stats).not.toHaveBeenCalled();
});

it('never reads protected field values or offers copying for them', () => {
  document.body.innerHTML = '<input type="password">';
  const field = document.querySelector('input')!;
  const read = vi.spyOn(field, 'value', 'get').mockImplementation(() => { throw new Error('private value'); });
  const adapter = new TextInputAdapter(field);
  expect(adapter.canCopyTemplate()).toBe(false);
  expect(adapter.replaceTextWithCursor(0, 0, 'safe', 0)).toEqual({ result: 'failed' });
  expect(read).not.toHaveBeenCalled();
});

it('keeps literal cursor text unchanged in snippets without template mode', async () => {
  vi.spyOn(statsService, 'recordExpansion').mockResolvedValue({} as never);
  const replaceText = vi.fn().mockReturnValue('inserted');
  const adapter = { getText: () => '/cur', getCursorPosition: () => 4, replaceText };
  expect(await expandSnippet(adapter, { content: '{{cursor}}' }, 0, 4)).toBe('inserted');
  expect(replaceText).toHaveBeenCalledWith(0, 4, '{{cursor}}', undefined);
  expect(document.querySelector('#fillin-template-host')).toBeNull();
});

it('never calls the Google Docs deletion/insertion path for a cursor template', async () => {
  const stats = vi.spyOn(statsService, 'recordExpansion').mockResolvedValue({} as never);
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { language: 'en-US', clipboard: { writeText } });
  const adapter = GoogleDocsAdapter.getInstance(); adapter.resetBuffer();
  for (const key of '/cur') adapter.recordKey(key);
  const replace = vi.spyOn(adapter, 'replaceText');
  const result = expandSnippet(adapter, template('Hello{{cursor}}\nBest'), 0, 4);
  const root = document.querySelector('#fillin-template-host')!.shadowRoot!;
  expect(root.querySelector('header p')!.textContent).toContain('Cursor placement is unavailable');
  root.querySelectorAll('button')[1].click();
  await vi.waitFor(() => expect(root.querySelector('[role=status]')!.textContent).toContain('Message copied'));
  cancelTemplateDialog(); expect(await result).toBe('copied');
  expect(writeText).toHaveBeenCalledWith('Hello\nBest');
  expect(replace).not.toHaveBeenCalled();
  expect(stats).not.toHaveBeenCalled();
  adapter.resetBuffer();
});
