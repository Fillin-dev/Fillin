import { StatsService } from '../services/StatsService';
import { BlacklistService } from '../services/BlacklistService';
import {
  isStorageUpdateRequest,
  StorageUpdateResponse,
} from '../storage/storageUpdates';

const stats = new StatsService(true);
const blacklist = new BlacklistService(true);

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (
      !message ||
      typeof message !== 'object' ||
      (message as { type?: unknown }).type !== 'FILLIN_STORAGE_UPDATE'
    )
      return false;
    if (!isStorageUpdateRequest(message)) {
      sendResponse({
        ok: false,
        error: 'Invalid storage update request.',
      } satisfies StorageUpdateResponse);
      return false;
    }

    const update = async (): Promise<unknown> => {
      switch (message.operation) {
        case 'recordExpansion':
          return stats.recordExpansion(
            message.triggerLength,
            message.expansionLength
          );
        case 'setBlacklist':
          return blacklist.setBlacklist(message.domains);
        case 'addDomain':
          return blacklist.addDomain(message.domain);
        case 'removeDomain':
          return blacklist.removeDomain(message.domain);
        case 'toggleDomain':
          return blacklist.toggleDomain(message.domain);
      }
    };
    void update().then(
      (value) =>
        sendResponse({ ok: true, value } satisfies StorageUpdateResponse),
      (error) =>
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Could not update saved settings.',
        } satisfies StorageUpdateResponse)
    );
    // Keep the response channel open until the queued write has finished.
    return true;
  }
);
