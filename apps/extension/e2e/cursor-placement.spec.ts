import { test, expect, waitForExtension } from './fixtures';

const content = 'First\r\n🐴{{cursor}}\r\nBest';
test.beforeEach(async ({ extensionWorker }) => {
  await extensionWorker.evaluate(async (content) => {
    await chrome.storage.local.clear(); await chrome.storage.session.clear();
    await chrome.storage.local.set({ fillin_snippets: [
      { id: 'email', trigger: '/email', content: 'test@example.com', createdAt: 1, updatedAt: 1 },
      { id: 'cur', trigger: '/cur', content, templateVersion: 1, createdAt: 1, updatedAt: 1 },
      { id: 'fields', trigger: '/fields', content: 'Hi {{name}} / {{name}}, {{date}}. {{cursor}}\nBest', templateVersion: 1, dateFormat: 'iso', createdAt: 1, updatedAt: 1 },
      { id: 'literal', trigger: '/literal', content: 'Literal {{cursor}}', createdAt: 1, updatedAt: 1 },
    ] });
  }, content);
});

for (const label of ['Text input', 'Multiline input']) {
  test(`places the cursor after normalized multiline text and emoji in ${label}`, async ({ page, extensionWorker }) => {
    await page.goto('/'); await waitForExtension(page);
    const field = page.getByLabel(label, { exact: true });
    const before = 'Before 🐴 ';
    await field.fill(before + '/cur after');
    await field.evaluate((node: HTMLInputElement | HTMLTextAreaElement, offset) => node.setSelectionRange(offset, offset), before.length + 4);
    await field.press('Control+Space');
    const inserted = label === 'Text input' ? 'First🐴Best' : 'First\n🐴\nBest';
    const prefix = label === 'Text input' ? 'First🐴' : 'First\n🐴';
    await expect(field).toHaveValue(before + inserted + ' after');
    expect(await field.evaluate((node: HTMLInputElement | HTMLTextAreaElement) => node.selectionStart)).toBe(before.length + prefix.length);
    await field.pressSequentially('NEXT');
    await expect(field).toHaveValue(before + prefix + 'NEXT' + inserted.slice(prefix.length) + ' after');
    await expect.poll(() => extensionWorker.evaluate(async () => (await chrome.storage.local.get('fillin_stats')).fillin_stats?.expansionCount)).toBe(1);
    expect((await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_snippets'))).fillin_snippets.find((s: { id: string }) => s.id === 'cur').content).toBe(content);
  });
}

for (const [markerContent, expected] of [['{{cursor}}abc', 'Xabc'], ['abc{{cursor}}', 'abcX'], ['{{cursor}}', 'X']]) {
  test(`handles cursor boundary ${markerContent}`, async ({ page, extensionWorker }) => {
    await extensionWorker.evaluate(async (content) => {
      const data = await chrome.storage.local.get('fillin_snippets'); data.fillin_snippets[1].content = content; await chrome.storage.local.set(data);
    }, markerContent);
    await page.goto('/'); await waitForExtension(page);
    const field = page.getByLabel('Text input', { exact: true });
    await field.fill('/cur'); await field.press('Control+Space');
    await expect(field).toHaveValue(expected.replace('X', ''));
    await field.pressSequentially('X'); await expect(field).toHaveValue(expected);
  });
}

test('positions after repeated fill-in answers and dates, preserving the final newline', async ({ page }) => {
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByLabel('Multiline input');
  await field.fill('Before /fields after');
  await field.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(14, 14));
  await field.press('Control+Space');
  const dialog = page.getByRole('dialog', { name: 'Fill in snippet' });
  await expect(dialog.getByRole('textbox')).toHaveCount(1);
  await dialog.getByLabel('Name', { exact: true }).fill('Zoë🐴');
  const completed = await dialog.getByLabel('Completed message preview').innerText();
  expect(completed).not.toContain('{{cursor}}');
  const offset = completed.indexOf('\n');
  await dialog.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(field).toHaveValue('Before ' + completed + ' after');
  expect(await field.evaluate((node: HTMLTextAreaElement) => node.selectionStart)).toBe(7 + offset);
  await field.pressSequentially('CONTINUE');
  await expect(field).toHaveValue('Before ' + completed.slice(0, offset) + 'CONTINUE' + completed.slice(offset) + ' after');
});

test('preserves rich-text nodes and places the caret inside the inserted text', async ({ page }) => {
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByRole('textbox', { name: 'Rich text editor' });
  await field.evaluate((node) => {
    node.innerHTML = 'Before <strong>/cur</strong> <em>after</em>'; node.focus();
    const range = document.createRange(); range.setStart(node.querySelector('strong')!.firstChild!, 4); range.collapse(true);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  });
  await field.press('Control+Space');
  const inserted = 'First\n🐴\nBest';
  await expect.poll(() => field.locator('strong').innerText()).toBe(inserted);
  await expect(field.locator('em')).toHaveText('after');
  await field.pressSequentially('NEXT');
  expect(await field.locator('strong').innerText()).toBe('First\n🐴NEXT\nBest');
  await expect(field.locator('em')).toHaveText('after');
});

test('uses cursor placement through the palette and optional suggestions', async ({ page, extensionWorker }) => {
  await extensionWorker.evaluate(() => chrome.storage.local.set({ fillin_suggestions_enabled: true }));
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByLabel('Text input', { exact: true });
  await field.fill('Before replace after');
  await field.evaluate((node: HTMLInputElement) => { node.focus(); node.setSelectionRange(7, 14); });
  await field.press('Control+Shift+K');
  const palette = page.locator('#fillin-command-palette-host');
  await palette.locator('input').fill('/cur'); await palette.locator('input').press('Enter');
  await expect(field).toHaveValue('Before First🐴Best after');
  await field.pressSequentially('X'); await expect(field).toHaveValue('Before First🐴XBest after');
  await field.fill('/cu');
  const panel = page.getByRole('region', { name: 'Fillin shortcut suggestions' });
  await panel.getByRole('button', { name: 'Insert /cur', exact: true }).click();
  await expect(field).toHaveValue('First🐴Best');
  await field.pressSequentially('Y'); await expect(field).toHaveValue('First🐴YBest');
});

for (const [value, expected] of [['\n{{cursor}}B', '\nXB'], ['A\n{{cursor}}', null], ['{{cursor}}\nB', null], ['Hi. {{cursor}}\nBest', null]] as const) {
  test(`preserves rich-editor line boundaries for ${JSON.stringify(value)}`, async ({ page, extensionWorker }) => {
    await extensionWorker.evaluate(async (content) => {
      const data = await chrome.storage.local.get('fillin_snippets'); data.fillin_snippets[1].content = content; await chrome.storage.local.set(data);
    }, value);
    await page.goto('/'); await waitForExtension(page);
    const field = page.getByRole('textbox', { name: 'Rich text editor' });
    await field.evaluate((node) => {
      node.innerHTML = 'Before <strong>/cur</strong> <em>after</em>'; node.focus();
      const range = document.createRange(); range.setStart(node.querySelector('strong')!.firstChild!, 4); range.collapse(true);
      window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    });
    await field.press('Control+Space');
    if (expected === null) {
      const dialog = page.getByRole('dialog', { name: 'Copy snippet' });
      await expect(dialog).toContainText('Cursor placement is unavailable');
      await expect(dialog.getByLabel('Completed message preview')).not.toContainText('{{cursor}}');
      await expect(dialog.getByRole('button', { name: 'Insert', exact: true })).toHaveCount(0);
      expect(await field.innerHTML()).toBe('Before <strong>/cur</strong> <em>after</em>');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      return;
    }
    await expect(field.locator('strong')).not.toContainText('/cur');
    await field.pressSequentially('X');
    // At an empty inline boundary Chrome may put the new text beside the
    // formatting element. Verify the logical position and unchanged neighbors.
    const plain = await field.evaluate((node) => {
      const read = (item: Node): string => item.nodeName === 'BR' ? '\n' : item.nodeType === Node.TEXT_NODE ? item.textContent || '' : Array.from(item.childNodes).map(read).join('');
      return read(node);
    });
    expect(plain, await field.innerHTML()).toBe('Before ' + expected + ' after');
    await expect(field.locator('em')).toHaveText('after');
  });
}

test('offers a clean copy and explanation for an unmappable rich-text position', async ({ page }) => {
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByRole('textbox', { name: 'Rich text editor' });
  await field.evaluate((node) => {
    node.innerHTML = '<br>'; node.focus();
    const range = document.createRange(); range.setStart(node, 0); range.collapse(true);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  });
  await field.press('Control+Shift+K');
  const palette = page.locator('#fillin-command-palette-host');
  await palette.locator('input').fill('/cur'); await palette.locator('input').press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Copy snippet' });
  await expect(dialog).toContainText('Cursor placement is unavailable');
  await expect(dialog.getByLabel('Completed message preview')).toHaveText('First\n🐴\nBest');
  await expect(dialog.getByRole('button', { name: 'Insert', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Copy completed message' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await field.innerHTML()).toBe('<br>');
});

test('never positions the caret after a controlled field rejects the new text', async ({ page, extensionWorker }) => {
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByLabel('Text input', { exact: true });
  await field.fill('/cur');
  await field.evaluate((node: HTMLInputElement) => {
    node.addEventListener('input', () => { node.value = 'Host changed value'; }, { once: true });
  });
  await field.press('Control+Space');
  await expect(field).toHaveValue('Host changed value');
  await field.pressSequentially('X'); await expect(field).toHaveValue('Host changed valueX');
  expect((await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_stats'))).fillin_stats?.expansionCount ?? 0).toBe(0);
});

test('validates duplicate cursor markers in the popup and keeps unenabled snippets literal', async ({ popup, page }) => {
  await popup.getByRole('button', { name: 'Create Snippet', exact: true }).click();
  await popup.getByLabel('Shortcut', { exact: true }).fill('signature');
  await popup.getByLabel('Expanded text').fill('A{{cursor}}{{cursor}}B');
  await popup.getByRole('checkbox', { name: /Use template values/ }).check();
  await expect(popup.getByRole('alert')).toContainText('only one');
  await expect(popup.getByRole('button', { name: 'Save Snippet', exact: true })).toBeDisabled();
  await popup.getByLabel('Expanded text').fill('Thanks.\nBest.');
  await popup.getByLabel('Expanded text').evaluate((node: HTMLTextAreaElement) => { node.focus(); node.setSelectionRange(7, 7); });
  await popup.getByRole('button', { name: '{{cursor}}', exact: true }).click();
  await expect(popup.getByLabel('Expanded text')).toHaveValue('Thanks.{{cursor}}\nBest.');
  await popup.getByRole('button', { name: 'Save Snippet', exact: true }).click();
  await expect(popup.getByRole('button', { name: 'Create Snippet', exact: true })).toBeVisible();
  await page.goto('/'); await waitForExtension(page);
  const field = page.getByLabel('Multiline input');
  await field.fill('/signature'); await field.press('Control+Space');
  await expect(field).toHaveValue('Thanks.\nBest.');
  await field.pressSequentially(' More'); await expect(field).toHaveValue('Thanks. More\nBest.');
  await field.fill('/literal'); await field.press('Control+Space');
  await expect(field).toHaveValue('Literal {{cursor}}');
  await field.pressSequentially('!'); await expect(field).toHaveValue('Literal {{cursor}}!');
});
