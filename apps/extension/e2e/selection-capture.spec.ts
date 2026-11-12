import { test, expect, waitForExtension } from './fixtures';
import type { BrowserContext, Worker } from '@playwright/test';

// Exercise the installed editor/session storage. The native menu callback is
// covered separately in unit tests; no test-only command is shipped to users.
async function openCapture(context: BrowserContext, worker: Worker, extensionId: string, text: string) {
  const opened = context.waitForEvent('page');
  const id = await worker.evaluate(async ({ extensionId, text }) => {
    const id = crypto.randomUUID();
    const win = await chrome.windows.create({ url: 'about:blank', type: 'popup', width: 460, height: 750 });
    const { fillin_capture_drafts = {} } = await chrome.storage.session.get('fillin_capture_drafts');
    await chrome.storage.session.set({ fillin_capture_drafts: { ...fillin_capture_drafts, [id]: { text, expiresAt: Date.now() + 600000, windowId: win!.id } } });
    await chrome.tabs.update(win!.tabs![0].id!, { url: `chrome-extension://${extensionId}/src/popup/index.html?capture=${id}` });
    return id;
  }, { extensionId, text });
  const editor = await opened;
  await editor.waitForURL(/\?capture=/);
  await editor.setViewportSize({ width: 440, height: 700 });
  await expect(editor.getByLabel('Expanded text')).toHaveValue(text);
  return { editor, id };
}

test.beforeEach(async ({ extensionWorker }) => {
  await extensionWorker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
  });
});

test('saves captured text literally and keeps multiple editors independent', async ({ context, extensionWorker, extensionId }, testInfo) => {
  const first = await openCapture(context, extensionWorker, extensionId, '<b>Useful {{date}}</b>');
  const second = await openCapture(context, extensionWorker, extensionId, 'Another useful selection');
  await expect(first.editor.getByRole('checkbox', { name: /Use template values/ })).not.toBeChecked();
  await first.editor.getByPlaceholder('email, name, sig...').fill('captured');
  await first.editor.screenshot({ path: testInfo.outputPath('selection-editor.png') });
  const closed = first.editor.waitForEvent('close');
  await first.editor.getByRole('button', { name: 'Save Snippet', exact: true }).click();
  await closed;
  const state = await extensionWorker.evaluate(async () => ({
    local: await chrome.storage.local.get('fillin_snippets'),
    session: await chrome.storage.session.get('fillin_capture_drafts'),
  }));
  expect(state.local.fillin_snippets).toHaveLength(1);
  expect(state.local.fillin_snippets[0]).toMatchObject({ trigger: '/captured', content: '<b>Useful {{date}}</b>', isHtml: false });
  expect(state.local.fillin_snippets[0].templateVersion).toBeUndefined();
  expect(state.session.fillin_capture_drafts[first.id]).toBeUndefined();
  expect(state.session.fillin_capture_drafts[second.id].text).toBe('Another useful selection');
  const cancelled = second.editor.waitForEvent('close');
  await second.editor.getByRole('button', { name: 'Go back' }).click();
  await cancelled;
  await expect.poll(() => extensionWorker.evaluate(async () => Object.keys((await chrome.storage.session.get('fillin_capture_drafts')).fillin_capture_drafts ?? {}))).toEqual([]);
});

test('preserves edits on a failed library read and recovers after retry', async ({ context, extensionWorker, extensionId }) => {
  const { editor } = await openCapture(context, extensionWorker, extensionId, 'Keep my selection');
  await editor.getByPlaceholder('email, name, sig...').fill('recover');
  await editor.getByLabel('Expanded text').fill('Keep my edited selection');
  await extensionWorker.evaluate(() => chrome.storage.local.set({ fillin_snippets: 'corrupt original data' }));
  await editor.getByRole('button', { name: 'Save Snippet', exact: true }).click();
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(editor.getByLabel('Expanded text')).toHaveValue('Keep my edited selection');
  expect((await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_snippets'))).fillin_snippets).toBe('corrupt original data');
  await extensionWorker.evaluate(() => chrome.storage.local.set({ fillin_snippets: [] }));
  const closed = editor.waitForEvent('close');
  await editor.getByRole('button', { name: 'Save Snippet', exact: true }).click();
  await closed;
  expect((await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_snippets'))).fillin_snippets[0].content).toBe('Keep my edited selection');
});

test('verifies a real right-click selection and excludes passwords in the installed content script', async ({ page, extensionWorker }) => {
  await extensionWorker.evaluate(() => chrome.storage.local.set({ fillin_snippets: [
    { id: 'email', trigger: '/email', content: 'test@example.com', createdAt: 1, updatedAt: 1 },
  ] }));
  await page.goto('/');
  await waitForExtension(page);
  const textarea = page.getByLabel('Multiline input');
  await textarea.fill('Before selected after');
  await textarea.evaluate((node: HTMLTextAreaElement) => { node.focus(); node.setSelectionRange(7, 15); });
  await textarea.click({ button: 'right', position: { x: 75, y: 8 } });
  expect(await textarea.evaluate((node: HTMLTextAreaElement) => node.value.slice(node.selectionStart, node.selectionEnd))).toBe('selected');
  const verify = (text: string) => extensionWorker.evaluate(async (text) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return chrome.tabs.sendMessage(tab.id!, { type: 'FILLIN_VERIFY_SELECTION', text }, { frameId: 0 });
  }, text);
  expect(await verify('selected')).toEqual({ allowed: true });
  expect(await verify('selected')).toEqual({ allowed: false });
  await page.keyboard.press('Escape');
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('private');
  await password.selectText();
  await password.click({ button: 'right' });
  expect(await verify('private')).toEqual({ allowed: false });
});

test('an expired selection shows recovery guidance instead of an empty editor', async ({ context, extensionWorker, extensionId }) => {
  const { editor, id } = await openCapture(context, extensionWorker, extensionId, 'Old selection');
  await extensionWorker.evaluate(async (id) => {
    const result = await chrome.storage.session.get('fillin_capture_drafts');
    result.fillin_capture_drafts[id].expiresAt = 0;
    await chrome.storage.session.set(result);
  }, id);
  await editor.reload();
  await expect(editor.getByRole('alert')).toContainText('expired');
  await expect(editor.getByLabel('Expanded text')).toHaveCount(0);
  await expect(editor.getByRole('button', { name: 'Try again' })).toBeVisible();
});
