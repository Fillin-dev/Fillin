import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_KEY, CAPTURE_TTL, CaptureDrafts } from './CaptureDrafts';

describe('temporary selection drafts', () => {
  let data: Record<string, unknown>;
  let get: ReturnType<typeof vi.fn<[], Promise<Record<string, unknown>>>>;
  let set: ReturnType<typeof vi.fn<[Record<string, unknown>], Promise<void>>>;
  let clock: number;
  let store: CaptureDrafts;
  beforeEach(() => {
    data = {}; clock = 1000;
    get = vi.fn(async () => structuredClone(data));
    set = vi.fn(async (next) => { data = structuredClone(next); });
    vi.stubGlobal('chrome', { storage: { session: { get, set } } });
    store = new CaptureDrafts(() => clock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('keeps independent drafts through worker restarts and binds each to its editor', async () => {
    const ids = await Promise.all([store.create('First'), store.create('Second')]);
    await Promise.all(ids.map((id, index) => store.bind(id, index + 1)));
    const restarted = new CaptureDrafts(() => clock);
    expect(await restarted.get(ids[0], 1)).toBe('First');
    expect(await restarted.get(ids[1], 2)).toBe('Second');
    await expect(restarted.get(ids[0], 2)).rejects.toThrow('expired');
    await restarted.closeWindow(1);
    await expect(restarted.get(ids[0], 1)).rejects.toThrow();
    expect(await restarted.get(ids[1], 2)).toBe('Second');
  });
  it('does not replace unreadable or corrupt stored drafts', async () => {
    data[CAPTURE_KEY] = { original: 'corrupt' };
    await expect(store.create('New')).rejects.toThrow('read');
    expect(set).not.toHaveBeenCalled();
    expect(data[CAPTURE_KEY]).toEqual({ original: 'corrupt' });
    get.mockRejectedValueOnce(new Error('read failed'));
    await expect(store.create('New')).rejects.toThrow('read failed');
    expect(set).not.toHaveBeenCalled();
  });
  it('preserves the previous drafts on failed writes and allows a retry', async () => {
    const id = await store.create('Keep');
    await store.bind(id, 1);
    set.mockRejectedValueOnce(new Error('write failed'));
    await expect(store.discard(id)).rejects.toThrow('write failed');
    expect(await store.get(id, 1)).toBe('Keep');
    await store.discard(id);
    await expect(store.get(id, 1)).rejects.toThrow();
  });
  it('expires selections and reclaims space without evicting active drafts', async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => store.create('Keep')));
    await store.bind(ids[0], 1);
    await expect(store.create('Sixth')).rejects.toThrow('Close');
    expect(await store.get(ids[0], 1)).toBe('Keep');
    clock += CAPTURE_TTL;
    await expect(store.get(ids[0], 1)).rejects.toThrow('expired');
    await store.create('Fresh');
    expect(Object.keys(data[CAPTURE_KEY] as object)).toHaveLength(1);
  });
  it('rejects empty and oversized selections without altering drafts', async () => {
    await expect(store.create(' ')).rejects.toThrow();
    await expect(store.create('a'.repeat(100001))).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });
});
