import { ChromeStorageRepository } from './ChromeStorageRepository';
import { WebStorageRepository } from './WebStorageRepository';

export const snippetRepository =
  typeof chrome !== 'undefined' && chrome.storage
    ? new ChromeStorageRepository()
    : new WebStorageRepository();
