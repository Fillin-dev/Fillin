import { test, expect } from './fixtures';

test.beforeEach(async ({ extensionWorker }) => {
  await extensionWorker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      fillin_first_use: 'done',
      fillin_snippets: [
        {
          id: 'email',
          trigger: '/email',
          content: 'hello@example.com',
          tags: ['personal'],
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'meeting',
          trigger: '/meeting',
          content: 'Thanks for reaching out. Let’s find a time to talk this week.',
          tags: ['work', 'email'],
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'signature',
          trigger: '/sig',
          content: 'Best wishes,\nAlex',
          tags: ['work'],
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'rich',
          trigger: '/rich',
          content:
            '<strong>Readable rich text</strong><script>window.previewExecuted=true</script>',
          isHtml: true,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'long',
          trigger: '/a_very_long_shortcut_that_should_still_fit_inside_the_popup',
          content: 'Long contents still stay inside the card. '.repeat(15),
          tags: ['a-very-long-tag-that-stays-inside-the-card'],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
  });
});

test('keeps library actions visible, filters predictably, and shows safe readable previews', async ({
  popup,
}, testInfo) => {
  await popup.setViewportSize({ width: 400, height: 600 });
  const first = popup.locator('.snippet-card').first();
  await expect(first.getByRole('button', { name: 'Edit snippet', exact: true })).toBeVisible();
  await expect(first.getByRole('button', { name: 'Delete snippet', exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Export snippets to JSON' })).toBeInViewport();
  await popup.locator('body').screenshot({ path: testInfo.outputPath('library.png') });
  await popup.getByRole('button', { name: '#work', exact: true }).click();
  await expect(popup.locator('.snippet-card')).toHaveCount(2);
  await popup.getByRole('searchbox', { name: 'Search snippets' }).fill('no matching phrase');
  await expect(popup.getByText('No results', { exact: true })).toBeVisible();
  await popup.getByRole('button', { name: 'Clear filters' }).click();
  await expect(popup.locator('.snippet-card')).toHaveCount(5);
  await popup.getByRole('searchbox', { name: 'Search snippets' }).fill('/rich');
  await expect(popup.locator('.snippet-preview')).toHaveText('Readable rich text');
  expect(await popup.evaluate(() => 'previewExecuted' in window)).toBe(false);
  await popup.getByRole('button', { name: 'Clear search' }).click();
  expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(popup.getByRole('button', { name: 'Create Snippet', exact: true })).toBeInViewport();
});

test('keeps saving visible and makes cancel and delete work safely from the keyboard', async ({
  popup,
}, testInfo) => {
  await popup.setViewportSize({ width: 400, height: 600 });
  await popup.getByRole('button', { name: 'Edit snippet', exact: true }).first().click();
  await popup.getByLabel('Shortcut', { exact: true }).fill('invalid shortcut');
  await expect(popup.getByRole('button', { name: 'Update Snippet', exact: true })).toBeDisabled();
  await popup.getByLabel('Shortcut', { exact: true }).fill('welcome');
  await popup.getByLabel('Expanded text', { exact: true }).fill('Hello and welcome! '.repeat(15));
  await popup.getByLabel('Tags Optional').fill('greeting');
  await popup.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(popup.getByRole('button', { name: 'Update Snippet', exact: true })).toBeInViewport();
  await popup.locator('body').screenshot({ path: testInfo.outputPath('editor.png') });
  await popup.getByRole('button', { name: 'Update Snippet', exact: true }).click();
  await expect(popup.getByRole('button', { name: 'Create Snippet', exact: true })).toBeVisible();
  const firstDelete = popup.getByRole('button', { name: 'Delete snippet', exact: true }).first();
  await firstDelete.click();
  let dialog = popup.getByRole('dialog', { name: 'Delete snippet?' });
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await popup.locator('body').screenshot({ path: testInfo.outputPath('delete.png') });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(popup.getByText('/welcome', { exact: true })).toBeVisible();
  await firstDelete.click();
  dialog = popup.getByRole('dialog', { name: 'Delete snippet?' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).press('Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await popup.keyboard.press('Escape');
  await expect(firstDelete).toBeFocused();
  await firstDelete.click();
  await popup.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(popup.getByText('/welcome', { exact: true })).toHaveCount(0);
});

test('retains failed site input, saves valid domains, and restores focus when settings close', async ({
  popup,
}, testInfo) => {
  await popup.setViewportSize({ width: 400, height: 600 });
  const settings = popup.getByRole('button', { name: 'Manage site blacklist and pause settings' });
  await settings.click();
  const dialog = popup.getByRole('dialog', { name: 'Site settings' });
  const input = dialog.getByLabel('Block a website');
  await input.fill('not a domain');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(input).toHaveValue('not a domain');
  await input.fill('example.com');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByText('example.com', { exact: true })).toBeVisible();
  await expect(input).toHaveValue('');
  await popup.locator('body').screenshot({ path: testInfo.outputPath('sites.png') });
  await dialog.getByRole('button', { name: 'Unblock example.com' }).click();
  await expect(dialog.getByText('example.com', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
  await popup.keyboard.press('Escape');
  await expect(settings).toBeFocused();
});
