import { withStorageWriteLock } from '../storage/withStorageWriteLock';
import { requestStorageUpdate } from '../storage/storageUpdates';

export interface FillinStats {
  keystrokesSaved: number;
  expansionCount: number;
}

export const STATS_STORAGE_KEY = 'fillin_stats';

export class StatsService {
  constructor(private readonly isStorageWriter = false) {}

  private parseStats(value: unknown): FillinStats {
    if (value === undefined) return { keystrokesSaved: 0, expansionCount: 0 };
    const stats = value as Partial<FillinStats> | null;
    if (
      !stats ||
      !Number.isSafeInteger(stats.keystrokesSaved) ||
      stats.keystrokesSaved! < 0 ||
      !Number.isSafeInteger(stats.expansionCount) ||
      stats.expansionCount! < 0
    ) {
      throw new Error(
        'Saved statistics could not be read. Nothing has been changed.'
      );
    }
    return stats as FillinStats;
  }

  async getStats(): Promise<FillinStats> {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.local
    ) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(STATS_STORAGE_KEY, (result) => {
          if (chrome.runtime.lastError)
            return reject(new Error('Could not read saved statistics.'));
          try {
            resolve(this.parseStats(result[STATS_STORAGE_KEY]));
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    try {
      const raw = localStorage.getItem(STATS_STORAGE_KEY);
      return this.parseStats(raw === null ? undefined : JSON.parse(raw));
    } catch {
      throw new Error(
        'Saved statistics could not be read. Nothing has been changed.'
      );
    }
  }

  async recordExpansion(
    triggerLength: number,
    expansionLength: number
  ): Promise<FillinStats> {
    if (
      !this.isStorageWriter &&
      typeof chrome !== 'undefined' &&
      chrome.storage?.local
    ) {
      return requestStorageUpdate<FillinStats>({
        type: 'FILLIN_STORAGE_UPDATE',
        operation: 'recordExpansion',
        triggerLength,
        expansionLength,
      });
    }
    return withStorageWriteLock(STATS_STORAGE_KEY, async () => {
      const saved = Math.max(0, expansionLength - triggerLength);
      const current = await this.getStats();
      const updated: FillinStats = {
        keystrokesSaved: current.keystrokesSaved + saved,
        expansionCount: current.expansionCount + 1,
      };

      if (
        typeof chrome !== 'undefined' &&
        chrome.storage &&
        chrome.storage.local
      ) {
        await new Promise<void>((resolve, reject) => {
          chrome.storage.local.set({ [STATS_STORAGE_KEY]: updated }, () => {
            if (chrome.runtime.lastError)
              return reject(new Error('Could not save statistics.'));
            resolve();
          });
        });
      } else if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          throw new Error('Could not save statistics.');
        }
      }

      return updated;
    });
  }

  formatTimeSaved(keystrokesSaved: number): string {
    // Average typing speed: 40 WPM ~ 200 characters per minute
    const minutes = Math.floor(keystrokesSaved / 200);
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'}`;
    const hours = (minutes / 60).toFixed(1);
    const cleanHours = hours.endsWith('.0') ? hours.slice(0, -2) : hours;
    return `${cleanHours} hr${cleanHours === '1' ? '' : 's'}`;
  }
}

export const statsService = new StatsService();
