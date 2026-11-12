import { describe, it, expect } from 'vitest';
import { SnippetService } from './SnippetService';
import { InMemoryRepository } from '../storage/InMemoryRepository';

describe('dynamic snippet storage', () => {
  it('adds dynamic starters without overwriting an existing today shortcut', async () => {
    const service = new SnippetService(new InMemoryRepository());
    await service.createSnippet('/today', 'A custom date');
    await service.loadStarterPack();
    expect(await service.getSnippetByTrigger('/today')).toMatchObject({ content: 'A custom date' });
    expect(await service.getSnippetByTrigger('/time')).toMatchObject({
      content: '{{time}}',
      templateVersion: 1,
    });
  });
  it('preserves metadata through create, update, and import and can return to literal mode', async () => {
    const service = new SnippetService(new InMemoryRepository());
    const created = await service.createSnippet('/today', '{{date}}', false, [], {
      templateVersion: 1,
      dateFormat: 'iso',
    });
    await service.importSnippets([{ ...created, content: '{{datetime}}' }]);
    expect(await service.getSnippetByTrigger('/today')).toMatchObject({
      content: '{{datetime}}',
      templateVersion: 1,
      dateFormat: 'iso',
    });
    await service.updateSnippet(created.id, {
      templateVersion: undefined,
      dateFormat: undefined,
      content: '{{name}}',
    });
    expect((await service.getSnippetByTrigger('/today'))?.templateVersion).toBeUndefined();
  });
  it('does not overwrite valid content when imported template versions are unsupported', async () => {
    const service = new SnippetService(new InMemoryRepository());
    const original = await service.createSnippet('/today', 'Keep this');
    expect(
      await service.importSnippets([{ ...original, templateVersion: 2, content: '{{date}}' }])
    ).toMatchObject({ skipped: 1, updated: 0 });
    expect((await service.getSnippetByTrigger('/today'))?.content).toBe('Keep this');
  });
});
