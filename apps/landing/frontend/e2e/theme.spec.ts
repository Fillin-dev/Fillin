import { test, expect, type Page, type Locator } from '@playwright/test';

// The theme checks never depend on external avatar or GitHub requests.
test.beforeEach(async ({ context }) => {
  await context.route('https://api.github.com/**', (route) =>
    route.fulfill({ json: { stargazers_count: 42 } })
  );
  await context.route('https://api.dicebear.com/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#818cf8"/></svg>',
    })
  );
});

async function expectTheme(page: Page, dark: boolean) {
  await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^(?!.*\bdark\b).*$/);
  await expect(page.locator('html')).toHaveCSS('color-scheme', dark ? 'dark' : 'light');
}

async function expectReadable(locator: Locator) {
  const ratio = await locator.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const ancestors: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement)
      ancestors.unshift(node);
    let background = [255, 255, 255];
    for (const node of ancestors) {
      const color = rgba(getComputedStyle(node).backgroundColor);
      background = background.map(
        (value, index) => (color[index] * color[3]) / 255 + value * (1 - color[3] / 255)
      );
    }
    const luminance = (rgb: number[]) =>
      rgb
        .slice(0, 3)
        .map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        })
        .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = luminance(rgba(getComputedStyle(element).color));
    const backdrop = luminance(background);
    return (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
}

test('follows the system until overridden, remembers the choice, and restores automatic mode', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const system = page.getByRole('radio', { name: 'System', exact: true });
  await expect(system).toBeChecked();
  await expectTheme(page, true);
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, false);
  await page.getByRole('radio', { name: 'Dark', exact: true }).locator('..').click();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expectTheme(page, true);
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, true);
  await page.getByRole('radio', { name: 'Light', exact: true }).locator('..').click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, false);
  await system.locator('..').click();
  await expectTheme(page, true);

  // Theme controls support the keyboard, with a visible focus indicator.
  await system.focus();
  await system.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeFocused();
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expectTheme(page, true);
});

test('uses the saved theme before the application starts and on the installation page', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('fillin-theme', 'dark'));
  // Hold React back to verify the early bootstrap prevents a light flash.
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.goto('/install');
  await expectTheme(page, true);
  await expect(page.locator('#root')).toBeEmpty();
  await page.unroute('**/assets/*.js');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'How to Install Fillin' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expectTheme(page, true);
});

test('works when local storage is unavailable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Storage blocked');
      },
    });
  });
  await page.goto('/');
  await expectTheme(page, true);
  await page.getByRole('radio', { name: 'Light', exact: true }).locator('..').click();
  await expectTheme(page, false);
  expect(errors).toEqual([]);
});

test('ignores invalid stored values and synchronizes changes between tabs', async ({
  context,
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('fillin-theme', 'invalid'));
  await page.reload();
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  const other = await context.newPage();
  await other.goto('/install');
  await page.getByRole('radio', { name: 'Dark', exact: true }).locator('..').click();
  await expectTheme(other, true);
  await expect(other.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await other.evaluate(() => localStorage.clear());
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  await expectTheme(page, false);
});

for (const width of [320, 390, 768, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${colorScheme} layout and interactions at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      await expectTheme(page, colorScheme === 'dark');
      await expect(page.getByRole('radiogroup', { name: 'Color theme' })).toBeInViewport();
      await expect(page.getByRole('link', { name: 'Star Fillin on GitHub' })).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await expectReadable(page.getByRole('heading', { level: 1 }));
      await expectReadable(page.getByRole('link', { name: /Download Fillin/ }).first());
      await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
      const editor = page.getByRole('textbox');
      await expect(page.getByLabel('Demo keystrokes saved')).toHaveText('0');
      await editor.fill('/em1');
      await editor.press('Control+Space');
      await expect(editor).toHaveValue('vishal@example.com');
      await expect(page.getByLabel('Demo keystrokes saved')).toHaveText('14');
      await page.getByTitle('Pause animation', { exact: true }).click();
      await page.getByRole('button', { name: 'Jump to animation step 5' }).click();
      await expect(page.getByText('meet', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '#dev', exact: true }).click();
      await expect(page.getByRole('button', { name: '#dev', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      const preview = page.getByRole('button', { name: 'Preview /pr shortcut', exact: true });
      await expect(preview).toHaveAttribute('aria-expanded', 'true');
      await expect(preview.getByText('LGTM! Merged to main branch', { exact: true })).toHaveCSS(
        'opacity',
        '1'
      );
      await page.goto('/install');
      await expectTheme(page, colorScheme === 'dark');
      await expectReadable(page.getByRole('heading', { level: 1 }));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('install.png'), fullPage: true });
    });
  }
}

test('counts successful demo expansions, preserves the cursor, and ignores unsuccessful attempts', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Try shortcut expansion' });
  const count = page.getByLabel('Demo keystrokes saved');
  await editor.fill('Hello /em1 end');
  for (let i = 0; i < 4; i++) await editor.press('ArrowLeft');
  await editor.press('Control+Space');
  await expect(editor).toHaveValue('Hello vishal@example.com end');
  await editor.pressSequentially('!');
  await expect(editor).toHaveValue('Hello vishal@example.com! end');
  await expect(count).toHaveText('14');
  await editor.fill('/unknown');
  await editor.press('Control+Space');
  await expect(count).toHaveText('14');
  await expect(editor).toHaveValue('/unknown');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Expand shortcut', exact: true }).click();
  await expect(count).toHaveText('28');
  await page.getByRole('button', { name: 'Expand shortcut', exact: true }).click();
  await expect(count).toHaveText('28');
  await page.reload();
  await expect(count).toHaveText('0');
});

test('previews shortcut text with hover and keyboard focus without affecting demo counts', async ({
  page,
}) => {
  await page.goto('/');
  const preview = page.getByRole('button', { name: 'Preview /email shortcut', exact: true });
  await expect(preview).toHaveAttribute('aria-expanded', 'false');
  await preview.hover();
  await expect(preview).toHaveAttribute('aria-expanded', 'true');
  await expect(preview.getByText('hello@example.com', { exact: true })).toHaveCSS('opacity', '1');
  await page.mouse.move(0, 0);
  await expect(preview).toHaveAttribute('aria-expanded', 'false');
  await preview.focus();
  await expect(preview).toHaveAttribute('aria-expanded', 'true');
  await preview.press('Escape');
  await expect(preview).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Demo keystrokes saved')).toHaveText('0');
});

test.describe('Touch previews', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('opens shortcut examples with a tap', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '#support', exact: true }).tap();
    const preview = page.getByRole('button', { name: 'Preview /refund shortcut', exact: true });
    await preview.tap();
    await expect(preview).toHaveAttribute('aria-expanded', 'true');
    await expect(preview.getByText('Your refund has been processed', { exact: true })).toHaveCSS(
      'opacity',
      '1'
    );
  });
});
