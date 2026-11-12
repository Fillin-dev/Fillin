import { z } from 'zod';

export const MEDIA_LIMITS = Object.freeze({
  fileBytes: 10 * 1024 * 1024,
  libraryBytes: 50 * 1024 * 1024,
  dimension: 8192,
  pixels: 12_000_000,
  frames: 300,
  decodedPixels: 200_000_000,
  thumbnailSide: 256,
  thumbnailBytes: 128 * 1024,
  caption: 2000,
  alt: 300,
});
export const mediaMimeSchema = z.enum(['image/png', 'image/jpeg', 'image/gif']);
export const assetIdSchema = z.string().regex(/^[a-f0-9]{64}$/, 'Invalid media checksum.');
export const mediaDescriptorSchema = z.object({
  assetId: assetIdSchema,
  mime: mediaMimeSchema,
  byteSize: z.number().int().positive().max(MEDIA_LIMITS.fileBytes),
  width: z.number().int().positive().max(MEDIA_LIMITS.dimension),
  height: z.number().int().positive().max(MEDIA_LIMITS.dimension),
  frameCount: z.number().int().positive().max(MEDIA_LIMITS.frames),
}).superRefine((value, context) => {
  if (value.width * value.height > MEDIA_LIMITS.pixels ||
      value.width * value.height * value.frameCount > MEDIA_LIMITS.decodedPixels ||
      (value.mime !== 'image/gif' && value.frameCount !== 1)) {
    context.addIssue({ code: 'custom', message: 'Media exceeds the supported decoding budget.' });
  }
});
export type MediaDescriptor = z.infer<typeof mediaDescriptorSchema>;
export type MediaMime = z.infer<typeof mediaMimeSchema>;

export function mediaFilename(name: string, mime: MediaMime): string {
  const extension = mime === 'image/jpeg' ? 'jpg' : mime.slice(6);
  const basename = name.split(/[\\/]/).pop() || 'image';
  const stem = basename.replace(/\.[^.]*$/, '').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim().replace(/^\.+|\.+$/g, '').slice(0, 100);
  return `${stem || 'image'}.${extension}`;
}
