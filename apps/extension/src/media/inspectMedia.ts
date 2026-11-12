import { MEDIA_LIMITS, type MediaMime } from '@fillin/shared';

export type MediaInspection = {
  mime: MediaMime;
  width: number;
  height: number;
  frameCount: number;
};
const invalid = () =>
  new Error('This image is damaged or uses an unsupported format. Choose a PNG, JPEG or GIF.');

/** Bounded structural checks before asking a browser decoder to allocate pixels. */
export function inspectMedia(bytes: Uint8Array): MediaInspection {
  if (!bytes.length || bytes.length > MEDIA_LIMITS.fileBytes)
    throw new Error('Choose an image between 1 byte and 10 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (offset: number, count: number) => {
    if (offset < 0 || offset + count > bytes.length) throw invalid();
  };
  const u16 = (offset: number) => {
    need(offset, 2);
    return view.getUint16(offset);
  };
  const u32 = (offset: number) => {
    need(offset, 4);
    return view.getUint32(offset);
  };
  const ascii = (offset: number, length: number) => {
    need(offset, length);
    return String.fromCharCode(...bytes.subarray(offset, offset + length));
  };
  const dimensions = (width: number, height: number, frames = 1) => {
    if (
      !width ||
      !height ||
      width > MEDIA_LIMITS.dimension ||
      height > MEDIA_LIMITS.dimension ||
      width * height > MEDIA_LIMITS.pixels ||
      frames > MEDIA_LIMITS.frames ||
      width * height * frames > MEDIA_LIMITS.decodedPixels
    )
      throw new Error('This image exceeds Fillin’s dimensions or animation budget.');
    return { width, height, frameCount: frames };
  };
  if (bytes.length >= 8 && u32(0) === 0x89504e47 && u32(4) === 0x0d0a1a0a) {
    let offset = 8,
      width = 0,
      height = 0,
      data = false;
    while (offset < bytes.length) {
      need(offset, 12);
      const length = u32(offset),
        type = ascii(offset + 4, 4);
      need(offset + 8, length + 4);
      // CRC protects headers and compressed data from accidental corruption.
      let crc = 0xffffffff;
      for (let i = offset + 4; i < offset + 8 + length; i++) {
        crc ^= bytes[i];
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      if ((crc ^ 0xffffffff) >>> 0 !== u32(offset + 8 + length)) throw invalid();
      if (offset === 8 && type !== 'IHDR') throw invalid();
      if (type === 'IHDR') {
        if (width || length !== 13) throw invalid();
        width = u32(offset + 8);
        height = u32(offset + 12);
        dimensions(width, height);
      }
      if (type === 'acTL')
        throw new Error('Animated PNG is not supported yet. Choose a GIF instead.');
      if (type === 'IDAT') data = true;
      offset += 12 + length;
      if (type === 'IEND') {
        if (length || !data || offset !== bytes.length) throw invalid();
        return { mime: 'image/png', ...dimensions(width, height) };
      }
    }
    throw invalid();
  }
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) {
    need(6, 7);
    const width = view.getUint16(6, true),
      height = view.getUint16(8, true);
    dimensions(width, height);
    let offset = 13,
      frames = 0;
    if (bytes[10] & 0x80) offset += 3 * (1 << ((bytes[10] & 7) + 1));
    need(0, offset);
    const blocks = () => {
      for (;;) {
        need(offset, 1);
        const size = bytes[offset++];
        if (!size) return;
        need(offset, size);
        offset += size;
      }
    };
    while (offset < bytes.length) {
      const marker = bytes[offset++];
      if (marker === 0x3b) {
        if (!frames || offset !== bytes.length) throw invalid();
        return { mime: 'image/gif', ...dimensions(width, height, frames) };
      }
      if (marker === 0x21) {
        need(offset, 1);
        const label = bytes[offset++];
        if (label === 0xf9) {
          need(offset, 6);
          if (bytes[offset] !== 4 || bytes[offset + 5] !== 0) throw invalid();
          offset += 6;
        } else if (label === 0xff || label === 0xfe) {
          if (label === 0xff) {
            need(offset, 1);
            if (bytes[offset] !== 11) throw invalid();
          }
          blocks();
        } else throw invalid();
      } else if (marker === 0x2c) {
        need(offset, 9);
        const left = view.getUint16(offset, true),
          top = view.getUint16(offset + 2, true);
        const w = view.getUint16(offset + 4, true),
          h = view.getUint16(offset + 6, true);
        if (!w || !h || left + w > width || top + h > height) throw invalid();
        const packed = bytes[offset + 8];
        offset += 9;
        if (packed & 0x80) offset += 3 * (1 << ((packed & 7) + 1));
        need(offset, 1);
        if (bytes[offset] < 2 || bytes[offset] > 8) throw invalid();
        offset++;
        blocks();
        dimensions(width, height, ++frames);
      } else throw invalid();
    }
    throw invalid();
  }
  if (bytes.length >= 4 && u16(0) === 0xffd8) {
    if (u16(bytes.length - 2) !== 0xffd9) throw invalid();
    let offset = 2,
      width = 0,
      height = 0;
    while (offset < bytes.length - 2) {
      if (bytes[offset++] !== 0xff) throw invalid();
      while (bytes[offset] === 0xff) offset++;
      need(offset, 1);
      const marker = bytes[offset++];
      const length = u16(offset);
      if (length < 2) throw invalid();
      need(offset, length);
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8) throw invalid();
        height = u16(offset + 3);
        width = u16(offset + 5);
        dimensions(width, height);
      }
      if (marker === 0xda) {
        if (!width) throw invalid();
        return { mime: 'image/jpeg', ...dimensions(width, height) };
      }
      offset += length;
    }
  }
  throw invalid();
}
