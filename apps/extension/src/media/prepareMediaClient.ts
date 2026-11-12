import { mediaDescriptorSchema, MEDIA_LIMITS } from '@fillin/shared';
import type { PreparedMedia } from './prepareMedia';

const cache = new WeakMap<Blob, PreparedMedia>();
export function prepareMediaInWorker(file: Blob, signal?: AbortSignal): Promise<PreparedMedia> {
  if (signal?.aborted) return Promise.reject(new Error('Image preparation was cancelled.'));
  const cached = cache.get(file);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./prepareMedia.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      reject(new Error('Image preparation is unavailable. Reload Fillin and try again.'));
      return;
    }
    let finished = false;
    const finish = (error?: Error, prepared?: PreparedMedia) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (error) reject(error);
      else {
        cache.set(file, prepared!);
        resolve(prepared!);
      }
    };
    const abort = () => finish(new Error('Image preparation was cancelled.'));
    const timeout = setTimeout(
      () => finish(new Error('This image took too long to prepare. Try a smaller file.')),
      30_000
    );
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = () =>
      finish(new Error('Could not prepare this image. Reload Fillin and try again.'));
    worker.onmessageerror = () =>
      finish(new Error('Could not read the prepared image. Try again.'));
    worker.onmessage = (event: MessageEvent) => {
      if (!event.data?.ok) {
        finish(
          new Error(
            typeof event.data?.error === 'string'
              ? event.data.error
              : 'Could not prepare this image.'
          )
        );
        return;
      }
      const prepared = event.data.prepared as PreparedMedia;
      if (
        !mediaDescriptorSchema.safeParse(prepared).success ||
        !(prepared.original instanceof Blob) ||
        !(prepared.thumbnail instanceof Blob) ||
        prepared.original.size !== file.size ||
        prepared.original.type !== prepared.mime ||
        !prepared.thumbnail.size ||
        prepared.thumbnail.size > MEDIA_LIMITS.thumbnailBytes
      ) {
        finish(new Error('The prepared image is invalid. Choose the file again.'));
        return;
      }
      finish(undefined, prepared);
    };
    try {
      worker.postMessage(file);
    } catch {
      finish(new Error('Could not send the image for preparation. Choose the file again.'));
    }
  });
}
