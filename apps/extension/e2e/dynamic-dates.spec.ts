import { test, expect, waitForExtension } from './fixtures';

test.beforeEach(async ({ extensionWorker }) => {
  await extensionWorker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      fillin_snippets: [
        { id: 'email', trigger: '/email', content: 'test@example.com', createdAt: 1, updatedAt: 1 },
        {
          id: 'today',
          trigger: '/today',
          content: '{{date}}',
          templateVersion: 1,
          dateFormat: 'iso',
          createdAt: 1,
          updatedAt: 1,
        },
        { id: 'literal', trigger: '/literal', content: '{{date}}', createdAt: 1, updatedAt: 1 },
      ],
    });
  });
});

test('resolves current dates through the installed shortcut and palette while preserving literal snippets', async ({
  page,
  extensionWorker,
}) => {
  await page.goto('/');
  await waitForExtension(page);
  const expected = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const input = page.getByLabel('Text input', { exact: true });
  await input.fill('Before /today after');
  await input.evaluate((node: HTMLInputElement) => node.setSelectionRange(13, 13));
  await input.press('Control+Space');
  await expect(input).toHaveValue(`Before ${expected} after`);
  await input.fill('');
  await input.press('Control+Shift+K');
  const search = page.locator('#fillin-command-palette-host input');
  await search.fill('/today');
  await search.press('Enter');
  await expect(input).toHaveValue(expected);
  await input.fill('/literal');
  await input.press('Control+Space');
  await expect(input).toHaveValue('{{date}}');
  const saved = await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_snippets'));
  expect(
    saved.fillin_snippets.find((snippet: { id: string }) => snippet.id === 'today').content
  ).toBe('{{date}}');
});

test('creates a dynamic snippet in the real popup', async ({
  popup,
  extensionWorker,
}, testInfo) => {
  await popup.getByRole('button', { name: 'Create Snippet', exact: true }).click();
  await popup.getByPlaceholder('email, name, sig...').fill('timestamp');
  await popup.getByPlaceholder('The text that will be inserted...').fill('Sent on {{date}}');
  await popup.getByRole('checkbox', { name: /Use template values/ }).check();
  await popup.getByLabel('Date format').selectOption('iso');
  await expect(popup.getByText('Preview now', { exact: true })).toBeVisible();
  await popup.getByText('Preview now', { exact: true }).scrollIntoViewIfNeeded();
  await popup.locator('.popup-editor').screenshot({ path: testInfo.outputPath('date-template-editor.png') });
  await popup.getByRole('button', { name: 'Save Snippet', exact: true }).click();
  await expect(popup.getByRole('button', { name: 'Create Snippet', exact: true })).toBeVisible();
  const saved = await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_snippets'));
  expect(
    saved.fillin_snippets.find((snippet: { trigger: string }) => snippet.trigger === '/timestamp')
  ).toMatchObject({ templateVersion: 1, dateFormat: 'iso', content: 'Sent on {{date}}' });
});
