import { test, expect, type Locator } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';
// Exercise real browser playback without downloading the external 14 MB film in CI.
const film = {
  path: fileURLToPath(new URL('../public/media/halftone-horse.webm', import.meta.url)),
  contentType: 'video/webm',
};

async function expectPlaying(video: Locator) {
  await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(false);
}

test.beforeEach(async ({ context }) => {
  await context.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await context.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await context.route('https://api.github.com/**', (route) =>
    route.fulfill({ json: { stargazers_count: 42 } })
  );
  await context.route('https://api.dicebear.com/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>',
    })
  );
});

test('keeps a useful poster and downloads while video is loading or unavailable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(source, async (route) => {
    await pending;
    await route.abort();
  });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const poster = page.locator('.cinematic-poster');
    await expect
      .poll(() => poster.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBe(1600);
    const download = page.locator('.glass-download-hero');
    await expect(download).toBeVisible();
    await expect(download).toHaveAttribute('download', /fillin-extension-.*\.zip/);
    await expect(download).toHaveAttribute('href', /fillin-extension\.zip\?v=/);
    release();
    await expect(page.getByRole('button', { name: /background video/ })).toHaveCount(0);
    await expect(page.locator('.cinematic-video')).toHaveCSS('opacity', '0');
    await expect(poster).toBeVisible();
  } finally {
    release();
  }
});

test('honors reduced motion without requesting a video and responds to preference changes', async ({
  page,
}) => {
  let requests = 0;
  await page.route(source, (route) => {
    requests++;
    return route.fulfill(film);
  });
  await page.goto('/');
  const video = page.locator('.cinematic-video');
  await expect(video).not.toHaveAttribute('src');
  await expect(page.getByRole('button', { name: /background video/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('animation-name', 'none');
  expect(requests).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expectPlaying(video);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(video).not.toHaveAttribute('src');
  await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true);
});

test('does not load the background video when data saving is enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    })
  );
  await page.goto('/');
  await expect(page.locator('.cinematic-video')).not.toHaveAttribute('src');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /background video/ })).toHaveCount(0);
});

test('changes the hero atmosphere without reloading or restarting the video', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
  await page.route(source, (route) => route.fulfill(film));
  await page.goto('/');
  const media = page.locator('.cinematic-media');
  const video = page.locator('.cinematic-video');
  const download = page.locator('.glass-download-hero');
  await expectPlaying(video);
  await expect(media).toHaveCSS('filter', 'brightness(1) contrast(1) saturate(1)');
  await video.evaluate((node) => {
    node.dataset.themeContinuity = 'original';
    node.dataset.reloads = '0';
    node.addEventListener('loadstart', () => {
      node.dataset.reloads = String(Number(node.dataset.reloads) + 1);
    });
  });
  await page.getByRole('radio', { name: 'Dark', exact: true }).locator('..').click();
  await expect(media).toHaveCSS('filter', 'brightness(0.64) contrast(1.08) saturate(0.88)');
  await expect(download).toHaveCSS('background-color', 'rgb(245, 202, 69)');
  await expect(download).toHaveCSS('color', 'rgb(23, 33, 51)');
  const time = await video.evaluate((node) => (node as HTMLVideoElement).currentTime);
  await expect
    .poll(async () =>
      Math.abs((await video.evaluate((node) => (node as HTMLVideoElement).currentTime)) - time)
    )
    .toBeGreaterThan(0.05);
  await page.getByRole('radio', { name: 'Light', exact: true }).locator('..').click();
  await expect(media).toHaveCSS('filter', 'brightness(1) contrast(1) saturate(1)');
  await page.getByRole('radio', { name: 'System', exact: true }).locator('..').click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(media).toHaveCSS('filter', 'brightness(0.64) contrast(1.08) saturate(0.88)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(media).toHaveCSS('filter', 'brightness(1) contrast(1) saturate(1)');
  await expectPlaying(video);
  await expect(video).toHaveAttribute('data-theme-continuity', 'original');
  await expect(video).toHaveAttribute('data-reloads', '0');
  await expect(video).toHaveCount(1);
});

test('themes the poster on mobile with an instant reduced-motion change', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('fillin-theme', 'dark'));
  await page.goto('/');
  const media = page.locator('.cinematic-media');
  await expect(media).toHaveCSS('filter', 'brightness(0.64) contrast(1.08) saturate(0.88)');
  await expect(media).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('.cinematic-poster')).toBeVisible();
  await expect(page.locator('.cinematic-video')).not.toHaveAttribute('src');
  await page.screenshot({ path: testInfo.outputPath('hero-midnight.png') });
  await page.getByRole('button', { name: 'Choose color theme' }).click();
  await page.getByRole('radio', { name: 'Light', exact: true }).locator('..').click();
  await expect(media).toHaveCSS('filter', 'brightness(1) contrast(1) saturate(1)');
  await expect(page.locator('.glass-download-hero')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('.cinematic-video')).not.toHaveAttribute('src');
  await page.screenshot({ path: testInfo.outputPath('hero-twilight.png') });
});

