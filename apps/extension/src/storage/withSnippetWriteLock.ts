let pendingWrite: Promise<unknown> = Promise.resolve();

// Web Locks coordinate extension pages sharing the same origin. The queue also
// serializes service instances in tests and environments without Web Locks.
export async function withSnippetWriteLock<T>(
  write: () => Promise<T>,
  requireCrossContext = false
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return await navigator.locks.request('fillin-snippets-write', write);
  }

  if (requireCrossContext || (typeof chrome !== 'undefined' && !!chrome.runtime?.id)) {
    throw new Error('Media storage requires browser write locks. Update Chrome and try again.');
  }

  const result = pendingWrite.then(write);
  pendingWrite = result.catch(() => undefined);
  return result;
}
