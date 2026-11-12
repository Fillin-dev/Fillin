import { test, expect, waitForExtension } from './fixtures';

const content = 'Hi {{name}}, thanks for contacting {{company}}. Order {{order_number}} for {{name}} is ready on {{date}}.';
test.beforeEach(async ({ extensionWorker }) => {
  await extensionWorker.evaluate(async (content) => {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    await chrome.storage.local.set({ fillin_snippets: [
      { id: 'email', trigger: '/email', content: 'test@example.com', createdAt: 1, updatedAt: 1 },
      { id: 'reply', trigger: '/reply', content, templateVersion: 1, dateFormat: 'iso', createdAt: 1, updatedAt: 1 },
    ] });
  }, content);
});

test('fills repeated fields once, previews literal values, and inserts into the original middle-of-field position', async ({ page, extensionWorker }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByLabel('Multiline input');
  await field.fill('Before /reply after');
  await field.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(13, 13));
  await field.press('Control+Space');
  const dialog = page.getByRole('dialog', { name: 'Fill in snippet' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveCount(3);
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
  await dialog.getByLabel('Name', { exact: true }).fill('Zoë {{date}} 🐴');
  await dialog.getByLabel('Company', { exact: true }).fill('<b>Local Studio</b>');
  await dialog.getByLabel('Order number', { exact: true }).fill('42');
  await expect(field).toHaveValue('Before /reply after');
  const preview = dialog.getByLabel('Completed message preview');
  await expect(preview).toContainText('<b>Local Studio</b>');
  await expect(preview.locator('b')).toHaveCount(0);
  const completed = await preview.innerText();
  await page.screenshot({ path: testInfo.outputPath('template-fields-mobile.png') });
  await dialog.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(field).toHaveValue(`Before ${completed} after`);
  await expect(field).toBeFocused();
  await field.pressSequentially('!');
  await expect(field).toHaveValue(`Before ${completed}! after`);
  await expect.poll(() => extensionWorker.evaluate(async () => (await chrome.storage.local.get('fillin_stats')).fillin_stats?.expansionCount)).toBe(1);
  const stored = await extensionWorker.evaluate(async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }));
  expect(stored.local.fillin_snippets.find((s: { id: string }) => s.id === 'reply').content).toBe(content);
  expect(JSON.stringify(stored)).not.toContain('Zoë');
  expect(JSON.stringify(stored)).not.toContain('Local Studio');
});

