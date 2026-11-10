import { test, expect, chromium, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

// Toolbar popups are auto-sized by Chrome and aren't exposed as Playwright pages.
// Inspect their CDP target directly, without forcing a viewport or creating a window.
async function withNativePopup(
  headless: boolean,
  snippets: boolean,
  inspect: (popup: {
    evaluate: <T>(expression: string) => Promise<T>;
    screenshot: (name: string) => Promise<void>;
  }) => Promise<void>,
  testInfo: TestInfo
) {
  const extension = path.resolve(__dirname, '../dist');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless,
    viewport: null,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await worker.evaluate(async (seedLibrary) => {
      await chrome.storage.local.clear();
      if (seedLibrary) {
        await chrome.storage.local.set({
          fillin_first_use: 'done',
          fillin_snippets: [
            { id: 'hello', trigger: '/hello', content: 'Hello world', createdAt: 1, updatedAt: 1 },
          ],
        });
      }
    }, snippets);
    const url = new URL('src/popup/index.html', worker.url()).href;
    const client = await context.newCDPSession(context.pages()[0]);
    await worker.evaluate(() => chrome.action.openPopup());
    let targetId: string | undefined;
    await expect
      .poll(async () => {
        const { targetInfos } = await client.send('Target.getTargets');
        targetId = targetInfos.find((target) => target.url === url)?.targetId;
        return !!targetId;
      })
      .toBe(true);
    const { sessionId } = await client.send('Target.attachToTarget', { targetId: targetId! });
    let sequence = 0;
    const pending = new Map<
      number,
      {
        resolve: (result: unknown) => void;
        reject: (reason: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >();
    client.on('Target.receivedMessageFromTarget', (event) => {
      if (event.sessionId !== sessionId) return;
      const response = JSON.parse(event.message);
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      clearTimeout(request.timer);
      if (response.error) request.reject(new Error(response.error.message));
      else request.resolve(response.result);
    });
    const send = <T>(method: string, params: Record<string, unknown> = {}) =>
      new Promise<T>((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Toolbar popup command timed out: ${method}`));
        }, 5000);
        pending.set(id, { resolve: (result) => resolve(result as T), reject, timer });
        void client
          .send('Target.sendMessageToTarget', {
            sessionId,
            message: JSON.stringify({ id, method, params }),
          })
          .catch((error) => {
            clearTimeout(timer);
            pending.delete(id);
            reject(error);
          });
      });
    await inspect({
      evaluate: async <T>(expression: string) => {
        const result = await send<{ result: { value: T }; exceptionDetails?: { text: string } }>(
          'Runtime.evaluate',
          { expression, returnByValue: true, awaitPromise: true }
        );
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
        return result.result.value;
      },
      screenshot: async (name: string) => {
        const result = await send<{ data: string }>('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
        });
        const filename = testInfo.outputPath(name + '.png');
        await writeFile(filename, Buffer.from(result.data, 'base64'));
        await testInfo.attach(name, { path: filename, contentType: 'image/png' });
      },
    });
  } finally {
    await context.close();
  }
}

for (const library of [false, true]) {
  test(`toolbar popup keeps its intrinsic size with ${library ? 'saved snippets' : 'first-use guidance'}`, async ({
    headless,
  }, testInfo) => {
    await withNativePopup(
      headless,
      library,
      async (popup) => {
        await expect
          .poll(() =>
            popup.evaluate(
              `({ width: innerWidth, height: innerHeight, bodyWidth: document.body.getBoundingClientRect().width, bodyHeight: document.body.getBoundingClientRect().height })`
            )
          )
          .toMatchObject({ width: 400, bodyWidth: 400 });
        const size = await popup.evaluate<{ height: number; bodyHeight: number }>(
          `({ height: innerHeight, bodyHeight: document.body.getBoundingClientRect().height })`
        );
        expect(size.height).toBeGreaterThanOrEqual(320);
        expect(size.height).toBeLessThanOrEqual(600);
        expect(size.bodyHeight).toBe(size.height);
        await expect
          .poll(() =>
            popup.evaluate(
              library
                ? `!!document.querySelector('.library-footer .popup-primary')`
                : `!!document.querySelector('#first-trigger')`
            )
          )
          .toBe(true);
        await popup.screenshot(library ? 'toolbar-library' : 'toolbar-guide');
        if (library) {
          await popup.evaluate(`document.querySelector('.library-footer .popup-primary').click()`);
          await expect
            .poll(() =>
              popup.evaluate(
                `({ width: innerWidth, height: innerHeight, saveVisible: !!document.querySelector('.editor-footer button') && document.querySelector('.editor-footer button').getBoundingClientRect().bottom <= innerHeight })`
              )
            )
            .toMatchObject({ width: 400, saveVisible: true });
          await popup.screenshot('toolbar-editor');
        }
      },
      testInfo
    );
  });
}
