import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { StatsService as StatsServiceType } from '../services/StatsService';
import type { BlacklistService as BlacklistServiceType } from '../services/BlacklistService';
import type {
  StorageUpdateRequest,
  StorageUpdateResponse,
} from '../storage/storageUpdates';

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (response: StorageUpdateResponse) => void
) => boolean | void;

describe('background storage updates from separate clients', () => {
  let listener: Listener;
  let stats: StatsServiceType[];
  let blacklists: BlacklistServiceType[];
  let stored: Record<string, unknown>;
  let failNextRead: boolean;
  let failNextWrite: boolean;
  let runtime: {
    id: string;
    lastError?: { message: string };
    sendMessage: ReturnType<
      typeof vi.fn<
        [
          StorageUpdateRequest,
          (response: StorageUpdateResponse | undefined) => void,
        ],
        void
      >
    >;
    onMessage: { addListener: (callback: Listener) => void };
  };
  let readCount: number;
  let writeCount: number;
  let keepAlive: (boolean | void)[];

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('navigator', {});
    stored = {};
    failNextRead = failNextWrite = false;
    readCount = writeCount = 0;
    keepAlive = [];
    runtime = {
      id: 'fillin-test',
      onMessage: {
        addListener: (callback) => {
          listener = callback;
        },
      },
      sendMessage: vi.fn(
        (
          request: StorageUpdateRequest,
          respond: (response: StorageUpdateResponse | undefined) => void
        ) => {
          keepAlive.push(listener(request, { id: runtime.id }, respond));
        }
      ),
    };
    vi.stubGlobal('chrome', {
      runtime,
      storage: {
        local: {
          get: (
            key: string,
            respond: (values: Record<string, unknown>) => void
          ) => {
            readCount++;
            const snapshot = structuredClone({ [key]: stored[key] });
            queueMicrotask(() => {
              runtime.lastError = failNextRead
                ? { message: 'Read failed' }
                : undefined;
              failNextRead = false;
              respond(snapshot);
              runtime.lastError = undefined;
            });
          },
          set: (values: Record<string, unknown>, respond: () => void) => {
            writeCount++;
            queueMicrotask(() => {
              runtime.lastError = failNextWrite
                ? { message: 'Write failed' }
                : undefined;
              if (!failNextWrite)
                Object.assign(stored, structuredClone(values));
              failNextWrite = false;
              respond();
              runtime.lastError = undefined;
            });
          },
        },
      },
    });
    const { StatsService } = await import('../services/StatsService');
    const { BlacklistService } = await import('../services/BlacklistService');
    await import('./index');
    stats = [new StatsService(), new StatsService()];
    blacklists = [new BlacklistService(), new BlacklistService()];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('counts every simultaneous expansion through the worker', async () => {
    await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        stats[index % 2].recordExpansion(6, 16)
      )
    );
    expect(stored.fillin_stats).toEqual({
      keystrokesSaved: 500,
      expansionCount: 50,
    });
    expect(runtime.sendMessage).toHaveBeenCalledTimes(50);
    expect(keepAlive).toEqual(Array(50).fill(true));
  });

  it('preserves simultaneous additions and normalizes duplicate domains', async () => {
    await Promise.all([
      blacklists[0].addDomain('https://www.chase.com/login'),
      blacklists[1].addDomain('github.com'),
      blacklists[1].addDomain('chase.com'),
    ]);
    expect(stored.fillin_blacklist).toEqual(['chase.com', 'github.com']);
  });

  it('does not resurrect a removed domain during an addition', async () => {
    await blacklists[0].setBlacklist(['chase.com', 'github.com']);
    await Promise.all([
      blacklists[0].removeDomain('chase.com'),
      blacklists[1].addDomain('bank.org'),
    ]);
    expect(stored.fillin_blacklist).toEqual(['github.com', 'bank.org']);
  });

  it('serializes the read and write of toggles together', async () => {
    const results = await Promise.all([
      blacklists[0].toggleDomain('chase.com'),
      blacklists[1].toggleDomain('chase.com'),
    ]);
    expect(results.map((result) => result.blacklisted)).toEqual([true, false]);
    expect(stored.fillin_blacklist).toEqual([]);
  });

  it('queues explicit replacement before a later addition', async () => {
    await Promise.all([
      blacklists[0].setBlacklist(['github.com']),
      blacklists[1].addDomain('bank.org'),
    ]);
    expect(stored.fillin_blacklist).toEqual(['github.com', 'bank.org']);
  });

  it.each(['stats', 'blacklist'])(
    'continues queued %s updates after a failed write',
    async (kind) => {
      failNextWrite = true;
      const results = await Promise.allSettled(
        kind === 'stats'
          ? [stats[0].recordExpansion(6, 16), stats[1].recordExpansion(4, 24)]
          : [
              blacklists[0].addDomain('failed.com'),
              blacklists[1].addDomain('saved.com'),
            ]
      );
      expect(results.map((result) => result.status)).toEqual([
        'rejected',
        'fulfilled',
      ]);
      expect(
        kind === 'stats' ? stored.fillin_stats : stored.fillin_blacklist
      ).toEqual(
        kind === 'stats'
          ? { keystrokesSaved: 20, expansionCount: 1 }
          : ['saved.com']
      );
    }
  );

  it.each(['stats', 'blacklist'])(
    'preserves existing %s on a failed read',
    async (kind) => {
      stored = {
        fillin_stats: { keystrokesSaved: 100, expansionCount: 10 },
        fillin_blacklist: ['keep.com'],
      };
      const before = structuredClone(stored);
      failNextRead = true;
      await expect(
        kind === 'stats'
          ? stats[0].recordExpansion(6, 16)
          : blacklists[0].addDomain('new.com')
      ).rejects.toThrow('Could not read');
      expect(stored).toEqual(before);
      expect(writeCount).toBe(0);
    }
  );

  it('rejects malformed requests before reading or writing storage', () => {
    const respond = vi.fn();
    for (const request of [
      { operation: 'recordExpansion', triggerLength: -1, expansionLength: 10 },
      { operation: 'addDomain', domain: 123 },
      { operation: 'setBlacklist', domains: ['valid.com', 123] },
      { operation: 'unknown' },
    ]) {
      expect(
        listener(
          { type: 'FILLIN_STORAGE_UPDATE', ...request },
          { id: runtime.id },
          respond
        )
      ).toBe(false);
    }
    expect(respond).toHaveBeenCalledTimes(4);
    expect(readCount).toBe(0);
    expect(writeCount).toBe(0);
  });

  it('ignores messages from other extensions', () => {
    const respond = vi.fn();
    expect(
      listener(
        {
          type: 'FILLIN_STORAGE_UPDATE',
          operation: 'addDomain',
          domain: 'bad.com',
        },
        { id: 'other-extension' },
        respond
      )
    ).toBe(false);
    expect(respond).not.toHaveBeenCalled();
    expect(writeCount).toBe(0);
  });

  it('does not write locally when the worker is unavailable', async () => {
    runtime.sendMessage.mockImplementation((_request, respond) => {
      runtime.lastError = { message: 'Worker unavailable' };
      respond(undefined);
      runtime.lastError = undefined;
    });
    await expect(stats[0].recordExpansion(6, 16)).rejects.toThrow(
      'Reload the extension'
    );
    await expect(blacklists[0].addDomain('bank.org')).rejects.toThrow(
      'Reload the extension'
    );
    expect(writeCount).toBe(0);
  });
});
