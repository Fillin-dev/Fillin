import { afterEach, expect, it, vi } from 'vitest';
import { showTemplateDialog, cancelTemplateDialog, isTemplateDialogOpen } from './TemplateDialog';

afterEach(() => { cancelTemplateDialog(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const root = () => document.querySelector('#fillin-template-host')!.shadowRoot!;
const input = () => root().querySelector('input')!;
const submit = () => root().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

function open(overrides: Partial<Parameters<typeof showTemplateDialog>[0]> = {}) {
  const options = {
    fields: ['name'], render: (v: Record<string, string>) => `Hi ${v.name || '‹name›'}`,
    valid: () => true, canInsert: true,
    insert: vi.fn<[], Promise<'inserted'>>().mockResolvedValue('inserted'), restore: vi.fn(), ...overrides,
  };
  const result = showTemplateDialog(options);
  return { options, result };
}

it('keeps previews literal, requires fields, traps focus and restores on Escape', async () => {
  const { result, options } = open();
  expect(isTemplateDialogOpen()).toBe(true);
  expect(root().activeElement).toBe(input());
  submit();
  expect(root().querySelector('[role=alert]')!.textContent).toContain('Complete each field');
  expect(options.insert).not.toHaveBeenCalled();
  input().value = '<img src=x onerror=alert(1)>{{date}}';
  input().dispatchEvent(new Event('input'));
  expect(root().querySelector('pre')!.textContent).toContain('<img');
  expect(root().querySelector('img')).toBeNull();
  input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  expect((root().activeElement as HTMLElement).textContent).toBe('Insert');
  root().activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(await result).toBe('failed');
  expect(options.restore).toHaveBeenCalledOnce();
  expect(document.querySelector('#fillin-template-host')).toBeNull();
});

it('does not double-submit while insertion is pending or submit during composition', async () => {
  let finish!: (v: 'inserted') => void;
  const insert = vi.fn(() => new Promise<'inserted'>((resolve) => { finish = resolve; }));
  const { result } = open({ insert });
  input().value = 'Zoë';
  input().dispatchEvent(new Event('compositionstart', { bubbles: true }));
  submit(); expect(insert).not.toHaveBeenCalled();
  input().dispatchEvent(new Event('compositionend', { bubbles: true }));
  submit(); submit(); expect(insert).toHaveBeenCalledTimes(1);
  finish('inserted'); expect(await result).toBe('inserted');
});

it('waits for clipboard confirmation and retries a failed copy without claiming insertion', async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const { result, options } = open({ canInsert: false });
  input().value = 'Ada';
  expect(root().querySelector('button[type=submit]')).toBeNull();
  submit();
  await vi.waitFor(() => expect(root().querySelector('[role=alert]')!.textContent).toBe('denied'));
  submit();
  await vi.waitFor(() => expect(root().querySelector('[role=status]')!.textContent).toContain('Message copied'));
  expect(options.insert).not.toHaveBeenCalled();
  expect(writeText).toHaveBeenLastCalledWith('Hi Ada');
  expect(input().value).toBe('Ada');
  cancelTemplateDialog();
  expect(await result).toBe('copied');
});

it('refuses changed targets and closes a prior interaction before opening another', async () => {
  const first = open({ valid: () => false });
  input().value = 'Ada'; submit();
  await vi.waitFor(() => expect(root().querySelector('[role=alert]')!.textContent).toContain('changed'));
  expect(first.options.insert).not.toHaveBeenCalled();
  const second = open();
  expect(await first.result).toBe('failed');
  expect(document.querySelectorAll('#fillin-template-host')).toHaveLength(1);
  cancelTemplateDialog(); expect(await second.result).toBe('failed');
});
