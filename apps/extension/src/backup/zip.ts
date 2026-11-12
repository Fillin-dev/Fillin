import { Inflate, Zip, ZipPassThrough } from 'fflate';
import { BACKUP_LIMITS, MEDIA_LIMITS } from '@fillin/shared';

export type ZipEntry = {
  name: string;
  method: number;
  crc: number;
  size: number;
  compressed: number;
  offset: number;
  start: number;
  flags: number;
};
const invalid = () =>
  new Error('This ZIP is invalid or unsupported. Your library has not been changed.');
const table = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
export function crc32(bytes: Uint8Array, initial = 0xffffffff): number {
  let crc = initial;
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255];
  return crc >>> 0;
}

/** Validate the directory AND local layout before allocating inflated output. */
export function inspectZip(bytes: Uint8Array): ZipEntry[] {
  if (bytes.length < 22 || bytes.length > BACKUP_LIMITS.bytes) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (offset: number, count: number) => {
    if (!Number.isSafeInteger(offset) || offset < 0 || count < 0 || offset + count > bytes.length)
      throw invalid();
  };
  const u16 = (offset: number) => {
    need(offset, 2);
    return view.getUint16(offset, true);
  };
  const u32 = (offset: number) => {
    need(offset, 4);
    return view.getUint32(offset, true);
  };
  let eocd = bytes.length - 22;
  while (
    eocd >= Math.max(0, bytes.length - 65557) &&
    (u32(eocd) !== 0x06054b50 || eocd + 22 + u16(eocd + 20) !== bytes.length)
  )
    eocd--;
  if (eocd < Math.max(0, bytes.length - 65557)) throw invalid();
  const count = u16(eocd + 10),
    centralSize = u32(eocd + 12),
    central = u32(eocd + 16);
  if (
    u16(eocd + 4) ||
    u16(eocd + 6) ||
    u16(eocd + 8) !== count ||
    !count ||
    count > BACKUP_LIMITS.entries ||
    central + centralSize !== eocd
  )
    throw invalid();
  const entries: ZipEntry[] = [],
    names = new Set<string>();
  let cursor = central,
    total = 0;
  const nameAt = (offset: number, length: number) => {
    need(offset, length);
    return new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(offset, offset + length)
    );
  };
  const extras = (offset: number, length: number) => {
    const end = offset + length;
    need(offset, length);
    while (offset < end) {
      if (offset + 4 > end || u16(offset) === 1) throw invalid();
      const size = u16(offset + 2);
      offset += 4 + size;
      if (offset > end) throw invalid();
    }
  };
  for (let index = 0; index < count; index++) {
    need(cursor, 46);
    if (u32(cursor) !== 0x02014b50) throw invalid();
    const flags = u16(cursor + 8),
      method = u16(cursor + 10),
      crc = u32(cursor + 16),
      compressed = u32(cursor + 20),
      size = u32(cursor + 24);
    const length = u16(cursor + 28),
      extra = u16(cursor + 30),
      comment = u16(cursor + 32),
      offset = u32(cursor + 42);
    const name = nameAt(cursor + 46, length),
      mode = (u32(cursor + 38) >>> 16) & 0xf000;
    if (
      flags & ~(0x800 | 8 | 6) ||
      ![0, 8].includes(method) ||
      u16(cursor + 34) ||
      ![0, 0x8000].includes(mode) ||
      !/^(manifest\.json|media\/[a-f0-9]{64}\.(png|jpg|gif))$/.test(name) ||
      names.has(name) ||
      size > (name === 'manifest.json' ? BACKUP_LIMITS.manifestBytes : MEDIA_LIMITS.fileBytes) ||
      !size ||
      compressed > BACKUP_LIMITS.bytes
    )
      throw invalid();
    total += size;
    if (total > BACKUP_LIMITS.bytes)
      throw new Error('This backup exceeds the expanded size limit.');
    names.add(name);
    extras(cursor + 46 + length, extra);
    entries.push({ name, method, crc, size, compressed, offset, start: 0, flags });
    cursor += 46 + length + extra + comment;
    if (cursor > eocd) throw invalid();
  }
  if (cursor !== eocd || !names.has('manifest.json')) throw invalid();
  cursor = 0;
  for (const entry of [...entries].sort((a, b) => a.offset - b.offset)) {
    const offset = entry.offset;
    need(offset, 30);
    if (
      offset !== cursor ||
      u32(offset) !== 0x04034b50 ||
      u16(offset + 6) !== entry.flags ||
      u16(offset + 8) !== entry.method
    )
      throw invalid();
    const length = u16(offset + 26),
      extra = u16(offset + 28);
    if (nameAt(offset + 30, length) !== entry.name) throw invalid();
    extras(offset + 30 + length, extra);
    entry.start = offset + 30 + length + extra;
    cursor = entry.start + entry.compressed;
    if (cursor > central) throw invalid();
    if (!(entry.flags & 8)) {
      if (
        u32(offset + 14) !== entry.crc ||
        u32(offset + 18) !== entry.compressed ||
        u32(offset + 22) !== entry.size
      )
        throw invalid();
    } else {
      if (u32(cursor) === 0x08074b50) cursor += 4;
      if (
        u32(cursor) !== entry.crc ||
        u32(cursor + 4) !== entry.compressed ||
        u32(cursor + 8) !== entry.size
      )
        throw invalid();
      cursor += 12;
    }
  }
  if (cursor !== central) throw invalid();
  return entries;
}

export function extractZipEntry(bytes: Uint8Array, entry: ZipEntry): Uint8Array<ArrayBuffer> {
  let length = 0,
    checksum = 0xffffffff;
  const chunks: Uint8Array[] = [];
  const receive = (chunk: Uint8Array) => {
    length += chunk.length;
    if (length > entry.size) throw new Error('Expanded ZIP content exceeded its declared size.');
    checksum = crc32(chunk, checksum);
    chunks.push(chunk.slice());
  };
  const compressed = bytes.subarray(entry.start, entry.start + entry.compressed);
  if (entry.method === 0) receive(compressed);
  else {
    const inflater = new Inflate(receive);
    // Small compressed input slices bound one expansion burst before callbacks.
    for (let offset = 0; offset < compressed.length; offset += 1024)
      inflater.push(compressed.subarray(offset, offset + 1024), offset + 1024 >= compressed.length);
  }
  if (length !== entry.size || (checksum ^ 0xffffffff) >>> 0 !== entry.crc)
    throw new Error('A backup entry failed its size or CRC check.');
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export async function createBackupZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const parts: BlobPart[] = [];
  let size = 0,
    error: Error | undefined;
  const zip = new Zip((failure, chunk) => {
    if (failure) {
      error = failure;
      return;
    }
    size += chunk.length;
    if (size > BACKUP_LIMITS.bytes) {
      error = new Error('The backup exceeds the supported size.');
      return;
    }
    parts.push(chunk.slice().buffer);
  });
  for (const file of files) {
    if (error) throw error;
    const entry = new ZipPassThrough(file.name);
    zip.add(entry);
    entry.push(new Uint8Array(await file.blob.arrayBuffer()), true);
  }
  zip.end();
  if (error) throw error;
  return new Blob(parts, { type: 'application/zip' });
}
