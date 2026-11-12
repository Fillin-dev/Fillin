import { test, expect, waitForExtension, openExtensionWindow } from './fixtures';

test.beforeEach(async ({ extensionWorker }) => {
  await extensionWorker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      fillin_snippets: [
        { id: 'email', trigger: '/email', content: 'test@example.com', createdAt: 1, updatedAt: 1 },
        {
          id: 'meeting',
          trigger: '/meeting',
          content: 'Let’s schedule a call.',
          createdAt: 1,
          updatedAt: 1,
        },
        { id: 'meetup', trigger: '/meetup', content: 'Meet at 3 PM.', createdAt: 1, updatedAt: 1 },
      ],
    });
  });
});

test('defaults off, enables from the popup, persists, and synchronizes a second extension window', async ({
  page,
  popup,
  extensionWorker,
  extensionId,
  context,
}) => {
  await page.goto('/');
  await waitForExtension(page);
  const input = page.getByLabel('Text input', { exact: true });
  await input.pressSequentially('/mee');
  const panel = page.getByRole('region', { name: 'Fillin shortcut suggestions' });
  await expect(panel).toHaveCount(0);
  const toggle = popup.getByRole('checkbox', { name: 'Suggest shortcuts while typing' });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await input.pressSequentially('t');
  await expect(panel).toBeVisible();
  await popup.reload();
  await expect(toggle).toBeChecked();
  const other = await openExtensionWindow(context, extensionWorker, extensionId);
  await other.getByRole('checkbox', { name: 'Suggest shortcuts while typing' }).uncheck();
  await expect(toggle).not.toBeChecked();
  await expect(panel).toHaveCount(0);
  await expect(input).toHaveValue('/meet');
});

test('preserves ordinary Enter and Tab, dismisses Escape, and only inserts an explicitly selected row', async ({
  page,
  extensionWorker,
}) => {
  await extensionWorker.evaluate(() =>
    chrome.storage.local.set({ fillin_suggestions_enabled: true })
  );
  await page.goto('/');
  await waitForExtension(page);
  const input = page.getByLabel('Multiline input');
  const panel = page.getByRole('region', { name: 'Fillin shortcut suggestions' });
  await input.pressSequentially('/mee');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Let’s schedule a call.', { exact: true })).toBeVisible();
  await input.press('Enter');
  await expect(input).toHaveValue('/mee\n');
  await input.fill('/mee');
  await expect(panel).toBeVisible();
  await input.press('Escape');
  await expect(panel).toHaveCount(0);
  await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
  await expect(panel).toHaveCount(0);
  await input.pressSequentially('t');
  await expect(panel).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(input).toHaveValue('Let’s schedule a call.');
  await input.fill('Before /mee after');
  await input.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(11, 11));
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Insert /meeting', exact: true }).click();
  await expect(input).toHaveValue('Before Let’s schedule a call. after');
  await input.fill('/mee');
  await expect(panel).toBeVisible();
  await input.press('Tab');
  await expect(panel).toHaveCount(0);
  await expect(input).not.toBeFocused();
});

test('excludes protected targets and URLs, handles composition, and closes on site blocking', async ({
  page,
  extensionWorker,
}) => {
  await extensionWorker.evaluate(() =>
    chrome.storage.local.set({ fillin_suggestions_enabled: true })
  );
  await page.goto('/');
  await waitForExtension(page);
  const panel = page.getByRole('region', { name: 'Fillin shortcut suggestions' });
  await page.getByLabel('Password', { exact: true }).fill('/mee');
  await expect(panel).toHaveCount(0);
  const input = page.getByLabel('Text input', { exact: true });
  await input.fill('https://example.com/mee');
  await expect(panel).toHaveCount(0);
  await input.fill('/mee');
  await expect(panel).toBeVisible();
  await input.dispatchEvent('compositionstart');
  await expect(panel).toHaveCount(0);
  await input.fill('/meet');
  await expect(panel).toHaveCount(0);
  await input.dispatchEvent('compositionend');
  await expect(panel).toBeVisible();
  await input.evaluate((node: HTMLInputElement) => (node.readOnly = true));
  await expect(panel).toHaveCount(0);
  await input.evaluate((node: HTMLInputElement) => (node.readOnly = false));
  await input.fill('/mee');
  await expect(panel).toBeVisible();
  await extensionWorker.evaluate(() =>
    chrome.storage.local.set({ fillin_blacklist: ['127.0.0.1'] })
  );
  await expect(panel).toHaveCount(0);
  await input.fill('/meeting');
  await expect(panel).toHaveCount(0);
  await input.press('Control+Space');
  await expect(input).toHaveValue('/meeting');
});

test('anchors to contenteditable and clamps a wrapped textarea suggestion to the viewport', async ({
  page,
  extensionWorker,
}, testInfo) => {
  await extensionWorker.evaluate(() =>
    chrome.storage.local.set({ fillin_suggestions_enabled: true })
  );
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/');
  await waitForExtension(page);
  const panel = page.getByRole('region', { name: 'Fillin shortcut suggestions' });
  const editor = page.getByLabel('Rich text editor');
  await editor.pressSequentially('/mee');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Insert /meeting', exact: true }).click();
  await expect(editor).toHaveText('Let’s schedule a call.');
  const input = page.getByLabel('Multiline input');
  await input.evaluate(
    (node: HTMLElement) =>
      (node.style.cssText =
        'position:fixed;right:8px;bottom:8px;width:180px;height:110px;font:16px/24px sans-serif;padding:10px')
  );
  await input.fill('A long line that wraps across the textarea\n/mee');
  await expect(panel).toBeVisible();
  await expect
    .poll(async () => {
      const bounds = (await panel.boundingBox())!;
      return (
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= 390 &&
        bounds.y + bounds.height <= 700
      );
    })
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('suggestions-mobile.png') });
});

test('supports inputs in Shadow DOM and independently injected frames', async ({
  page,
  extensionWorker,
}) => {
  await extensionWorker.evaluate(() =>
    chrome.storage.local.set({ fillin_suggestions_enabled: true })
  );
  await page.goto('/');
  await waitForExtension(page);
  await page.evaluate(() => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Shadow input');
    root.append(input);
  });
  const input = page.getByLabel('Shadow input');
  await input.pressSequentially('/mee');
  await page.getByRole('button', { name: 'Insert /meeting', exact: true }).click();
  await expect(input).toHaveValue('Let’s schedule a call.');
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.src = '/frame';
    document.body.append(frame);
  });
  const frame = page.frameLocator('iframe');
  const inside = frame.getByLabel('Text input', { exact: true });
  await expect(async () => {
    await inside.fill('');
    await inside.pressSequentially('/mee');
    await expect(frame.getByRole('button', { name: 'Insert /meeting', exact: true })).toBeVisible({
      timeout: 500,
    });
  }).toPass();
  await frame.getByRole('button', { name: 'Insert /meeting', exact: true }).click();
  await expect(inside).toHaveValue('Let’s schedule a call.');
});
