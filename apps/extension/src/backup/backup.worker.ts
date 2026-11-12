import { decodeBackup, encodeBackup } from './codec';
import type { PreparedMedia } from '../media/prepareMedia';
import type { Snippet } from '@fillin/shared';

self.onmessage = async (
  event: MessageEvent<
    | { action: 'read'; file: Blob }
    | { action: 'write'; snippets: Snippet[]; assets: PreparedMedia[] }
  >
) => {
  try {
    const request = event.data;
    const result =
      request.action === 'read'
        ? await decodeBackup(request.file)
        : await encodeBackup(request.snippets, request.assets);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Could not process the backup. Your library has not been changed.',
    });
  }
};
