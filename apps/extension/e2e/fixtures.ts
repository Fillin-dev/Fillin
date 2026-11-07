import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import path from 'node:path';

export const test = base.extend<{
  extensionId: string;
  extensionWorker: Worker;
  popup: Page;
}>({
  context: async ({ headless, baseURL }, use, testInfo) => {
    const extension = path.resolve(__dirname, '../dist');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless,
      baseURL,
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      await use(context);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        const trace = testInfo.outputPath('trace.zip');
        await context.tracing.stop({ path: trace });
        await testInfo.attach('trace', {
          path: trace,
          contentType: 'application/zip',
        });
        for (const [index, page] of context.pages().entries()) {
          if (!page.isClosed()) {
            await testInfo.attach(`page-${index}`, {
              body: await page.screenshot(),
              contentType: 'image/png',
            });
          }
        }
      } else {
        await context.tracing.stop();
      }
      await context.close();
    }
  },
  extensionWorker: async ({ context }, use) => {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
  extensionId: async ({ extensionWorker }, use) => {
    await use(new URL(extensionWorker.url()).host);
  },
  popup: async ({ context, extensionWorker, extensionId }, use) => {
    await use(await openExtensionWindow(context, extensionWorker, extensionId));
  },
});

export async function openExtensionWindow(
  context: BrowserContext,
  worker: Worker,
  id: string,
  readyButton = 'Create Snippet'
): Promise<Page> {
  const url = `chrome-extension://${id}/src/popup/index.html`;
  const opened = context.waitForEvent('page');
  await worker.evaluate(
    (url) =>
      chrome.windows.create({
        url,
        type: 'popup',
        width: 460,
        height: 750,
        focused: false,
      }),
    url
  );
  const page = await opened;
  await page.waitForURL(url);
  await expect(
    page.getByRole('button', { name: readyButton, exact: true })
  ).toBeVisible();
  return page;
}

export async function createSnippet(
  popup: Page,
  trigger: string,
  content: string
) {
  await popup.getByRole('button', { name: 'Create Snippet' }).click();
  await popup.getByPlaceholder('email, name, sig...').fill(trigger);
  await popup
    .getByPlaceholder('The text that will be inserted...')
    .fill(content);
  await popup
    .getByRole('button', { name: 'Save Snippet', exact: true })
    .click();
  await expect(popup.getByRole('button', { name: 'Create Snippet' })).toBeVisible();
  await expect(popup.getByText(`/${trigger}`, { exact: true })).toBeVisible();
}

export async function waitForExtension(page: Page) {
  // Exercise the real keyboard listener and wait for stored snippets to load.
  // Reopening the palette refreshes its results if the initial read was pending.
  await expect(async () => {
    const palette = page.locator('#fillin-command-palette-host');
    if (await palette.count()) await palette.locator('input').press('Escape');
    await page.keyboard.press('Control+Shift+K');
    await expect(
      page
        .locator('#fillin-command-palette-host')
        .getByText('/email', { exact: true })
    ).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await page.locator('#fillin-command-palette-host input').press('Escape');
  await expect(page.locator('#fillin-command-palette-host')).toHaveCount(0);
}

export { expect };
