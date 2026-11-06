import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SnippetService } from './SnippetService';
import { InMemoryRepository } from '../storage/InMemoryRepository';

describe('SnippetService', () => {
  let repository: InMemoryRepository;
  let service: SnippetService;

  beforeEach(() => {
    repository = new InMemoryRepository();
    service = new SnippetService(repository);
  });

  describe.each(['queue', 'Web Locks'])(
    'concurrent writes using %s',
    (locking) => {
      let otherService: SnippetService;

      beforeEach(() => {
        otherService = new SnippetService(repository);
        // Storage returns snapshots, not a shared mutable array.
        const read = repository.getAll.bind(repository);
        vi.spyOn(repository, 'getAll').mockImplementation(async () =>
          structuredClone(await read())
        );
        if (locking === 'Web Locks') {
          let pending: Promise<unknown> = Promise.resolve();
          vi.stubGlobal('navigator', {
            locks: {
              request: vi.fn((_name: string, write: () => Promise<unknown>) => {
                const result = pending.then(write);
                pending = result.catch(() => undefined);
                return result;
              }),
            },
          });
        } else {
          vi.stubGlobal('navigator', {});
        }
      });

      afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      });

      it('preserves simultaneous creates from separate services', async () => {
        await Promise.all([
          service.createSnippet('/a', 'A'),
          otherService.createSnippet('/b', 'B'),
        ]);
        expect(
          (await service.getSnippets()).map((s) => s.trigger).sort()
        ).toEqual(['/a', '/b']);
        if (locking === 'Web Locks') {
          expect(navigator.locks.request).toHaveBeenCalledWith(
            'fillin-snippets-write',
            expect.any(Function)
          );
        }
      });

      it('rejects simultaneous duplicate triggers', async () => {
        const results = await Promise.allSettled([
          service.createSnippet('/same', 'A'),
          otherService.createSnippet('/same', 'B'),
        ]);
        expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
        expect(await service.getSnippets()).toHaveLength(1);
      });

      it('preserves edits to separate fields on the same snippet', async () => {
        const snippet = await service.createSnippet('/a', 'A');
        await Promise.all([
          service.updateSnippet(snippet.id, { content: 'updated' }),
          otherService.updateSnippet(snippet.id, { tags: ['work'] }),
        ]);
        expect(await service.getSnippetByTrigger('/a')).toMatchObject({
          content: 'updated',
          tags: ['work'],
        });
      });

      it('does not resurrect a deleted snippet during a concurrent create', async () => {
        const snippet = await service.createSnippet('/a', 'A');
        await Promise.all([
          service.deleteSnippet(snippet.id),
          otherService.createSnippet('/b', 'B'),
        ]);
        expect((await service.getSnippets()).map((s) => s.trigger)).toEqual([
          '/b',
        ]);
      });

      it('preserves concurrent imports, starter packs, and creates', async () => {
        await Promise.all([
          service.importSnippets([
            {
              id: 'import',
              trigger: '/import',
              content: 'import',
              createdAt: 1,
              updatedAt: 1,
            },
          ]),
          otherService.loadStarterPack(),
          service.createSnippet('/custom', 'custom'),
        ]);
        const triggers = (await service.getSnippets()).map((s) => s.trigger);
        expect(triggers).toEqual(
          expect.arrayContaining(['/import', '/shrug', '/custom'])
        );
        expect(new Set(triggers).size).toBe(triggers.length);
      });

      it('allows queued writes to continue after a save fails', async () => {
        vi.spyOn(repository, 'save').mockRejectedValueOnce(
          new Error('Disk full')
        );
        const results = await Promise.allSettled([
          service.createSnippet('/fail', 'A'),
          otherService.createSnippet('/success', 'B'),
        ]);
        expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
        expect((await service.getSnippets()).map((s) => s.trigger)).toEqual([
          '/success',
        ]);
      });
    }
  );

  describe('create', () => {
    it('should create a valid snippet successfully', async () => {
      const snippet = await service.createSnippet('/email', 'test@example.com');
      expect(snippet.trigger).toBe('/email');
      expect(snippet.content).toBe('test@example.com');
      expect(snippet.id).toBeDefined();

      const all = await service.getSnippets();
      expect(all).toHaveLength(1);
    });

    it('should prevent duplicate triggers', async () => {
      await service.createSnippet('/email', 'first');
      await expect(service.createSnippet('/email', 'second')).rejects.toThrow(
        'already exists'
      );
    });

    it('should throw validation error on invalid trigger', async () => {
      await expect(service.createSnippet('email', 'no slash')).rejects.toThrow(
        'Validation failed'
      );
    });
  });

  describe('read', () => {
    it('should get all snippets', async () => {
      await service.createSnippet('/a', 'A');
      await service.createSnippet('/b', 'B');
      const all = await service.getSnippets();
      expect(all).toHaveLength(2);
    });

    it('should get snippet by trigger', async () => {
      await service.createSnippet('/find_me', 'found');
      const snippet = await service.getSnippetByTrigger('/find_me');
      expect(snippet?.content).toBe('found');

      const missing = await service.getSnippetByTrigger('/missing');
      expect(missing).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update snippet content and update timestamp', async () => {
      const snippet = await service.createSnippet('/test', 'old');
      const updated = await service.updateSnippet(snippet.id, {
        content: 'new',
      });

      expect(updated.content).toBe('new');
      expect(updated.trigger).toBe('/test');
      expect(updated.updatedAt).toBeGreaterThanOrEqual(snippet.updatedAt);
    });

    it('should update trigger successfully', async () => {
      const snippet = await service.createSnippet('/test', 'content');
      const updated = await service.updateSnippet(snippet.id, {
        trigger: '/new_test',
      });

      expect(updated.trigger).toBe('/new_test');
    });

    it('should reject update if new trigger already exists', async () => {
      await service.createSnippet('/existing', 'A');
      const snippet2 = await service.createSnippet('/test', 'B');

      await expect(
        service.updateSnippet(snippet2.id, { trigger: '/existing' })
      ).rejects.toThrow('already exists');
    });

    it('should reject update if validation fails', async () => {
      const snippet = await service.createSnippet('/test', 'A');
      await expect(
        service.updateSnippet(snippet.id, { trigger: 'invalid' })
      ).rejects.toThrow('Validation failed');
    });

    it('should throw when updating non-existent snippet', async () => {
      await expect(
        service.updateSnippet('fake-id', { content: 'C' })
      ).rejects.toThrow('not found');
    });
  });

  describe('delete', () => {
    it('should delete existing snippet', async () => {
      const snippet = await service.createSnippet('/test', 'A');
      await service.deleteSnippet(snippet.id);

      const all = await service.getSnippets();
      expect(all).toHaveLength(0);
    });

    it('should throw when deleting non-existent snippet', async () => {
      await expect(service.deleteSnippet('fake-id')).rejects.toThrow(
        'not found'
      );
    });
  });

  describe('storage failures', () => {
    it('should propagate read errors', async () => {
      repository.shouldFail = true;
      await expect(service.getSnippets()).rejects.toThrow(
        'Simulated storage read failure'
      );
    });

    it('should propagate write errors', async () => {
      repository.shouldFail = true;
      await expect(service.createSnippet('/test', 'A')).rejects.toThrow(
        'Simulated storage read failure'
      ); // Fails on initial read check
    });
  });

  describe('tags support', () => {
    it('creates snippets with tags and updates tags', async () => {
      const created = await service.createSnippet('/tagged', 'content', false, [
        'work',
        'email',
      ]);
      expect(created.tags).toEqual(['work', 'email']);

      const updated = await service.updateSnippet(created.id, {
        tags: ['personal'],
      });
      expect(updated.tags).toEqual(['personal']);
    });
  });

  describe('starter pack', () => {
    it('loads starter snippets into an empty repository', async () => {
      const snippets = await service.loadStarterPack();
      expect(snippets.length).toBeGreaterThan(0);
      expect(snippets.some((s) => s.trigger === '/shrug')).toBe(true);
    });

    it('does not duplicate existing triggers when loading starter pack', async () => {
      await service.createSnippet('/shrug', 'custom shrug');
      const snippets = await service.loadStarterPack();
      const shrug = snippets.find((s) => s.trigger === '/shrug');
      expect(shrug?.content).toBe('custom shrug');
    });
  });

  describe('import/export', () => {
    it('imports valid snippets and skips invalid ones', async () => {
      const data = [
        {
          id: '1',
          trigger: '/imported',
          content: 'valid content',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: '2',
          trigger: 'invalid-no-slash',
          content: 'bad',
        },
      ];

      const res = await service.importSnippets(data);
      expect(res.imported).toBe(1);
      expect(res.skipped).toBe(1);

      const all = await service.getSnippets();
      expect(all.some((s) => s.trigger === '/imported')).toBe(true);
    });
  });
});
