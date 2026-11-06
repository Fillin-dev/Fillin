const pendingWrites = new Map<string, Promise<unknown>>();

export async function withStorageWriteLock<T>(
  key: string,
  write: () => Promise<T>
): Promise<T> {
  // The background worker is the sole Chrome-storage writer. Web Locks also
  // coordinate same-origin tabs when running the localStorage preview.
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return await navigator.locks.request(`fillin-${key}-write`, write);
  }
  const result = (pendingWrites.get(key) ?? Promise.resolve()).then(write);
  const settled = result.catch(() => undefined);
  pendingWrites.set(key, settled);
  void settled.then(() => {
    if (pendingWrites.get(key) === settled) pendingWrites.delete(key);
  });
  return result;
}
