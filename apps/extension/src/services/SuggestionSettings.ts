import { requestStorageUpdate } from '../storage/storageUpdates';
import { withStorageWriteLock } from '../storage/withStorageWriteLock';

export const SUGGESTIONS_KEY = 'fillin_suggestions_enabled';
export function parseSuggestions(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean')
    throw new Error('Could not read suggestion settings. Nothing was changed.');
  return value;
}
export class SuggestionSettings {
  constructor(private writer = false) {}
  async get(): Promise<boolean> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve, reject) =>
        chrome.storage.local.get(SUGGESTIONS_KEY, (result) => {
          if (chrome.runtime.lastError)
            return reject(new Error('Could not read suggestion settings.'));
          try {
            resolve(parseSuggestions(result[SUGGESTIONS_KEY]));
          } catch (error) {
            reject(error);
          }
        })
      );
    }
    const raw = localStorage.getItem(SUGGESTIONS_KEY);
    return parseSuggestions(raw === null ? undefined : JSON.parse(raw));
  }
  async set(enabled: boolean): Promise<void> {
    if (typeof enabled !== 'boolean') throw new Error('Invalid suggestion setting.');
    if (!this.writer && typeof chrome !== 'undefined' && chrome.storage?.local) {
      return requestStorageUpdate({
        type: 'FILLIN_STORAGE_UPDATE',
        operation: 'setSuggestions',
        enabled,
      });
    }
    return withStorageWriteLock(SUGGESTIONS_KEY, async () => {
      // Validate the previous value before replacing it; a failed read is not an empty setting.
      await this.get();
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await new Promise<void>((resolve, reject) =>
          chrome.storage.local.set({ [SUGGESTIONS_KEY]: enabled }, () => {
            if (chrome.runtime.lastError) reject(new Error('Could not save suggestion settings.'));
            else resolve();
          })
        );
      } else localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(enabled));
    });
  }
}
export const suggestionSettings = new SuggestionSettings();
