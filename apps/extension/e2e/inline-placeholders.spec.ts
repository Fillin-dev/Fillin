import { test, expect, waitForExtension, openExtensionWindow } from './fixtures';
import type { Page, Worker } from '@playwright/test';

async function seed(worker: Worker, content = 'Hi {{name}} / {{company}}{{cursor}}!') {
  await worker.evaluate(async (content) => {
    await chrome.storage.local.clear(); await chrome.storage.session.clear();
    await chrome.storage.local.set({ fillin_snippets: [
      { id: 'email', trigger: '/email', content: 'test@example.com', createdAt: 1, updatedAt: 1 },
      { id: 'inline', trigger: '/go', content, templateVersion: 1, editAfterInsert: true, createdAt: 1, updatedAt: 1 },
    ] });
  }, content);
}
async function openInline(page: Page, label = 'Multiline input') {
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByLabel(label, { exact: true });
  await field.fill('Before /go after');
  await field.evaluate((node: HTMLInputElement | HTMLTextAreaElement) => node.setSelectionRange(10, 10));
  await field.press('Control+Space');
  await expect(page.locator('#fillin-inline-hint')).toHaveCount(1);
  return field;
}
const selected = (field: ReturnType<Page['getByLabel']>) => field.evaluate((node: HTMLInputElement | HTMLTextAreaElement) => node.value.slice(node.selectionStart!, node.selectionEnd!));

for (const label of ['Text input', 'Multiline input']) {
  test(`native insertText preserves undo/redo history in ${label}`, async ({ page }) => {
    await page.goto('/');
    const field = page.getByLabel(label, { exact: true });
    await field.pressSequentially('Before /go after');
    await field.evaluate((node: HTMLInputElement | HTMLTextAreaElement) => {
      node.setSelectionRange(7, 10);
      const insert = (raw: Event) => {
        const event = raw as KeyboardEvent;
        if (event.ctrlKey && event.code === 'Space') {
          node.removeEventListener('keydown', insert);
          event.preventDefault(); document.execCommand('insertText', false, 'Hi name, from company.');
          node.setSelectionRange(10, 14);
        }
      };
      node.addEventListener('keydown', insert);
    });
    await field.press('Control+Space');
    await expect(field).toHaveValue('Before Hi name, from company. after');
    await page.keyboard.type('Ada');
    await expect(field).toHaveValue('Before Hi Ada, from company. after');
    await field.press('ControlOrMeta+z');
    const undone = [await field.inputValue()];
    while (undone.at(-1) !== 'Before /go after' && undone.length < 10) {
      await field.press('ControlOrMeta+z'); undone.push(await field.inputValue());
    }
    expect(undone).toContain('Before Hi name, from company. after');
    expect(undone.at(-1)).toBe('Before /go after');
    for (let step = 0; step < undone.length; step++) await field.press('ControlOrMeta+Shift+z');
    await expect(field).toHaveValue('Before Hi Ada, from company. after');
  });
}

test('edits independent placeholders and finishes at the adjusted cursor before normal Tab resumes', async ({ page, extensionWorker }) => {
  await extensionWorker.evaluate(() => chrome.storage.local.set({ fillin_snippets: [
    { id: 'email', trigger: '/email', content: 'test@example.com', createdAt: 1, updatedAt: 1 },
    { id: 'inline', trigger: '/go', content: 'Hi {{name}}, from {{company}}. {{name}}{{cursor}}\nBest', templateVersion: 1, editAfterInsert: true, createdAt: 1, updatedAt: 1 },
  ] }));
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByLabel('Multiline input');
  await field.fill('Before /go after');
  await field.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(10, 10));
  await field.press('Control+Space');
  await expect(field).toHaveValue('Before Hi ‹name›, from ‹company›. ‹name›\nBest after');
  await expect(page.locator('#fillin-inline-hint .hint')).toContainText('Field 1/3');
  expect(await field.evaluate((node: HTMLTextAreaElement) => node.value.slice(node.selectionStart, node.selectionEnd))).toBe('‹name›');
  await page.keyboard.type('Ada🐴');
  await field.press('Tab');
  expect(await field.evaluate((node: HTMLTextAreaElement) => node.value.slice(node.selectionStart, node.selectionEnd))).toBe('‹company›');
  await page.keyboard.type('Local Studio');
  await field.press('Tab');
  expect(await field.evaluate((node: HTMLTextAreaElement) => node.value.slice(node.selectionStart, node.selectionEnd))).toBe('‹name›');
  await page.keyboard.type('Sam');
  await field.press('Shift+Tab');
  expect(await field.evaluate((node: HTMLTextAreaElement) => node.value.slice(node.selectionStart, node.selectionEnd))).toBe('Local Studio');
  await field.press('Tab'); await field.press('Tab');
  await expect(page.locator('#fillin-inline-hint')).toHaveCount(0);
  await page.keyboard.type('!');
  await expect(field).toHaveValue('Before Hi Ada🐴, from Local Studio. Sam!\nBest after');
  await field.press('Tab'); await expect(field).not.toBeFocused();
});

