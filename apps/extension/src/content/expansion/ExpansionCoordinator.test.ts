import { afterEach, describe, expect, it, vi } from 'vitest';
import { expandSnippet } from './ExpansionCoordinator';
import { statsService } from '../../services/StatsService';
import { TextInputAdapter } from '../adapters/TextInputAdapter';
import { cancelTemplateDialog } from '../templates/TemplateDialog';

afterEach(() => {
  cancelTemplateDialog();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('expansion resolution', () => {
  it('resolves repeated fields once using the opening timestamp and counts only the completed insertion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
    const stats = vi.spyOn(statsService, 'recordExpansion').mockResolvedValue({} as never);
    document.body.innerHTML = '<textarea>Before /reply after</textarea>';
    const field = document.querySelector('textarea')!;
    field.focus(); field.setSelectionRange(13, 13);
    const adapter = new TextInputAdapter(field);
    const result = expandSnippet(adapter, { content: '{{name}} / {{name}} / {{date}}', templateVersion: 1, dateFormat: 'iso' }, 7, 13);
    const root = document.querySelector('#fillin-template-host')!.shadowRoot!;
    expect(root.querySelectorAll('input')).toHaveLength(1);
    root.querySelector('input')!.value = 'Ada {{date}}';
    vi.setSystemTime(new Date(2027, 0, 1, 0, 1));
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(await result).toBe('inserted');
    const completed = 'Ada {{date}} / Ada {{date}} / 2026-12-31';
    expect(field.value).toBe(`Before ${completed} after`);
    expect(field.selectionStart).toBe(7 + completed.length);
    expect(stats).toHaveBeenCalledTimes(1);
    expect(stats).toHaveBeenCalledWith(6, completed.length);
  });

  it('rejects source edits before insertion and does not record expansion statistics', async () => {
    const stats = vi.spyOn(statsService, 'recordExpansion').mockResolvedValue({} as never);
    document.body.innerHTML = '<input value="/reply">';
    const field = document.querySelector('input')!;
    field.focus(); field.setSelectionRange(6, 6);
    const result = expandSnippet(new TextInputAdapter(field), { content: 'Hi {{name}}', templateVersion: 1 }, 0, 6);
    const root = document.querySelector('#fillin-template-host')!.shadowRoot!;
    root.querySelector('input')!.value = 'Ada';
    field.value = 'Changed externally';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(root.querySelector('[role=alert]')!.textContent).toContain('changed');
    cancelTemplateDialog();
    expect(await result).toBe('failed');
    expect(field.value).toBe('Changed externally');
    expect(stats).not.toHaveBeenCalled();
  });

  it('does not use destructive adapter replacement on an unanchorable editor', async () => {
    const replaceText = vi.fn();
    const adapter = { getText: () => '/reply', getCursorPosition: () => 6, replaceText };
    const result = expandSnippet(adapter, { content: 'Hi {{name}}', templateVersion: 1 }, 0, 6);
    const root = document.querySelector('#fillin-template-host')!.shadowRoot!;
    expect(root.querySelector('button[type=submit]')).toBeNull();
    cancelTemplateDialog();
    expect(await result).toBe('failed');
    expect(replaceText).not.toHaveBeenCalled();
  });

  it('copies only after an explicit action on unanchorable editors without deleting triggers or counting an insertion', async () => {
    const stats = vi.spyOn(statsService, 'recordExpansion').mockResolvedValue({} as never);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { language: 'en-US', clipboard: { writeText } });
    const replaceText = vi.fn();
    const adapter = { getText: () => '/reply', getCursorPosition: () => 6, replaceText };
    const result = expandSnippet(adapter, { content: 'Hi {{name}}', templateVersion: 1 }, 0, 6);
    const root = document.querySelector('#fillin-template-host')!.shadowRoot!;
    root.querySelector('input')!.value = 'Ada';
    expect(writeText).not.toHaveBeenCalled();
    Array.from(root.querySelectorAll('button')).find((button) => button.textContent === 'Copy completed message')!.click();
    await vi.waitFor(() => expect(root.querySelector('[role=status]')!.textContent).toContain('Message copied'));
    cancelTemplateDialog();
    expect(await result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('Hi Ada');
    expect(adapter.getText()).toBe('/reply');
    expect(replaceText).not.toHaveBeenCalled();
    expect(stats).not.toHaveBeenCalled();
  });
  it('resolves the date again after midnight without modifying saved content', async () => {
    vi.useFakeTimers();
    vi.spyOn(statsService, 'recordExpansion').mockResolvedValue({} as never);
    const replaceText = vi.fn().mockReturnValue('inserted');
    const adapter = { getText: () => '/today', getCursorPosition: () => 6, replaceText };
    const snippet = {
      content: '{{date}}',
      templateVersion: 1 as const,
      dateFormat: 'iso' as const,
    };
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
    await expandSnippet(adapter, snippet, 0, 6);
    expect(replaceText).toHaveBeenLastCalledWith(0, 6, '2026-12-31', undefined);
    vi.setSystemTime(new Date(2027, 0, 1, 0, 0));
    await expandSnippet(adapter, snippet, 0, 6);
    expect(replaceText).toHaveBeenLastCalledWith(0, 6, '2027-01-01', undefined);
    expect(snippet.content).toBe('{{date}}');
  });
  it('keeps literal braces unchanged and only counts confirmed insertion', async () => {
    const stats = vi.spyOn(statsService, 'recordExpansion').mockResolvedValue({} as never);
    const replaceText = vi.fn().mockResolvedValue('copied');
    const adapter = { getText: () => '', getCursorPosition: () => 0, replaceText };
    expect(await expandSnippet(adapter, { content: '{{date}}' }, 0, 0)).toBe('copied');
    expect(replaceText).toHaveBeenCalledWith(0, 0, '{{date}}', undefined);
    expect(stats).not.toHaveBeenCalled();
    replaceText.mockResolvedValue('failed');
    await expandSnippet(adapter, { content: 'hello' }, 0, 0);
    expect(stats).not.toHaveBeenCalled();
    replaceText.mockResolvedValue(undefined);
    expect(await expandSnippet(adapter, { content: 'hello' }, 0, 0)).toBe('failed');
    expect(stats).not.toHaveBeenCalled();
    replaceText.mockClear();
    expect(await expandSnippet(adapter, { content: 'hello' }, 0, 0, () => false)).toBe('failed');
    expect(replaceText).not.toHaveBeenCalled();
  });
});
