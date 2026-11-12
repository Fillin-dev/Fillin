import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { Blob as NodeBlob } from 'node:buffer';
import { createBackupZip, inspectZip, extractZipEntry } from './zip';

const encoded = () => zipSync({ 'manifest.json': strToU8('{"test":true}') });
const centralOffset = (bytes: Uint8Array) =>
  new DataView(bytes.buffer).getUint32(bytes.length - 6, true);
describe('bounded portable backup ZIPs', () => {
  beforeEach(() => {
    vi.stubGlobal('Blob', NodeBlob);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('reads compressed and streaming stored archives with exact CRCs', async () => {
    const compressed = encoded(),
      entry = inspectZip(compressed)[0];
    expect(new TextDecoder().decode(extractZipEntry(compressed, entry))).toBe('{"test":true}');
    const blob = await createBackupZip([
      { name: 'manifest.json', blob: new Blob(['{"stored":true}']) },
    ]);
    const stored = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(extractZipEntry(stored, inspectZip(stored)[0]))).toBe(
      '{"stored":true}'
    );
  });
  it('refuses duplicate names, traversal, unexpected files and nested archives', async () => {
    for (const name of [
      '../manifest.json',
      'media/../../secret',
      'extra.zip',
      'images/photo.png',
    ]) {
      expect(() =>
        inspectZip(zipSync({ 'manifest.json': strToU8('{}'), [name]: strToU8('bad') }))
      ).toThrow();
    }
    const duplicate = await createBackupZip([
      { name: 'manifest.json', blob: new Blob(['{}']) },
      { name: 'manifest.json', blob: new Blob(['{}']) },
    ]);
    const bytes = new Uint8Array(await duplicate.arrayBuffer());
    expect(() => inspectZip(bytes)).toThrow();
  });
  it('rejects every truncated prefix', () => {
    const full = encoded();
    for (let length = 0; length < full.length; length++)
      expect(() => inspectZip(full.slice(0, length))).toThrow();
  });
  it('rejects encrypted entries, symlinks, unsupported methods and oversized declarations before extraction', () => {
    for (const mutation of ['encrypted', 'symlink', 'method', 'size']) {
      const bytes = encoded(),
        view = new DataView(bytes.buffer),
        central = centralOffset(bytes);
      if (mutation === 'encrypted') view.setUint16(central + 8, 1, true);
      if (mutation === 'symlink') view.setUint32(central + 38, 0xa1ff0000, true);
      if (mutation === 'method') view.setUint16(central + 10, 12, true);
      if (mutation === 'size') view.setUint32(central + 24, 100 * 1024 * 1024, true);
      expect(() => inspectZip(bytes)).toThrow();
    }
  });
  it('rejects corrupt checksums, forged local sizes and decompression beyond declarations', () => {
    const crc = encoded(),
      crcView = new DataView(crc.buffer),
      central = centralOffset(crc);
    crcView.setUint32(central + 16, 7, true);
    crcView.setUint32(14, 7, true);
    expect(() => extractZipEntry(crc, inspectZip(crc)[0])).toThrow(/CRC/);
    const local = encoded();
    new DataView(local.buffer).setUint32(22, 100, true);
    expect(() => inspectZip(local)).toThrow();
    const bomb = zipSync({ 'manifest.json': new Uint8Array(1024 * 1024) });
    const view = new DataView(bomb.buffer);
    view.setUint32(centralOffset(bomb) + 24, 4, true);
    view.setUint32(22, 4, true);
    expect(() => extractZipEntry(bomb, inspectZip(bomb)[0])).toThrow(/declared size/);
  });
});