test('loops the hero automatically and suspends it independently from the horse footer', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route(source, (route) => route.fulfill(film));
  await page.goto('/');
  const video = page.locator('.cinematic-video');
  await expectPlaying(video);
  await expect(page.getByRole('button', { name: /background video/ })).toHaveCount(0);
  const start = await video.evaluate((node) => (node as HTMLVideoElement).currentTime);
  await expect
    .poll(async () =>
      Math.abs((await video.evaluate((node) => (node as HTMLVideoElement).currentTime)) - start)
    )
    .toBeGreaterThan(0.05);
  await expect
    .poll(() => video.evaluate((node) => Number.isFinite((node as HTMLVideoElement).duration)))
    .toBe(true);
  await video.evaluate((node) => {
    const film = node as HTMLVideoElement;
    film.currentTime = film.duration - 0.1;
  });
  await expect
    .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
    .toBeLessThan(1);
  await expectPlaying(video);
  const horse = page.getByTestId('footer-halftone');
  await horse.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true);
  await expect
    .poll(() => horse.locator('video').evaluate((node) => (node as HTMLVideoElement).paused))
    .toBe(false);
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  await expectPlaying(video);
});

test('retries blocked autoplay on the next visitor interaction without showing controls', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route(source, (route) => route.fulfill(film));
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    let deny = true;
    HTMLMediaElement.prototype.play = function () {
      if (this.classList.contains('cinematic-video') && deny) {
        deny = false;
        this.autoplay = false;
        this.pause();
        return Promise.reject(new DOMException('Autoplay denied', 'NotAllowedError'));
      }
      return play.call(this);
    };
  });
  await page.goto('/');
  const video = page.locator('.cinematic-video');
  await expect(video).toHaveAttribute('src', source);
  await expect.poll(() => video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true);
  await expect(page.getByRole('button', { name: /background video/ })).toHaveCount(0);
  await page.getByRole('heading', { level: 1 }).click();
  await expectPlaying(video);
});

test('supports a compact keyboard-accessible theme chooser and working navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('/');
  const chooser = page.getByRole('button', { name: 'Choose color theme' });
  await chooser.click();
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeFocused();
  await page.getByRole('radio', { name: 'Dark', exact: true }).locator('..').click();
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(chooser).toHaveAttribute('aria-expanded', 'false');
  await expect(chooser).toBeFocused();
  await chooser.press('Enter');
  await page.keyboard.press('Escape');
  await expect(chooser).toBeFocused();
  await expect(chooser).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Try it first' }).click();
  await expect(page.getByRole('textbox', { name: 'Try shortcut expansion' })).toBeInViewport();
});

test('downloads the verified release from the glass action and opens installation instructions', async ({
  page,
}) => {
  const release = JSON.parse(
    await readFile(
      fileURLToPath(new URL('../public/fillin-extension-release.json', import.meta.url)),
      'utf8'
    )
  );
  await page.goto('/');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('.glass-download-hero').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('fillin-extension-' + release.version + '.zip');
  const archive = await readFile((await download.path())!);
  expect(createHash('sha256').update(archive).digest('hex')).toBe(release.sha256);
  await expect(page).toHaveURL(/\/install$/);
  await expect(page.getByRole('heading', { name: 'How to Install Fillin' })).toBeVisible();
});

test('takes installation navigation back to the correct homepage section', async ({ page }) => {
  await page.goto('/install');
  await page.getByRole('link', { name: 'Features', exact: true }).click();
  await expect(page).toHaveURL(/\/#features$/);
  await expect(page.locator('#features')).toBeInViewport();
  await page.locator('footer').getByRole('link', { name: 'Fillin home' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
});

test('allows scrolling to the hero action on short landscape screens', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await page.goto('/');
  const download = page.locator('.glass-download-hero');
  await download.scrollIntoViewIfNeeded();
  await expect(download).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('demonstrates the email shortcut, supports replay, and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route(source, (route) => route.abort());
  await page.goto('/');
  const demo = page.getByRole('group', { name: 'Shortcut demonstration', exact: true });
  const result = demo.locator('.hero-shortcut-value');
  const replay = demo.getByRole('button', { name: 'Replay shortcut demonstration' });
  await expect(demo.getByText('/email', { exact: true })).toBeVisible();
  await expect(result).toHaveText('samprati@example.com');
  await expect(result).toHaveCSS('clip-path', /^inset\(0px(?: 0% 0px 0px)?\)$/);
  await replay.click();
  await expect(result).not.toHaveCSS('clip-path', /^inset\(0px(?: 0% 0px 0px)?\)$/);
  await page.locator('footer').scrollIntoViewIfNeeded();
  await expect(result).toHaveCSS('animation-play-state', 'paused');
  await demo.scrollIntoViewIfNeeded();
  await expect(result).toHaveCSS('animation-play-state', 'running');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(result).toHaveCSS('animation-name', 'none');
  await expect(result).toHaveCSS('clip-path', 'none');
  await expect(replay).not.toBeVisible();
});

for (const width of [320, 390, 768, 1280, 1440]) {
  test(`keeps the hero usable and balanced at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(page.locator('.glass-download-hero')).toBeInViewport();
    await expect
      .poll(() =>
        page
          .locator('.cinematic-poster')
          .evaluate((node) => (node as HTMLImageElement).naturalWidth)
      )
      .toBe(1600);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({ path: testInfo.outputPath('cinematic-hero.png') });
  });
}
