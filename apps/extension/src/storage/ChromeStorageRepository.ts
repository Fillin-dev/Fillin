import { Snippet } from '@fillin/shared';
import { SnippetRepository } from './SnippetRepository';
import {
  validateSnippetLibrary,
  SNIPPET_READ_ERROR,
  SNIPPET_WRITE_ERROR,
} from './validateSnippetLibrary';

const STORAGE_KEY = 'fillin_snippets';

export class ChromeStorageRepository implements SnippetRepository {
  async getAll(): Promise<Snippet[]> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      throw new Error(SNIPPET_READ_ERROR);
    }

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(SNIPPET_READ_ERROR));
        }
        try {
          const value = result[STORAGE_KEY];
          resolve(validateSnippetLibrary(value === undefined ? [] : value));
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async save(snippets: Snippet[]): Promise<void> {
    const validated = validateSnippetLibrary(snippets);
    await this.getAll();

    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEY]: validated }, () => {
        if (chrome.runtime.lastError) {
          return reject(new Error(SNIPPET_WRITE_ERROR));
        }
        resolve();
      });
    });
  }
}
