import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await context.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await context.route('https://d8j0ntlcm91z4.cloudfront.net/**', (route) => route.abort());
  await context.route('https://api.github.com/**', (route) =>
    route.fulfill({ json: { stargazers_count: 42 } })
  );
});

test('shows truthful product facts and a useful repository link when counts fail', async ({
  page,
}) => {
  await page.goto('/');
  const facts = page.locator('.product-facts');
  await expect(facts.getByRole('link')).toHaveText('42 stars on GitHub');
  await expect(facts.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/Fillin-dev/Fillin'
  );
  await expect(page.getByAltText('Contributor avatar')).toHaveCount(0);
  await page.route('https://api.github.com/**', (route) =>
    route.fulfill({ json: { stargazers_count: 'not-a-count' } })
  );
  await page.reload();
  await expect(facts.getByRole('link')).toHaveText('Open source on GitHub');
  await page.route('https://api.github.com/**', (route) => route.abort());
  await page.reload();
  await expect(facts.getByRole('link')).toHaveText('Open source on GitHub');
});

test('lets keyboard users read FAQ answers and keeps the closing download after them', async ({
  page,
}) => {
  await page.goto('/');
  const first = page.locator('#faq summary').first();
  await first.focus();
  await first.press('Enter');
  await expect(
    page.getByText(/Browser address bars, settings pages, and password fields are excluded/)
  ).toBeVisible();
  await first.press('Enter');
  await expect(
    page.getByText(/Browser address bars, settings pages, and password fields are excluded/)
  ).not.toBeVisible();
  const backup = page.locator('#faq summary').filter({ hasText: 'Is my data secure?' });
  await backup.focus();
  await backup.press('Space');
  await expect(
    page.getByText(
      'Snippets stay in your browser. Export a JSON backup before removing the extension or switching browsers.'
    )
  ).toBeVisible();
  expect(
    await page.locator('.closing-section').evaluate((node) => {
      const faq = document.getElementById('faq')!;
      return !!(faq.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    })
  ).toBe(true);
  await expect(
    page.locator('.closing-section').getByRole('link', { name: /Download Fillin/ })
  ).toHaveAttribute('download', /fillin-extension-.*\.zip/);
});

test('keeps the library tour still under reduced motion and supports choosing a step', async ({
  page,
}) => {
  await page.goto('/');
  const demo = page.getByLabel('Snippet library demonstration');
  await demo.scrollIntoViewIfNeeded();
  await expect(demo.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  await demo.getByRole('button', { name: 'Jump to animation step 5' }).click();
  await expect(demo.getByText('meet', { exact: true })).toBeVisible();
  await expect(demo.getByRole('button', { name: 'Jump to animation step 5' })).toHaveAttribute(
    'aria-current',
    'step'
  );
});

test('pauses the library tour off-screen and preserves the selected step', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const demo = page.getByLabel('Snippet library demonstration');
  await demo.scrollIntoViewIfNeeded();
  const active = demo.locator('[aria-current="step"]');
  const initial = await active.getAttribute('aria-label');
  await expect.poll(() => active.getAttribute('aria-label')).not.toBe(initial);
  await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
  const offscreenStep = await active.getAttribute('aria-label');
  await page.waitForTimeout(2400);
  await expect(active).toHaveAttribute('aria-label', offscreenStep!);
  await demo.scrollIntoViewIfNeeded();
  await demo.getByRole('button', { name: 'Jump to animation step 3' }).click();
  await expect(demo.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  await expect(active).toHaveAttribute('aria-label', 'Jump to animation step 3');
});
