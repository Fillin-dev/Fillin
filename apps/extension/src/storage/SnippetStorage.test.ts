import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Snippet } from '@fillin/shared';
import { ChromeStorageRepository } from './ChromeStorageRepository';
import { WebStorageRepository } from './WebStorageRepository';
import { SnippetRepository } from './SnippetRepository';
import { SnippetService } from '../services/SnippetService';
import {
  SNIPPET_DATA_ERROR,
  SNIPPET_READ_ERROR,
  SNIPPET_WRITE_ERROR,
} from './validateSnippetLibrary';

const KEY = 'fillin_snippets';
const snippet: Snippet = {
  id: 'original',
  trigger: '/saved',
  content: 'Keep me',
  createdAt: 1,
  updatedAt: 1,
};

describe.each(['web', 'chrome'])('%s snippet storage', (kind) => {
  let repository: SnippetRepository;
  let service: SnippetService;
  let stored: unknown;
  let readFailure: boolean;
  let writeFailure: boolean;
  let set: ReturnType<typeof vi.fn<[], void>>;

  const seed = (value: unknown) => {
    if (kind === 'web') localStorage.setItem(KEY, JSON.stringify(value));
    else stored = structuredClone(value);
  };
  const snapshot = () =>
    kind === 'web' ? localStorage.getItem(KEY) : structuredClone(stored);

  beforeEach(() => {
    localStorage.clear();
    stored = undefined;
    readFailure = false;
    writeFailure = false;
    set = vi.fn<[], void>();
    if (kind === 'web') {
      repository = new WebStorageRepository();
      const save = localStorage.setItem.bind(localStorage);
      vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        set();
        if (writeFailure) throw new Error('Quota exceeded');
        save(key, value);
      });
    } else {
      const runtime: { lastError?: { message: string } } = {};
      const save = (values: Record<string, unknown>, callback: () => void) => {
        set();
        queueMicrotask(() => {
          runtime.lastError = writeFailure
            ? { message: 'Write failed' }
            : undefined;
          if (!writeFailure) stored = structuredClone(values[KEY]);
          callback();
          runtime.lastError = undefined;
        });
      };
      vi.stubGlobal('chrome', {
        runtime,
        storage: {
          local: {
            get: vi.fn((_key, callback) => {
              queueMicrotask(() => {
                runtime.lastError = readFailure
                  ? { message: 'Read failed' }
                  : undefined;
                callback(
                  stored === undefined ? {} : { [KEY]: structuredClone(stored) }
                );
                runtime.lastError = undefined;
              });
            }),
            set: save,
          },
        },
      });
      repository = new ChromeStorageRepository();
    }
    service = new SnippetService(repository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('treats only an absent key as an empty library', async () => {
    await expect(repository.getAll()).resolves.toEqual([]);
    seed([]);
    await expect(repository.getAll()).resolves.toEqual([]);
  });

  it('loads valid existing snippets, including empty content and optional fields', async () => {
    seed([{ ...snippet, content: '' }]);
    const before = snapshot();
    await expect(repository.getAll()).resolves.toEqual([
      { ...snippet, content: '' },
    ]);
    expect(snapshot()).toEqual(before);
  });

  it.each([
    ['null', null],
    ['false', false],
    ['object', {}],
    ['empty string', ''],
    ['invalid entry', [{ ...snippet, trigger: 'no-slash' }]],
    ['mixed entries', [snippet, { content: 'broken' }]],
    ['duplicate IDs', [snippet, { ...snippet, trigger: '/other' }]],
    ['duplicate triggers', [snippet, { ...snippet, id: 'other' }]],
  ])(
    'rejects %s without changing or partially loading the library',
    async (_name, value) => {
      seed(value);
      const before = snapshot();
      set.mockClear();
      await expect(repository.getAll()).rejects.toThrow(SNIPPET_DATA_ERROR);
      await expect(repository.save([])).rejects.toThrow(SNIPPET_DATA_ERROR);
      expect(set).not.toHaveBeenCalled();
      expect(snapshot()).toEqual(before);
    }
  );

  it('blocks every service mutation while existing data is invalid', async () => {
    seed([snippet, { content: 'broken' }]);
    const before = snapshot();
    set.mockClear();
    const operations = [
      () => service.createSnippet('/new', 'New'),
      () => service.updateSnippet(snippet.id, { content: 'Changed' }),
      () => service.deleteSnippet(snippet.id),
      () =>
        service.importSnippets([
          { ...snippet, trigger: '/imported', id: 'imported' },
        ]),
      () => service.loadStarterPack(),
    ];
    for (const operation of operations) {
      await expect(operation()).rejects.toThrow(SNIPPET_DATA_ERROR);
    }
    expect(set).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
  });

  it('blocks writes after a failed read and recovers when storage is readable', async () => {
    seed([snippet]);
    const before = snapshot();
    set.mockClear();
    readFailure = true;
    const read =
      kind === 'web'
        ? vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
            throw new Error('Blocked');
          })
        : undefined;
    await expect(repository.getAll()).rejects.toThrow(SNIPPET_READ_ERROR);
    await expect(repository.save([])).rejects.toThrow(SNIPPET_READ_ERROR);
    await expect(service.createSnippet('/new', 'New')).rejects.toThrow(
      SNIPPET_READ_ERROR
    );
    expect(set).not.toHaveBeenCalled();
    read?.mockRestore();
    readFailure = false;
    expect(snapshot()).toEqual(before);
    await service.createSnippet('/new', 'New');
    expect((await repository.getAll()).map((s) => s.trigger)).toEqual([
      '/saved',
      '/new',
    ]);
  });

  it('rejects invalid outgoing data without changing saved snippets', async () => {
    seed([snippet]);
    const before = snapshot();
    set.mockClear();
    await expect(
      repository.save([{ ...snippet, trigger: 'invalid' }])
    ).rejects.toThrow(SNIPPET_DATA_ERROR);
    expect(set).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
  });

  it('reports a failed write, preserves the original, and allows retry', async () => {
    seed([snippet]);
    const before = snapshot();
    writeFailure = true;
    await expect(
      service.updateSnippet(snippet.id, { content: 'Updated' })
    ).rejects.toThrow(SNIPPET_WRITE_ERROR);
    expect(snapshot()).toEqual(before);
    writeFailure = false;
    await service.updateSnippet(snippet.id, { content: 'Updated' });
    expect((await repository.getAll())[0].content).toBe('Updated');
  });
});

it('preserves malformed JSON byte for byte and blocks saving over it', async () => {
  const raw = '[{"private text":';
  localStorage.setItem(KEY, raw);
  try {
    const repository = new WebStorageRepository();
    await expect(repository.getAll()).rejects.toThrow(SNIPPET_DATA_ERROR);
    await expect(repository.save([])).rejects.toThrow(SNIPPET_DATA_ERROR);
    expect(localStorage.getItem(KEY)).toBe(raw);
  } finally {
    localStorage.clear();
  }
});
