import { describe, expect, it } from 'vitest';
import { mediaSnippetSchema, snippetSchema } from './snippet.js';
import { mediaFilename } from './media.js';

const media = {
  kind: 'media', mediaVersion: 1, content: '', id: 'image', trigger: '/image',
  assetId: 'a'.repeat(64), mime: 'image/png', byteSize: 123, width: 100, height: 50, frameCount: 1,
  originalFilename: 'example.png', caption: 'A literal {{name}} <caption>', alt: 'Example', createdAt: 1, updatedAt: 1,
};
describe('media metadata', () => {
  it('round-trips media and legacy text without changing literal captions', () => {
    expect(snippetSchema.parse(media)).toEqual(media);
    const text = { id: 'text', trigger: '/text', content: '', createdAt: 1, updatedAt: 1 };
    expect(snippetSchema.parse(text)).toEqual(text);
  });
  it.each([
    { kind: 'video' }, { mediaVersion: 2 }, { kind: undefined }, { content: '<img>' },
    { isHtml: true }, { isHtml: false }, { templateVersion: 1 }, { editAfterInsert: false },
    { assetId: '../image' }, { mime: 'image/svg+xml' }, { byteSize: 0 }, { byteSize: 10 * 1024 * 1024 + 1 },
    { width: 0 }, { width: 8193 }, { width: 4000, height: 4000 }, { frameCount: 2 },
    { mime: 'image/gif', frameCount: 301 }, { mime: 'image/gif', width: 4000, height: 3000, frameCount: 17 },
    { originalFilename: '../../image.png' }, { caption: 'a'.repeat(2001) }, { alt: 'a'.repeat(301) },
  ])('rejects invalid or incompatible records: %j', updates => {
    expect(snippetSchema.safeParse({ ...media, ...updates }).success).toBe(false);
  });
  it('rejects unknown media fields and does not downgrade media to text', () => {
    expect(mediaSnippetSchema.safeParse({ ...media, remoteUrl: 'https://example.com' }).success).toBe(false);
    expect(snippetSchema.safeParse({ ...media, kind: 'text' }).success).toBe(false);
  });
  it('normalizes filenames without saving paths or trusting extensions', () => {
    expect(mediaFilename('C:\\private\\weird<script>.gif', 'image/png')).toBe('weirdscript.png');
    expect(mediaFilename('../../.gif', 'image/gif')).toBe('image.gif');
    expect(mediaFilename('my-photo.JPG', 'image/jpeg')).toBe('my-photo.jpg');
  });
});