for (const [content, expected] of [['{{cursor}}{{name}}|{{company}}', 'Before ^🐴|Co after'], ['{{name}}{{cursor}}|{{company}}', 'Before 🐴^|Co after']]) {
  test(`retains cursor affinity through empty edits for ${content}`, async ({ page, extensionWorker }) => {
    await seed(extensionWorker, content); const field = await openInline(page);
    await field.press('Backspace'); await page.keyboard.type('🐴');
    await field.press('Tab'); expect(await selected(field)).toBe('‹company›');
    await page.keyboard.type('Co'); await field.press('Tab');
    await expect(page.locator('#fillin-inline-hint')).toHaveCount(0);
    await page.keyboard.type('^'); await expect(field).toHaveValue(expected);
  });
}

test('finishes at the end without a marker and does not save answers or count labels as saved typing', async ({ page, extensionWorker }) => {
  await seed(extensionWorker, 'Hello {{name}} / {{company}}'); const field = await openInline(page, 'Text input');
  await page.keyboard.type('Unique Ada'); await field.press('Tab'); await page.keyboard.type('Unique Studio'); await field.press('Tab');
  await page.keyboard.type('!'); await expect(field).toHaveValue('Before Hello Unique Ada / Unique Studio! after');
  await expect.poll(() => extensionWorker.evaluate(async () => (await chrome.storage.local.get('fillin_stats')).fillin_stats?.expansionCount)).toBe(1);
  const data = await extensionWorker.evaluate(async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }));
  expect(JSON.stringify(data)).not.toContain('Unique Ada'); expect(JSON.stringify(data)).not.toContain('Unique Studio');
  expect(data.local.fillin_stats.keystrokesSaved).toBe('Hello  / '.length - '/go'.length);
});

for (const label of ['Text input', 'Multiline input']) {
test(`preserves native undo/redo and ends navigation in ${label}`, async ({ page, extensionWorker }) => {
  await seed(extensionWorker, label === 'Multiline input' ? 'Hi {{name}}\nfrom {{company}}{{cursor}}!' : undefined);
  const field = await openInline(page, label);
  await page.keyboard.type('Ada'); const edited = await field.inputValue();
  await field.press('ControlOrMeta+z'); await expect(page.locator('#fillin-inline-hint')).toHaveCount(0);
  let steps = 1;
  while (await field.inputValue() !== 'Before /go after' && steps < 15) { await field.press('ControlOrMeta+z'); steps++; }
  await expect(field).toHaveValue('Before /go after');
  for (let n = 0; n < steps; n++) await field.press('ControlOrMeta+Shift+z');
  await expect(field).toHaveValue(edited); await expect(page.locator('#fillin-inline-hint')).toHaveCount(0);
  await field.press('Tab'); await expect(field).not.toBeFocused();
});
}

