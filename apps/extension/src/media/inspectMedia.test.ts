import { describe, expect, it } from 'vitest';
import { inspectMedia } from './inspectMedia';
import { readFileSync } from 'node:fs';

export const gifBytes = () =>
  Uint8Array.from(
    '47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b'.match(
      /../g
    )!,
    (value) => parseInt(value, 16)
  );

describe('bounded image inspection before decoding', () => {
  it('recognizes a real PNG and a two-frame GIF', () => {
    const png = new Uint8Array(readFileSync('public/icon48.png'));
    expect(inspectMedia(png)).toEqual({ mime: 'image/png', width: 48, height: 48, frameCount: 1 });
    expect(inspectMedia(gifBytes())).toEqual({
      mime: 'image/gif',
      width: 1,
      height: 1,
      frameCount: 2,
    });
    png[20] ^= 1;
    expect(() => inspectMedia(png)).toThrow();
  });
  it('rejects every truncated prefix without running a decoder', () => {
    const gif = gifBytes();
    for (let length = 0; length < gif.length; length++)
      expect(() => inspectMedia(gif.slice(0, length))).toThrow();
  });
  it.each([
    new Uint8Array(),
    new Uint8Array(10 * 1024 * 1024 + 1),
    new TextEncoder().encode('<svg onload="alert(1)"></svg>'),
    new TextEncoder().encode('<html><img src=x></html>'),
  ])('rejects empty, oversized or active-content files', (bytes) => {
    expect(() => inspectMedia(bytes)).toThrow();
  });
  it('bounds GIF dimensions, frames, cumulative canvas pixels and subblocks', () => {
    const oversized = gifBytes();
    oversized[6] = 255;
    oversized[7] = 255;
    expect(() => inspectMedia(oversized)).toThrow(/budget/);
    const source = gifBytes();
    const animation = (count: number, side = 1) => {
      const bytes = new Uint8Array(38 + 23 * count + 1);
      bytes.set(source.slice(0, 38));
      const view = new DataView(bytes.buffer);
      view.setUint16(6, side, true);
      view.setUint16(8, side, true);
      for (let frame = 0; frame < count; frame++) bytes.set(source.slice(38, 61), 38 + 23 * frame);
      bytes[bytes.length - 1] = 0x3b;
      return bytes;
    };
    expect(inspectMedia(animation(300)).frameCount).toBe(300);
    expect(() => inspectMedia(animation(301))).toThrow(/budget/);
    expect(() => inspectMedia(animation(21, 3200))).toThrow(/budget/);
    const broken = gifBytes();
    broken[57] = 255;
    expect(() => inspectMedia(broken)).toThrow();
  });
});