test('keeps required fields, keyboard focus, Escape and composition safe', async ({ page, extensionWorker }) => {
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByLabel('Text input', { exact: true });
  await field.fill('/reply'); await field.press('Control+Space');
  const dialog = page.getByRole('dialog', { name: 'Fill in snippet' });
  const name = dialog.getByLabel('Name', { exact: true });
  await expect(name).toBeFocused();
  await name.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Insert', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('alert')).toContainText('Complete each field');
  await expect(name).toBeFocused();
  await name.fill('Temporary');
  await name.dispatchEvent('compositionstart');
  await name.press('Enter');
  await expect(dialog).toBeVisible();
  await name.dispatchEvent('compositionend');
  await name.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(field).toHaveValue('/reply');
  await expect(field).toBeFocused();
  expect((await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_stats'))).fillin_stats?.expansionCount ?? 0).toBe(0);
});

test('opens the same field dialog through the palette and replaces only the original selection', async ({ page }) => {
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByLabel('Text input', { exact: true });
  await field.fill('Before replace after');
  await field.evaluate((node: HTMLInputElement) => { node.focus(); node.setSelectionRange(7, 14); });
  await field.press('Control+Shift+K');
  const palette = page.locator('#fillin-command-palette-host');
  await palette.locator('input').fill('/reply'); await palette.locator('input').press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Fill in snippet' });
  await expect(palette).toHaveCount(0);
  await dialog.getByLabel('Name', { exact: true }).fill('Ada');
  await dialog.getByLabel('Company', { exact: true }).fill('Fillin');
  await dialog.getByLabel('Order number', { exact: true }).fill('7');
  const completed = await dialog.getByLabel('Completed message preview').innerText();
  await dialog.getByLabel('Order number', { exact: true }).press('Enter');
  await expect(field).toHaveValue(`Before ${completed} after`);
});

test('refuses a stale palette target before opening a fill-in dialog', async ({ page }) => {
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByLabel('Text input', { exact: true });
  await field.fill('Before replace after');
  await field.evaluate((node: HTMLInputElement) => { node.focus(); node.setSelectionRange(7, 14); });
  await field.press('Control+Shift+K');
  const palette = page.locator('#fillin-command-palette-host');
  await palette.locator('input').fill('/reply');
  await field.evaluate((node: HTMLInputElement) => { node.value = 'Changed while searching'; });
  await palette.locator('input').press('Enter');
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Fill in snippet' })).toHaveCount(0);
  await expect(field).toHaveValue('Changed while searching');
});

test('opens templates from suggestions and preserves surrounding rich-text markup', async ({ page, extensionWorker }) => {
  await extensionWorker.evaluate(() => chrome.storage.local.set({ fillin_suggestions_enabled: true }));
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByRole('textbox', { name: 'Rich text editor' });
  await field.evaluate((node) => { node.innerHTML = 'Before <strong>/rep</strong> <em>after</em>'; });
  await field.evaluate((node) => {
    node.focus(); const range = document.createRange(); range.setStart(node.querySelector('strong')!.firstChild!, 4); range.collapse(true);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const panel = page.getByRole('region', { name: 'Fillin shortcut suggestions' });
  await panel.getByRole('button', { name: 'Insert /reply', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Fill in snippet' });
  await expect(panel).toHaveCount(0);
  await dialog.getByLabel('Name', { exact: true }).fill('<script>safe</script>');
  await dialog.getByLabel('Company', { exact: true }).fill('Studio');
  await dialog.getByLabel('Order number', { exact: true }).fill('3');
  const completed = await dialog.getByLabel('Completed message preview').innerText();
  await dialog.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(field.locator('strong')).toHaveText(completed);
  await expect(field.locator('em')).toHaveText('after');
  await expect(field.locator('script')).toHaveCount(0);
  await field.pressSequentially('!');
  await expect(field).toHaveText(`Before ${completed}! after`);
});

for (const change of ['source', 'removed', 'snippet', 'blocked'] as const) {
  test(`refuses an expansion after the ${change} changes during the dialog`, async ({ page, extensionWorker }) => {
    await page.goto('/'); await waitForExtension(page);
    const field = page.getByLabel('Text input', { exact: true });
    await field.fill('/reply'); await field.press('Control+Space');
    const dialog = page.getByRole('dialog', { name: 'Fill in snippet' });
    await dialog.getByLabel('Name', { exact: true }).fill('Ada');
    await dialog.getByLabel('Company', { exact: true }).fill('Studio');
    await dialog.getByLabel('Order number', { exact: true }).fill('3');
    if (change === 'source') await field.evaluate((node: HTMLInputElement) => { node.value = 'Changed by website'; });
    if (change === 'removed') await field.evaluate((node) => node.remove());
    if (change === 'snippet') await extensionWorker.evaluate(async () => {
      const data = await chrome.storage.local.get('fillin_snippets'); data.fillin_snippets[1].content = 'Updated {{name}}';
      await chrome.storage.local.set(data);
    });
    if (change === 'blocked') await extensionWorker.evaluate(() => chrome.storage.local.set({ fillin_blacklist: ['127.0.0.1'] }));
    if (change === 'source' || change === 'removed') {
      await dialog.getByRole('button', { name: 'Insert', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('changed');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
    }
    await expect(dialog).toHaveCount(0);
    if (change !== 'removed') await expect(field).toHaveValue(change === 'source' ? 'Changed by website' : '/reply');
    expect((await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_stats'))).fillin_stats?.expansionCount ?? 0).toBe(0);
  });
}

test('creates a fill-in template in the installed popup and excludes password fields', async ({ popup, page, extensionWorker }) => {
  await popup.getByRole('button', { name: 'Create Snippet', exact: true }).click();
  await popup.getByLabel('Shortcut', { exact: true }).fill('intro');
  await popup.getByLabel('Expanded text').fill('Hi {{name}}, welcome to {{company}}.');
  await popup.getByRole('checkbox', { name: /Use template values/ }).check();
  await expect(popup.getByText('Hi ‹name›, welcome to ‹company›.', { exact: true })).toBeVisible();
  await popup.getByRole('button', { name: 'Save Snippet', exact: true }).click();
  await expect(popup.getByRole('button', { name: 'Create Snippet', exact: true })).toBeVisible();
  const saved = (await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_snippets'))).fillin_snippets.find((s: { trigger: string }) => s.trigger === '/intro');
  expect(saved).toMatchObject({ content: 'Hi {{name}}, welcome to {{company}}.', templateVersion: 1 });
  await page.goto('/'); await waitForExtension(page);
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('/intro'); await password.press('Control+Space');
  await expect(page.getByRole('dialog', { name: 'Fill in snippet' })).toHaveCount(0);
  await expect(password).toHaveValue('/intro');
});
