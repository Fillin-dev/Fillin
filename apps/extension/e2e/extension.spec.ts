import {
  test,
  expect,
  createSnippet,
  openExtensionWindow,
  waitForExtension,
} from './fixtures';

test.beforeEach(async ({ extensionWorker }) => {
  // Seed only test data through the real extension storage API. The tests below
  // use the installed production popup, content script, and background worker.
  await extensionWorker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      fillin_snippets: [
        {
          id: 'email',
          trigger: '/email',
          content: 'test@example.com',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'signature',
          trigger: '/sig',
          content: 'Thanks,\nFillin',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'rich',
          trigger: '/rich',
          content: '<strong>Bold</strong> <em>italic</em>',
          isHtml: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
  });
});

test('creates a snippet in the installed popup, persists it, and expands typed text', async ({
  popup,
  page,
}) => {
  await page.goto('/');
  await waitForExtension(page);
  await createSnippet(popup, 'hello', 'Hello world');
  await popup.reload();
  await expect(popup.getByText('/hello', { exact: true })).toBeVisible();
  const input = page.getByLabel('Text input', { exact: true });
  await input.pressSequentially('/hello');
  await input.press('Control+Space');
  await expect(input).toHaveValue('Hello world');
  await expect(page.locator('#observed')).toHaveText('Hello world');
});

for (const label of ['Text input', 'Multiline input']) {
  test(`replaces a trigger in the middle of ${label} and preserves the cursor`, async ({
    page,
  }) => {
    await page.goto('/');
    await waitForExtension(page);
    const input = page.getByLabel(label, { exact: true });
    await input.pressSequentially('Hello /email world');
    for (let i = 0; i < 6; i++) await input.press('ArrowLeft');
    await input.press('Control+Space');
    await expect(input).toHaveValue('Hello test@example.com world');
    expect(
      await input.evaluate(
        (element: HTMLInputElement | HTMLTextAreaElement) => [
          element.selectionStart,
          element.selectionEnd,
        ]
      )
    ).toEqual([22, 22]);
    await input.pressSequentially('!');
    await expect(input).toHaveValue('Hello test@example.com! world');
  });
}

test('expands multiline snippets in a textarea', async ({ page }) => {
  await page.goto('/');
  await waitForExtension(page);
  const input = page.getByLabel('Multiline input');
  await input.pressSequentially('/sig');
  await input.press('Control+Space');
  await expect(input).toHaveValue('Thanks,\nFillin');
  await input.pressSequentially('!');
  await expect(input).toHaveValue('Thanks,\nFillin!');
});

test('leaves password fields unchanged and does not count an expansion', async ({
  page,
  extensionWorker,
}) => {
  await page.goto('/');
  await waitForExtension(page);
  const password = page.getByLabel('Password', { exact: true });
  await password.pressSequentially('/email');
  await password.press('Control+Space');
  await expect(password).toHaveValue('/email');
  expect(
    await password.evaluate(
      (element: HTMLInputElement) => element.selectionStart
    )
  ).toBe(6);
  const { fillin_stats } = await extensionWorker.evaluate(() =>
    chrome.storage.local.get('fillin_stats')
  );
  expect(fillin_stats?.expansionCount ?? 0).toBe(0);
});

test('expands plain text in a contenteditable editor and retains cursor placement', async ({
  page,
}) => {
  await page.goto('/');
  await waitForExtension(page);
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await editor.pressSequentially('Hello /email world');
  for (let i = 0; i < 6; i++) await editor.press('ArrowLeft');
  await editor.press('Control+Space');
  await expect(editor).toHaveText('Hello test@example.com world');
  await editor.pressSequentially('!');
  await expect(editor).toHaveText('Hello test@example.com! world');
});

test('inserts HTML formatting into a rich-text editor with the cursor after it', async ({
  page,
}) => {
  await page.goto('/');
  await waitForExtension(page);
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await editor.pressSequentially('/rich');
  await editor.press('Control+Space');
  await expect(editor.locator('strong')).toHaveText('Bold');
  await expect(editor.locator('em')).toHaveText('italic');
  await editor.pressSequentially('!');
  await expect(editor).toHaveText('Bold italic!');
});

test('preserves simultaneous saves from two real extension windows', async ({
  context,
  extensionWorker,
  extensionId,
  popup,
}) => {
  const other = await openExtensionWindow(
    context,
    extensionWorker,
    extensionId
  );
  await Promise.all([
    createSnippet(popup, 'first', 'First window'),
    createSnippet(other, 'second', 'Second window'),
  ]);
  await expect
    .poll(async () => {
      const { fillin_snippets } = await extensionWorker.evaluate(() =>
        chrome.storage.local.get('fillin_snippets')
      );
      return fillin_snippets
        .map((snippet: { trigger: string }) => snippet.trigger)
        .sort();
    })
    .toEqual(['/email', '/first', '/rich', '/second', '/sig']);
  await Promise.all([popup.reload(), other.reload()]);
  for (const window of [popup, other]) {
    await expect(window.getByText('/first', { exact: true })).toBeVisible();
    await expect(window.getByText('/second', { exact: true })).toBeVisible();
  }
});

test('keeps statistics from expansions on different website origins', async ({
  context,
  page,
  baseURL,
  extensionWorker,
}) => {
  const other = await context.newPage();
  await Promise.all([
    page.goto('/'),
    other.goto(baseURL!.replace('127.0.0.1', 'localhost')),
  ]);
  await Promise.all([waitForExtension(page), waitForExtension(other)]);
  const inputs = [page, other].map((tab) =>
    tab.getByLabel('Text input', { exact: true })
  );
  await Promise.all(inputs.map((input) => input.pressSequentially('/email')));
  await Promise.all(inputs.map((input) => input.press('Control+Space')));
  for (const input of inputs)
    await expect(input).toHaveValue('test@example.com');
  await expect
    .poll(
      async () =>
        (
          await extensionWorker.evaluate(() =>
            chrome.storage.local.get('fillin_stats')
          )
        ).fillin_stats
    )
    .toEqual({ keystrokesSaved: 20, expansionCount: 2 });
});
