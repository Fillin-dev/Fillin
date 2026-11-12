import type { PreparedMedia } from '../media/prepareMedia';
import type { Snippet } from '@fillin/shared';
import type { PreparedBackup } from './codec';

function run<T>(request: unknown, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Backup cancelled.'));
      return;
    }
    const worker = new Worker(new URL('./backup.worker.ts', import.meta.url), { type: 'module' });
    let done = false;
    const finish = (error?: Error, result?: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () => finish(new Error('Backup cancelled. Your library has not been changed.'));
    const timer = setTimeout(
      () => finish(new Error('This backup took too long. Try a smaller backup.')),
      120_000
    );
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = worker.onmessageerror = () =>
      finish(new Error('Could not process this backup. Your library has not been changed.'));
    worker.onmessage = (event) =>
      event.data?.ok
        ? finish(undefined, event.data.result)
        : finish(new Error(event.data?.error || 'Invalid backup.'));
    try {
      worker.postMessage(request);
    } catch {
      finish(new Error('Could not open this backup.'));
    }
  });
}
export const prepareBackup = (file: Blob, signal?: AbortSignal) =>
  run<PreparedBackup>({ action: 'read', file }, signal);
export const writeBackup = (snippets: Snippet[], assets: PreparedMedia[], signal?: AbortSignal) =>
  run<Blob>({ action: 'write', snippets, assets }, signal);
