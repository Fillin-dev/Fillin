import { withStorageWriteLock } from '../storage/withStorageWriteLock';

export const CAPTURE_KEY = 'fillin_capture_drafts';
export const CAPTURE_LIMIT = 100_000;
export const CAPTURE_TTL = 10 * 60 * 1000;
export const isCaptureId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
interface Draft { text: string; expiresAt: number; windowId: number | null }
type Drafts = Record<string, Draft>;

// Only the worker writes these drafts. Session storage survives worker restarts,
// but never persists the selected text across browser restarts.
export class CaptureDrafts {
  constructor(private readonly now = () => Date.now()) {}

  private async read(): Promise<Drafts> {
    const data = (await chrome.storage.session.get(CAPTURE_KEY))[CAPTURE_KEY];
    if (data === undefined) return {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Temporary drafts could not be read.');
    for (const [id, draft] of Object.entries(data)) {
      const d = draft as Draft;
      if (!isCaptureId(id) || !d || typeof d.text !== 'string' || !d.text.trim() ||
        d.text.length > CAPTURE_LIMIT || !Number.isFinite(d.expiresAt) ||
        !(d.windowId === null || Number.isInteger(d.windowId))) {
        throw new Error('Temporary drafts could not be read.');
      }
    }
    return data;
  }

  private update<T>(operation: (drafts: Drafts) => T): Promise<T> {
    return withStorageWriteLock(CAPTURE_KEY, async () => {
      const drafts = await this.read();
      for (const id of Object.keys(drafts)) if (drafts[id].expiresAt <= this.now()) delete drafts[id];
      const result = operation(drafts);
      await chrome.storage.session.set({ [CAPTURE_KEY]: drafts });
      return result;
    });
  }

  create(text: string): Promise<string> {
    return this.update((drafts) => {
      if (!text.trim() || text.length > CAPTURE_LIMIT) throw new Error('Select a smaller piece of text.');
      if (Object.keys(drafts).length >= 5) throw new Error('Close an open selection editor first.');
      const id = crypto.randomUUID();
      drafts[id] = { text, expiresAt: this.now() + CAPTURE_TTL, windowId: null };
      return id;
    });
  }

  bind(id: string, windowId: number): Promise<void> {
    return this.update((drafts) => {
      if (!drafts[id]) throw new Error('This selection has expired.');
      drafts[id].windowId = windowId;
    });
  }

  async get(id: string, windowId: number): Promise<string> {
    const draft = (await this.read())[id];
    if (!draft || draft.windowId !== windowId || draft.expiresAt <= this.now()) {
      throw new Error('This selection has expired. Select the text again on the webpage.');
    }
    return draft.text;
  }

  discard(id: string): Promise<void> { return this.update((drafts) => { delete drafts[id]; }); }
  closeWindow(windowId: number): Promise<void> {
    return this.update((drafts) => {
      for (const id of Object.keys(drafts)) if (drafts[id].windowId === windowId) delete drafts[id];
    });
  }
}
