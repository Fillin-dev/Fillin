export type StorageUpdateRequest =
  | { type: 'FILLIN_STORAGE_UPDATE'; operation: 'setSuggestions'; enabled: boolean }
  | {
      type: 'FILLIN_STORAGE_UPDATE';
      operation: 'recordExpansion';
      triggerLength: number;
      expansionLength: number;
    }
  | {
      type: 'FILLIN_STORAGE_UPDATE';
      operation: 'setBlacklist';
      domains: string[];
    }
  | {
      type: 'FILLIN_STORAGE_UPDATE';
      operation: 'addDomain' | 'removeDomain' | 'toggleDomain';
      domain: string;
    };

export type StorageUpdateResponse =
  { ok: true; value: unknown } | { ok: false; error: string };

export function requestStorageUpdate<T>(
  request: StorageUpdateRequest
): Promise<T> {
  return new Promise((resolve, reject) => {
    // Never fall back to a direct write if messaging fails: that would bypass
    // the worker's queue and reintroduce cross-tab lost updates.
    if (!chrome.runtime?.sendMessage) {
      reject(
        new Error(
          'Could not update saved settings. Reload the extension and try again.'
        )
      );
      return;
    }
    chrome.runtime.sendMessage(
      request,
      (response: StorageUpdateResponse | undefined) => {
        if (chrome.runtime.lastError || !response) {
          reject(
            new Error(
              'Could not update saved settings. Reload the extension and try again.'
            )
          );
        } else if (!response.ok) {
          reject(new Error(response.error));
        } else {
          resolve(response.value as T);
        }
      }
    );
  });
}

export function isStorageUpdateRequest(
  value: unknown
): value is StorageUpdateRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  if (request.type !== 'FILLIN_STORAGE_UPDATE') return false;
  switch (request.operation) {
    case 'setSuggestions':
      return typeof request.enabled === 'boolean';
    case 'recordExpansion':
      return (
        typeof request.triggerLength === 'number' &&
        Number.isSafeInteger(request.triggerLength) &&
        request.triggerLength >= 0 &&
        typeof request.expansionLength === 'number' &&
        Number.isSafeInteger(request.expansionLength) &&
        request.expansionLength >= 0
      );
    case 'setBlacklist':
      return (
        Array.isArray(request.domains) &&
        request.domains.every((domain) => typeof domain === 'string')
      );
    case 'addDomain':
    case 'removeDomain':
    case 'toggleDomain':
      return typeof request.domain === 'string';
    default:
      return false;
  }
}
