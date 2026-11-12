import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareMediaInWorker } from './prepareMediaClient';

class FakeWorker {
  static last: FakeWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    FakeWorker.last = this;
  }
}
describe('image preparation worker lifecycle', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('terminates cancelled work promptly and ignores a late worker result', async () => {
    const controller = new AbortController();
    const pending = prepareMediaInWorker(new Blob(['image']), controller.signal);
    const assertion = expect(pending).rejects.toThrow('cancelled');
    controller.abort();
    await assertion;
    expect(FakeWorker.last.terminate).toHaveBeenCalledTimes(1);
    FakeWorker.last.onmessage?.({ data: { ok: false, error: 'Late reply' } });
    expect(FakeWorker.last.terminate).toHaveBeenCalledTimes(1);
  });
  it('rejects an invalid result, releases the worker and allows retry', async () => {
    const file = new Blob(['image']);
    const pending = prepareMediaInWorker(file);
    const assertion = expect(pending).rejects.toThrow('invalid');
    FakeWorker.last.onmessage?.({ data: { ok: true, prepared: {} } });
    await assertion;
    expect(FakeWorker.last.terminate).toHaveBeenCalledTimes(1);
    const retry = prepareMediaInWorker(file);
    const rejection = expect(retry).rejects.toThrow('unavailable image');
    FakeWorker.last.onmessage?.({
      data: { ok: false, error: 'unavailable image' },
    });
    await rejection;
  });
  it('times out without leaving a decoding worker running', async () => {
    const pending = prepareMediaInWorker(new Blob(['image']));
    const assertion = expect(pending).rejects.toThrow('too long');
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(FakeWorker.last.terminate).toHaveBeenCalledTimes(1);
  });
  it('reuses a validated result for the same file without decoding it twice', async () => {
    const file = new Blob(['image']);
    const thumbnail = new Blob(['poster'], { type: 'image/png' });
    const prepared = {
      assetId: 'a'.repeat(64),
      mime: 'image/png',
      byteSize: file.size,
      width: 1,
      height: 1,
      frameCount: 1,
      original: new Blob(['image'], { type: 'image/png' }),
      thumbnail,
    };
    const pending = prepareMediaInWorker(file);
    FakeWorker.last.onmessage?.({ data: { ok: true, prepared } });
    expect(await pending).toBe(prepared);
    const worker = FakeWorker.last;
    expect(await prepareMediaInWorker(file)).toBe(prepared);
    expect(FakeWorker.last).toBe(worker);
  });
});
