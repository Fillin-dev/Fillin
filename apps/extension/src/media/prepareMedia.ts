import { MEDIA_LIMITS, type MediaDescriptor } from '@fillin/shared';
import { inspectMedia } from './inspectMedia';

export type PreparedMedia = MediaDescriptor & { original: Blob; thumbnail: Blob };
export async function mediaHash(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type Decoder = {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(options: {
    frameIndex: number;
    completeFramesOnly: boolean;
  }): Promise<{ image: VideoFrame }>;
  close(): void;
};

export async function prepareMedia(file: Blob, signal?: AbortSignal): Promise<PreparedMedia> {
  const check = () => {
    if (signal?.aborted) throw new Error('Image preparation was cancelled.');
  };
  check();
  if (!file.size || file.size > MEDIA_LIMITS.fileBytes)
    throw new Error('Choose an image between 1 byte and 10 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  check();
  const descriptor = inspectMedia(bytes);
  if (file.type && file.type !== descriptor.mime)
    throw new Error('The file type does not match its contents.');
  const original = new Blob([bytes], { type: descriptor.mime });
  if (descriptor.mime === 'image/gif') {
    const ImageDecoderClass = (
      globalThis as unknown as {
        ImageDecoder?: new (options: { data: ArrayBuffer; type: string }) => Decoder;
      }
    ).ImageDecoder;
    if (!ImageDecoderClass)
      throw new Error('GIF validation is unavailable. Update Chrome and try again.');
    const decoder = new ImageDecoderClass({ data: bytes.buffer, type: descriptor.mime });
    const abort = () => decoder.close();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await decoder.tracks.ready;
      check();
      if (decoder.tracks.selectedTrack?.frameCount !== descriptor.frameCount)
        throw new Error('The GIF frame data is invalid.');
      for (let frameIndex = 0; frameIndex < descriptor.frameCount; frameIndex++) {
        check();
        const { image } = await decoder.decode({ frameIndex, completeFramesOnly: true });
        try {
          if (image.displayWidth !== descriptor.width || image.displayHeight !== descriptor.height)
            throw new Error('Invalid GIF dimensions.');
        } finally {
          image.close();
        }
      }
    } finally {
      signal?.removeEventListener('abort', abort);
      decoder.close();
    }
  }
  check();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(original);
  } catch {
    throw new Error('This image could not be decoded. Choose another file.');
  }
  let thumbnail: Blob;
  try {
    check();
    if (bitmap.width !== descriptor.width || bitmap.height !== descriptor.height)
      throw new Error('The decoded dimensions do not match the image header.');
    const scale = Math.min(1, MEDIA_LIMITS.thumbnailSide / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale))
    );
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preview is unavailable.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    thumbnail = await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    bitmap.close();
  }
  check();
  if (thumbnail.size > MEDIA_LIMITS.thumbnailBytes)
    throw new Error('This image preview exceeds the supported size.');
  const assetId = await mediaHash(original);
  check();
  return { ...descriptor, assetId, byteSize: original.size, original, thumbnail };
}