test('tracks native multiline paste and preserves its undo transaction', async ({ page, context, extensionWorker }) => {
  await seed(extensionWorker); const field = await openInline(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  await page.evaluate(() => navigator.clipboard.writeText('Pasted 🐴\nTwo lines'));
  await field.press('ControlOrMeta+v');
  await expect(field).toHaveValue('Before Hi Pasted 🐴\nTwo lines / ‹company›! after');
  await field.press('Tab'); expect(await selected(field)).toBe('‹company›');
  await field.press('Escape'); await field.press('ControlOrMeta+z');
  await expect(field).toHaveValue('Before Hi ‹name› / ‹company›! after');
  await expect(page.locator('#fillin-inline-hint')).toHaveCount(0);
});

test('keeps IME composition inside its field and navigates after the committed edit', async ({ page, context, extensionWorker }) => {
  await seed(extensionWorker); const field = await openInline(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
  await cdp.send('Input.insertText', { text: '日本🐴' });
  await expect(field).toHaveValue('Before Hi 日本🐴 / ‹company›! after');
  await field.press('Tab'); expect(await selected(field)).toBe('‹company›');
  await page.keyboard.type('Studio'); await field.press('Tab');
  await expect(field).toHaveValue('Before Hi 日本🐴 / Studio! after');
  await expect(page.locator('#fillin-inline-hint')).toHaveCount(0);
});

for (const exit of ['escape', 'outside-selection', 'blur', 'removed', 'host-value', 'blocked'] as const) {
  test(`keeps edits and releases Tab on ${exit}`, async ({ page, extensionWorker }) => {
    await seed(extensionWorker); const field = await openInline(page);
    await page.keyboard.type('Ada');
    if (exit === 'escape') await field.press('Escape');
    if (exit === 'outside-selection') await field.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(0, 0));
    if (exit === 'blur') await page.getByLabel('Text input', { exact: true }).click();
    if (exit === 'removed') await field.evaluate((node: HTMLTextAreaElement) => {
      const replacement = node.cloneNode(true) as HTMLTextAreaElement; replacement.value = 'Website replacement'; node.replaceWith(replacement); replacement.focus();
    });
    if (exit === 'host-value') await field.evaluate((node: HTMLTextAreaElement) => { node.value = 'Website changed'; });
    if (exit === 'blocked') await extensionWorker.evaluate(() => chrome.storage.local.set({ fillin_blacklist: ['127.0.0.1'] }));
    await expect(page.locator('#fillin-inline-hint')).toHaveCount(0);
    await expect(field).toHaveValue(exit === 'removed' ? 'Website replacement' : exit === 'host-value' ? 'Website changed' : 'Before Hi Ada / ‹company›! after');
    await field.focus(); await field.press('Tab'); await expect(field).not.toBeFocused();
  });
}

test('keeps two tab sessions independent', async ({ page, context, extensionWorker }) => {
  await seed(extensionWorker); const other = await context.newPage();
  const first = await openInline(page); await page.keyboard.type('First');
  const second = await openInline(other); await other.keyboard.type('Second');
  await second.press('Tab'); expect(await selected(second)).toBe('‹company›');
  await other.keyboard.type('Other'); await second.press('Tab');
  await page.bringToFront();
  await expect(first).toHaveValue('Before Hi First / ‹company›! after');
  await first.press('Tab'); expect(await selected(first)).toBe('‹company›');
  await page.keyboard.type('Main'); await first.press('Tab');
  await expect(first).toHaveValue('Before Hi First / Main! after');
  await expect(second).toHaveValue('Before Hi Second / Other! after');
});

test('uses the normal fill-in dialog on unsupported input types and rich editors', async ({ page, extensionWorker }) => {
  await seed(extensionWorker); await page.goto('/'); await waitForExtension(page);
  const field = page.getByLabel('Text input', { exact: true });
  await field.evaluate((node: HTMLInputElement) => { node.type = 'search'; });
  await field.fill('/go'); await field.press('Control+Space');
  const dialog = page.getByRole('dialog', { name: 'Fill in snippet' });
  await expect(dialog.getByRole('status')).toContainText('Inline editing is unavailable');
  await expect(field).toHaveValue('/go');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  const rich = page.getByRole('textbox', { name: 'Rich text editor' });
  await rich.pressSequentially('/go'); await rich.press('Control+Space');
  await expect(dialog.getByRole('status')).toContainText('Inline editing is unavailable');
  await expect(page.locator('#fillin-inline-hint')).toHaveCount(0);
});

test('starts inline mode from the palette and optional suggestions', async ({ page, extensionWorker }) => {
  await seed(extensionWorker);
  await extensionWorker.evaluate(() => chrome.storage.local.set({ fillin_suggestions_enabled: true }));
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByLabel('Text input', { exact: true });
  await field.fill('Before replace after');
  await field.evaluate((node: HTMLInputElement) => { node.focus(); node.setSelectionRange(7, 14); });
  await field.press('Control+Shift+K');
  const palette = page.locator('#fillin-command-palette-host');
  await palette.locator('input').fill('/go'); await palette.locator('input').press('Enter');
  await expect(page.locator('#fillin-inline-hint')).toHaveCount(1);
  expect(await selected(field)).toBe('‹name›');
  await page.keyboard.type('Palette'); await field.press('Escape');
  await expect(field).toHaveValue('Before Hi Palette / ‹company›! after');
  await field.fill('/go');
  const suggestions = page.getByRole('region', { name: 'Fillin shortcut suggestions' });
  await suggestions.getByRole('button', { name: 'Insert /go', exact: true }).click();
  await expect(suggestions).toHaveCount(0); await expect(page.locator('#fillin-inline-hint')).toHaveCount(1);
  expect(await selected(field)).toBe('‹name›');
  await page.keyboard.type('Suggested'); await field.press('Tab'); expect(await selected(field)).toBe('‹company›');
  await page.keyboard.type('Studio'); await field.press('Tab');
  await expect(field).toHaveValue('Hi Suggested / Studio!');
});

test('opts in explicitly in the popup and persists the setting', async ({ context, extensionWorker, extensionId }) => {
  await seed(extensionWorker);
  const popup = await openExtensionWindow(context, extensionWorker, extensionId);
  await popup.getByRole('button', { name: 'Create Snippet', exact: true }).click();
  await popup.getByLabel('Shortcut', { exact: true }).fill('inline');
  await popup.getByLabel('Expanded text').fill('Hi {{name}} from {{company}}.');
  await popup.getByRole('checkbox', { name: /Use template values/ }).check();
  const toggle = popup.getByRole('checkbox', { name: /Edit fields after insertion/ });
  await expect(toggle).not.toBeChecked(); await toggle.check();
  await expect(popup.getByText('Repeated fields are edited separately. Escape stops navigation and keeps your edits.', { exact: true })).toBeVisible();
  await popup.getByRole('button', { name: 'Save Snippet', exact: true }).click();
  await expect(popup.getByRole('button', { name: 'Create Snippet', exact: true })).toBeVisible();
  const data = await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_snippets'));
  expect(data.fillin_snippets.find((s: { trigger: string }) => s.trigger === '/inline')).toMatchObject({ templateVersion: 1, editAfterInsert: true });
});
