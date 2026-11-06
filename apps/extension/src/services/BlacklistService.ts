import { withStorageWriteLock } from '../storage/withStorageWriteLock';
import { requestStorageUpdate } from '../storage/storageUpdates';

export class BlacklistService {
  constructor(private readonly isStorageWriter = false) {}

  private storageKey = 'fillin_blacklist';

  private parseBlacklist(value: unknown): string[] {
    if (value === undefined) return [];
    if (
      !Array.isArray(value) ||
      !value.every((domain) => typeof domain === 'string')
    ) {
      throw new Error(
        'Blocked websites could not be read. Nothing has been changed.'
      );
    }
    return value;
  }

  public normalizeDomain(input: string): string {
    let clean = input.trim().toLowerCase();
    // Remove protocol
    clean = clean.replace(/^[a-zA-Z]+:\/\//, '');
    // Remove path, query, hash
    clean = clean.split('/')[0].split('?')[0].split('#')[0];
    // Remove port if any
    clean = clean.split(':')[0];
    // Remove leading www.
    clean = clean.replace(/^www\./, '');
    return clean;
  }

  public async getBlacklist(): Promise<string[]> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(this.storageKey, (res) => {
          if (chrome.runtime.lastError)
            return reject(new Error('Could not read blocked websites.'));
          try {
            resolve(this.parseBlacklist(res[this.storageKey]));
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    try {
      const data = localStorage.getItem(this.storageKey);
      return this.parseBlacklist(data === null ? undefined : JSON.parse(data));
    } catch {
      throw new Error(
        'Blocked websites could not be read. Nothing has been changed.'
      );
    }
  }

  public async setBlacklist(domains: string[]): Promise<void> {
    if (
      !this.isStorageWriter &&
      typeof chrome !== 'undefined' &&
      chrome.storage?.local
    ) {
      return requestStorageUpdate<void>({
        type: 'FILLIN_STORAGE_UPDATE',
        operation: 'setBlacklist',
        domains,
      });
    }
    return withStorageWriteLock(this.storageKey, () =>
      this.saveBlacklist(domains)
    );
  }

  private async saveBlacklist(domains: string[]): Promise<void> {
    const unique = Array.from(
      new Set(domains.map((d) => this.normalizeDomain(d)).filter(Boolean))
    );

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [this.storageKey]: unique }, () => {
          if (chrome.runtime.lastError)
            return reject(new Error('Could not save blocked websites.'));
          resolve();
        });
      });
    }

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(unique));
    } catch {
      throw new Error('Could not save blocked websites.');
    }
  }

  public async addDomain(rawDomain: string): Promise<string[]> {
    if (
      !this.isStorageWriter &&
      typeof chrome !== 'undefined' &&
      chrome.storage?.local
    ) {
      return requestStorageUpdate<string[]>({
        type: 'FILLIN_STORAGE_UPDATE',
        operation: 'addDomain',
        domain: rawDomain,
      });
    }
    return withStorageWriteLock(this.storageKey, async () => {
      const domain = this.normalizeDomain(rawDomain);
      if (!domain) return this.getBlacklist();

      const list = await this.getBlacklist();
      if (!list.includes(domain)) {
        const updated = [...list, domain];
        await this.saveBlacklist(updated);
        return updated;
      }
      return list;
    });
  }

  public async removeDomain(rawDomain: string): Promise<string[]> {
    if (
      !this.isStorageWriter &&
      typeof chrome !== 'undefined' &&
      chrome.storage?.local
    ) {
      return requestStorageUpdate<string[]>({
        type: 'FILLIN_STORAGE_UPDATE',
        operation: 'removeDomain',
        domain: rawDomain,
      });
    }
    return withStorageWriteLock(this.storageKey, async () => {
      const domain = this.normalizeDomain(rawDomain);
      const list = await this.getBlacklist();
      const updated = list.filter((d) => d !== domain);
      await this.saveBlacklist(updated);
      return updated;
    });
  }

  public async isDomainBlacklisted(rawDomain: string): Promise<boolean> {
    const domain = this.normalizeDomain(rawDomain);
    if (!domain) return false;

    const list = await this.getBlacklist();
    return list.some((d) => domain === d || domain.endsWith('.' + d));
  }

  public async toggleDomain(
    rawDomain: string
  ): Promise<{ blacklisted: boolean; list: string[] }> {
    if (
      !this.isStorageWriter &&
      typeof chrome !== 'undefined' &&
      chrome.storage?.local
    ) {
      return requestStorageUpdate<{ blacklisted: boolean; list: string[] }>({
        type: 'FILLIN_STORAGE_UPDATE',
        operation: 'toggleDomain',
        domain: rawDomain,
      });
    }
    return withStorageWriteLock(this.storageKey, async () => {
      const domain = this.normalizeDomain(rawDomain);
      const list = await this.getBlacklist();
      const isBlocked = (domains: string[]) =>
        domains.some((d) => domain === d || domain.endsWith('.' + d));
      const updated = !domain
        ? list
        : isBlocked(list)
          ? list.filter((d) => d !== domain)
          : [...list, domain];
      await this.saveBlacklist(updated);
      return { blacklisted: isBlocked(updated), list: updated };
    });
  }
}

export const blacklistService = new BlacklistService();
