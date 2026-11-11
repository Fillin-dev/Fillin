import { test, expect, type Locator } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await context.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await context.route('https://d8j0ntlcm91z4.cloudfront.net/**', (route) => route.abort());
});

async function pixelCounts(canvas: Locator) {
  return canvas.evaluate((element) => {
    const image = element as HTMLCanvasElement;
    const pixels = image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data;
    let visible = 0;
    let blue = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 180) continue;
      visible++;
      if (pixels[i] === 36 && pixels[i + 1] === 87 && pixels[i + 2] === 245) blue++;
    }
    return { visible, blue };
  });
}

test.describe('Interactive footer', () => {
  test.use({ reducedMotion: 'no-preference' });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`renders the horse and responds to the cursor in ${colorScheme} mode`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      const art = page.getByTestId('footer-halftone');
      const video = art.locator('video');
      const canvas = art.locator('canvas');
      // The video should not load while someone is reading the top of the page.
      await expect(video).not.toHaveAttribute('src');
      await art.scrollIntoViewIfNeeded();
      await expect.poll(async () => (await pixelCounts(canvas)).visible).toBeGreaterThan(100);
      await expect
        .poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused))
        .toBe(false);
      const bounds = (await canvas.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width * 0.57, bounds.y + bounds.height * 0.55);
      await expect.poll(async () => (await pixelCounts(canvas)).blue).toBeGreaterThan(20);
      await page.mouse.move(0, 0);
      await expect.poll(async () => (await pixelCounts(canvas)).blue).toBe(0);
      const layout = await art.evaluate((node) => {
        const stage = node.querySelector('.halftone-stage')!.getBoundingClientRect();
        const controls = node.querySelector('.halftone-caption')!.getBoundingClientRect();
        return {
          stageBottom: stage.bottom,
          pageBottom: document.documentElement.scrollHeight - scrollY,
          controlsBottom: controls.bottom,
          stageTop: stage.top,
        };
      });
      expect(Math.abs(layout.stageBottom - layout.pageBottom)).toBeLessThanOrEqual(1);
      expect(layout.controlsBottom).toBeLessThanOrEqual(layout.stageTop);
      await expect(page.locator('.footer-wordmark')).toHaveCount(0);
      await page.locator('footer').screenshot({ path: testInfo.outputPath('footer.png') });

      await page.getByRole('button', { name: 'Pause horse animation' }).click();
      await expect
        .poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused))
        .toBe(true);
      const stopped = await video.evaluate(async (node) => {
        const film = node as HTMLVideoElement;
        const before = film.currentTime;
        for (let i = 0; i < 10; i++) await new Promise(requestAnimationFrame);
        return { before, after: film.currentTime };
      });
      expect(stopped.after).toBe(stopped.before);
      await page.getByRole('button', { name: 'Resume horse animation' }).click();
      await expect
        .poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused))
        .toBe(false);
      await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
      await expect
        .poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused))
        .toBe(true);
      await art.scrollIntoViewIfNeeded();
      await expect
        .poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused))
        .toBe(false);
      expect(errors).toEqual([]);
    });
  }
});

test('shows a still horse with reduced motion and adapts when that preference changes', async ({
  page,
}) => {
  await page.goto('/');
  const art = page.getByTestId('footer-halftone');
  await art.scrollIntoViewIfNeeded();
  const video = art.locator('video');
  await expect
    .poll(async () => (await pixelCounts(art.locator('canvas'))).visible)
    .toBeGreaterThan(100);
  await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true);
  await expect(page.getByRole('button', { name: 'Pause horse animation' })).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true);
});

test('keeps the footer within a small screen and leaves its links accessible if the video fails', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route('**/media/halftone-horse.webm', (route) => route.abort());
  await page.goto('/');
  await page.getByTestId('footer-halftone').scrollIntoViewIfNeeded();
  await expect(
    page.locator('footer').getByRole('link', { name: /Find us on GitHub/ })
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bottomGap = await page
    .locator('.halftone-stage')
    .evaluate(
      (node) =>
        document.documentElement.scrollHeight - scrollY - node.getBoundingClientRect().bottom
    );
  expect(Math.abs(bottomGap)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Pause horse animation' })).toHaveCount(0);
});
