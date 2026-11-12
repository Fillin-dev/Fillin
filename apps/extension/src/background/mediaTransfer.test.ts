import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';

const state = vi.hoisted(() => ({ library: [] as any[], domains: [] as string[], read: vi.fn() }));
vi.mock('../storage/ChromeStorageRepository', () => ({
  ChromeStorageRepository: class {
    async getAll() {
      return state.library;
    }
  },
}));
vi.mock('../services/BlacklistService', () => ({
  BlacklistService: class {
    async getBlacklist() {
      return state.domains;
    }
  },
}));
vi.mock('../services/MediaSnippetService', () => ({
  MediaSnippetService: class {
    readSelected = state.read;
  },
}));
import { installMediaTransfer } from './mediaTransfer';

describe('selected media transfer boundaries', () => {
  let listener: (
    request: unknown,
    sender: chrome.runtime.MessageSender,
    respond: (value: any) => void
  ) => unknown;
  const sender = {
    id: 'fillin',
    tab: { id: 7, url: 'https://example.com' },
    frameId: 0,
    documentId: 'document-a',
    url: 'https://example.com/editor',
  } as chrome.runtime.MessageSender;
  const request = (value: Record<string, unknown>, from = sender): Promise<any> =>
    new Promise((resolve) => listener({ type: 'FILLIN_MEDIA', ...value }, from, resolve));
  const begin = () => request({ action: 'begin', id: 'image', revision: 1 });
  beforeEach(() => {
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'fillin',
        onMessage: {
          addListener: (value: typeof listener) => {
            listener = value;
          },
        },
      },
    });
    state.domains = [];
    state.library = [
      {
        id: 'image',
        kind: 'media',
        updatedAt: 1,
        assetId: 'a'.repeat(64),
        mime: 'image/png',
        byteSize: 5,
        width: 1,
        height: 1,
        frameCount: 1,
      },
    ];
    state.read
      .mockReset()
      .mockResolvedValue({
        ...state.library[0],
        original: new Blob(['image'], { type: 'image/png' }),
        thumbnail: new Blob(['poster'], { type: 'image/png' }),
      });
    installMediaTransfer();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('rejects other extensions, extension pages and blocked parent/frame sites before reading originals', async () => {
    for (const from of [
      { ...sender, id: 'other' },
      { ...sender, url: 'chrome-extension://fillin/editor.html' },
      { ...sender, tab: undefined },
    ])
      expect((await request({ action: 'begin', id: 'image', revision: 1 }, from)).ok).toBe(false);
    state.domains = ['example.com'];
    expect((await begin()).ok).toBe(false);
    state.domains = ['parent.com'];
    expect(
      (
        await request({ action: 'begin', id: 'image', revision: 1 }, {
          ...sender,
          tab: { id: 7, url: 'https://child.parent.com' },
        } as chrome.runtime.MessageSender)
      ).ok
    ).toBe(false);
    expect(state.read).not.toHaveBeenCalled();
  });
  it('binds transfers to a tab, frame and document, and checks offsets and current revisions', async () => {
    const {
      value: { token },
    } = await begin();
    for (const from of [
      { ...sender, frameId: 1 },
      { ...sender, documentId: 'document-b' },
      { ...sender, tab: { id: 8 } },
    ])
      expect(
        (
          await request(
            { action: 'chunk', token, part: 'original', offset: 0 },
            from as chrome.runtime.MessageSender
          )
        ).ok
      ).toBe(false);
    expect((await request({ action: 'chunk', token, part: 'original', offset: 1 })).ok).toBe(false);
    expect(
      (await request({ action: 'chunk', token, part: 'original', offset: 0 })).value.data
    ).toBe('aW1hZ2U=');
    state.library[0] = { ...state.library[0], updatedAt: 2 };
    expect((await request({ action: 'check', token })).ok).toBe(false);
    expect((await request({ action: 'chunk', token, part: 'original', offset: 0 })).ok).toBe(false);
  });
  it('rechecks block policy after an asynchronous read and on every subsequent request', async () => {
    state.read.mockImplementationOnce(async () => {
      state.domains = ['example.com'];
      return {};
    });
    expect((await begin()).ok).toBe(false);
    state.domains = [];
    const {
      value: { token },
    } = await begin();
    state.domains = ['example.com'];
    expect((await request({ action: 'chunk', token, part: 'original', offset: 0 })).ok).toBe(false);
  });
  it('limits simultaneous openings and allows retry after closing a preview', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, begin));
    expect(results.filter((result) => result.ok)).toHaveLength(8);
    expect(state.read).toHaveBeenCalledTimes(8);
    const token = results.find((result) => result.ok).value.token;
    expect((await request({ action: 'close', token })).ok).toBe(true);
    expect((await begin()).ok).toBe(true);
  });
  it('expires abandoned tokens without exposing bytes', async () => {
    const now = Date.now(),
      {
        value: { token },
      } = await begin();
    vi.spyOn(Date, 'now').mockReturnValue(now + 121_000);
    expect((await request({ action: 'chunk', token, part: 'original', offset: 0 })).ok).toBe(false);
  });
});
