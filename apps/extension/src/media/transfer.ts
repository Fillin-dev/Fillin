import { MEDIA_LIMITS, mediaDescriptorSchema } from '@fillin/shared';
import type { MediaSnippet } from '@fillin/shared';
import { mediaHash } from './prepareMedia';
import type { AssetRecord } from '../storage/MediaAssetRepository';

export const MEDIA_CHUNK_BYTES = 256 * 1024;
export type MediaRequest =
  | { type: 'FILLIN_MEDIA'; action: 'begin'; id: string; revision: number }
  | {
      type: 'FILLIN_MEDIA';
      action: 'chunk';
      token: string;
      part: 'original' | 'thumbnail';
      offset: number;
    }
  | { type: 'FILLIN_MEDIA'; action: 'close' | 'check'; token: string };
export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  for (let start = 0; start < bytes.length; start += 8192)
    output += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(output);
}
export function requestMedia<T>(request: MediaRequest, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error?: Error, value?: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(value!);
    };
    const abort = () => finish(new Error('Image preview was cancelled.'));
    const timer = setTimeout(
      () => finish(new Error('The image transfer timed out. Close the preview and try again.')),
      10_000
    );
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    try {
      chrome.runtime.sendMessage(
        request,
        (response: { ok: boolean; value?: T; error?: string } | undefined) => {
          if (chrome.runtime.lastError || !response)
            finish(new Error('Could not read the image. Reload Fillin and try again.'));
          else if (!response.ok) finish(new Error(response.error || 'The image is unavailable.'));
          else finish(undefined, response.value);
        }
      );
    } catch {
      finish(new Error('Could not read the image. Reload Fillin and try again.'));
    }
  });
}

export async function transferSelectedMedia(
  snippet: MediaSnippet,
  signal: AbortSignal,
  valid: () => boolean = () => true
): Promise<{ asset: AssetRecord; check: () => Promise<void>; close: () => void }> {
  let token: string | undefined;
  const close = () => {
    if (token) void requestMedia({ type: 'FILLIN_MEDIA', action: 'close', token }).catch(() => {});
  };
  try {
    const begun = await requestMedia<{
      token: string;
      descriptor: unknown;
      thumbnailSize: number;
      thumbnailHash: string;
    }>({ type: 'FILLIN_MEDIA', action: 'begin', id: snippet.id, revision: snippet.updatedAt });
    token = begun.token;
    const descriptor = mediaDescriptorSchema.parse(begun.descriptor);
    if (
      typeof token !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(token) ||
      descriptor.assetId !== snippet.assetId ||
      descriptor.byteSize !== snippet.byteSize ||
      descriptor.mime !== snippet.mime ||
      descriptor.width !== snippet.width ||
      descriptor.height !== snippet.height ||
      descriptor.frameCount !== snippet.frameCount ||
      !Number.isInteger(begun.thumbnailSize) ||
      begun.thumbnailSize <= 0 ||
      begun.thumbnailSize > MEDIA_LIMITS.thumbnailBytes ||
      !/^[a-f0-9]{64}$/.test(begun.thumbnailHash)
    )
      throw new Error('The image transfer metadata is invalid.');
    if (signal.aborted || !valid()) throw new Error('Image preview was cancelled.');
    const read = async (
      part: 'original' | 'thumbnail',
      size: number,
      mime: string,
      hash: string
    ) => {
      const chunks: BlobPart[] = [];
      let offset = 0;
      while (offset < size) {
        if (!valid()) throw new Error('The original field changed. Start again.');
        const result = await requestMedia<{ offset: number; data: string }>(
          { type: 'FILLIN_MEDIA', action: 'chunk', token: token!, part, offset },
          signal
        );
        if (
          result.offset !== offset ||
          typeof result.data !== 'string' ||
          result.data.length > Math.ceil(MEDIA_CHUNK_BYTES / 3) * 4 + 4
        )
          throw new Error('Invalid image chunk.');
        const bytes = Uint8Array.from(atob(result.data), (byte) => byte.charCodeAt(0));
        if (bytes.length !== Math.min(MEDIA_CHUNK_BYTES, size - offset))
          throw new Error('Incomplete image transfer.');
        chunks.push(bytes);
        offset += bytes.length;
      }
      const blob = new Blob(chunks, { type: mime });
      if (signal.aborted || (await mediaHash(blob)) !== hash)
        throw new Error('The image transfer was cancelled or failed its checksum.');
      return blob;
    };
    const thumbnail = await read(
      'thumbnail',
      begun.thumbnailSize,
      'image/png',
      begun.thumbnailHash
    );
    const original = await read(
      'original',
      descriptor.byteSize,
      descriptor.mime,
      descriptor.assetId
    );
    return {
      asset: { ...descriptor, thumbnail, original, createdAt: 0 },
      close,
      check: async () => {
        await requestMedia({ type: 'FILLIN_MEDIA', action: 'check', token: token! }, signal);
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}
