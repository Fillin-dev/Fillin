import { type MediaDescriptor, mediaDescriptorSchema, assetIdSchema } from '@fillin/shared';
import type { PreparedMedia } from '../media/prepareMedia';
import { mediaHash } from '../media/prepareMedia';

export type AssetRecord = PreparedMedia & { createdAt: number };
export type AssetLease = { id: string; assetIds: string[]; expiresAt: number };
export interface MediaAssetRepository {
  read(id: string): Promise<AssetRecord | undefined>;
  stage(asset: AssetRecord): Promise<void>;
  restore?(asset: AssetRecord): Promise<void>;
  inventory(): Promise<{ descriptor: MediaDescriptor; createdAt: number }[]>;
  pin(lease: AssetLease): Promise<void>;
  release(id: string): Promise<void>;
  collect(referenced: string[], olderThan: number, now: number): Promise<number>;
}

const DATABASE = 'fillin-media-v1';
const ASSETS = 'assets', LEASES = 'leases';
const storageError = () => new Error('Could not access saved media. Your snippets have not been changed. Try again.');

function assetRecord(value: unknown): AssetRecord {
  if (!value || typeof value !== 'object') throw storageError();
  const record = value as AssetRecord;
  const descriptor = mediaDescriptorSchema.safeParse(value);
  if (!descriptor.success || !(record.original instanceof Blob) || !(record.thumbnail instanceof Blob) ||
      record.original.size !== descriptor.data.byteSize || record.original.type !== descriptor.data.mime ||
      !Number.isFinite(record.createdAt) || record.createdAt < 0 || record.thumbnail.type !== 'image/png' ||
      !record.thumbnail.size || record.thumbnail.size > 128 * 1024) throw storageError();
  return { ...descriptor.data, original: record.original, thumbnail: record.thumbnail, createdAt: record.createdAt };
}

/** Internal store. Mutations and lease acquisition must use the library lock. */
export class IndexedDbMediaAssetRepository implements MediaAssetRepository {
  private async open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') throw storageError();
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = () => { settled = true; clearTimeout(timer); reject(storageError()); };
      const timer = setTimeout(fail, 10_000);
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        if (settled) { request.transaction?.abort(); return; }
        request.result.createObjectStore(ASSETS, { keyPath: 'assetId' });
        request.result.createObjectStore(LEASES, { keyPath: 'id' });
      };
      request.onblocked = request.onerror = fail;
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) { request.result.close(); return; }
        settled = true; request.result.onversionchange = () => request.result.close(); resolve(request.result);
      };
    });
  }

  private async transaction<T>(stores: string[], mode: IDBTransactionMode, enqueue: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
    const db = await this.open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(stores, mode); let value: T;
        tx.oncomplete = () => resolve(value);
        tx.onabort = tx.onerror = () => reject(storageError());
        try { enqueue(tx, result => { value = result; }); }
        catch (error) { tx.abort(); reject(error); }
      });
    } finally { db.close(); }
  }

  async read(id: string): Promise<AssetRecord | undefined> {
    const value = await this.transaction<unknown>([ASSETS], 'readonly', (tx, result) => {
      const request = tx.objectStore(ASSETS).get(id); request.onsuccess = () => result(request.result);
    });
    return value === undefined ? undefined : assetRecord(value);
  }

  async stage(asset: AssetRecord): Promise<void> {
    const validated = assetRecord(asset);
    // add is intentional: an existing immutable original is never overwritten.
    await this.transaction<void>([ASSETS], 'readwrite', tx => { tx.objectStore(ASSETS).add(validated); });
  }

  /** Explicit restore only: bytes must match the immutable content address. */
  async restore(asset: AssetRecord): Promise<void> {
    const validated = assetRecord(asset);
    if (await mediaHash(validated.original) !== validated.assetId) throw storageError();
    await this.transaction<void>([ASSETS], 'readwrite', tx => { tx.objectStore(ASSETS).put(validated); });
  }

  async inventory(): Promise<{ descriptor: MediaDescriptor; createdAt: number }[]> {
    const records = await this.transaction<unknown[]>([ASSETS], 'readonly', (tx, result) => {
      const request = tx.objectStore(ASSETS).getAll(); request.onsuccess = () => result(request.result);
    });
    return records.map(value => {
      const descriptor = mediaDescriptorSchema.safeParse(value);
      const createdAt = (value as { createdAt?: number })?.createdAt;
      if (!descriptor.success || typeof createdAt !== 'number' || !Number.isFinite(createdAt)) throw storageError();
      return { descriptor: descriptor.data, createdAt };
    });
  }

  async pin(lease: AssetLease): Promise<void> {
    await this.transaction<void>([LEASES], 'readwrite', tx => { tx.objectStore(LEASES).put(lease); });
  }
  async release(id: string): Promise<void> {
    await this.transaction<void>([LEASES], 'readwrite', tx => { tx.objectStore(LEASES).delete(id); });
  }

  async collect(referenced: string[], olderThan: number, now: number): Promise<number> {
    return this.transaction<number>([ASSETS, LEASES], 'readwrite', (tx, result) => {
      const keep = new Set(referenced); let deleted = 0;
      const leases = tx.objectStore(LEASES).getAll();
      leases.onsuccess = () => {
        for (const lease of leases.result as AssetLease[]) {
          // Unknown/corrupt lease state fails closed: preserve all assets.
          if (!lease || !Number.isFinite(lease.expiresAt) || !Array.isArray(lease.assetIds) ||
              !lease.assetIds.every(id => typeof id === 'string')) { tx.abort(); return; }
          if (lease.expiresAt > now) lease.assetIds.forEach(id => keep.add(id));
          else tx.objectStore(LEASES).delete(lease.id);
        }
        const cursor = tx.objectStore(ASSETS).openCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (!item) { result(deleted); return; }
          const value = item.value as AssetRecord;
          if (!Number.isFinite(value.createdAt) || value.createdAt < 0 || !assetIdSchema.safeParse(value.assetId).success) { tx.abort(); return; }
          if (!keep.has(value.assetId) && value.createdAt < olderThan) { item.delete(); deleted++; }
          item.continue();
        };
      };
    });
  }
}
