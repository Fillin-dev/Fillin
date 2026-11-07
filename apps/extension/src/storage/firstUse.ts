export const FIRST_USE_KEY = 'fillin_first_use';
type FirstUseStatus = 'active' | 'done';

export async function readFirstUse(): Promise<FirstUseStatus | undefined> {
  const value: unknown = typeof chrome !== 'undefined' && chrome.storage?.local
    ? (await chrome.storage.local.get(FIRST_USE_KEY))[FIRST_USE_KEY]
    : localStorage.getItem(FIRST_USE_KEY) ?? undefined;
  if (value !== undefined && value !== 'active' && value !== 'done') {
    throw new Error('Invalid guide progress');
  }
  return value;
}

export async function saveFirstUse(status: FirstUseStatus): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [FIRST_USE_KEY]: status });
    } else {
      localStorage.setItem(FIRST_USE_KEY, status);
    }
  } catch {
    throw new Error('Could not save your guide progress. Please try again.');
  }
}
