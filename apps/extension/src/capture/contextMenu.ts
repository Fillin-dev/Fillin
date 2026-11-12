import { BlacklistService } from '../services/BlacklistService';
import { CAPTURE_LIMIT, CaptureDrafts, isCaptureId } from './CaptureDrafts';

export const CAPTURE_MENU = 'fillin-save-selection';
const EDITOR_PATH = 'src/popup/index.html';
const drafts = new CaptureDrafts();
const blacklist = new BlacklistService(true);

export function captureSenderAllowed(sender: chrome.runtime.MessageSender, id: string): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  try {
    const expected = new URL(chrome.runtime.getURL(EDITOR_PATH));
    const actual = new URL(sender.url);
    return actual.protocol === expected.protocol && actual.host === expected.host && actual.pathname === expected.pathname && actual.searchParams.get('capture') === id;
  } catch { return false; }
}

export async function captureSelection(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  if (info.menuItemId !== CAPTURE_MENU) return;
  let id: string | undefined;
  let windowId: number | undefined;
  try {
    const text = info.selectionText;
    if (!text?.trim() || text.length > CAPTURE_LIMIT || tab?.id === undefined) throw new Error('selection');
    const domains = (await blacklist.getBlacklist()).map((domain) => blacklist.normalizeDomain(domain)).filter(Boolean);
    for (const address of [info.pageUrl, info.frameUrl ?? info.pageUrl]) {
      const url = new URL(address ?? '');
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('selection');
      const host = blacklist.normalizeDomain(url.hostname);
      if (domains.some((d) => host === d || host.endsWith('.' + d))) throw new Error('blocked');
    }
    const verified = await chrome.tabs.sendMessage(tab.id, { type: 'FILLIN_VERIFY_SELECTION', text }, { frameId: info.frameId ?? 0 });
    if (verified?.allowed !== true) throw new Error('selection');
    id = await drafts.create(text);
    // Bind the draft to its own window before loading the editor.
    const win = await chrome.windows.create({ url: 'about:blank', type: 'popup', width: 460, height: 750, focused: true });
    windowId = win?.id;
    const tabId = win?.tabs?.[0]?.id;
    if (windowId === undefined || tabId === undefined) throw new Error('window');
    await drafts.bind(id, windowId);
    await chrome.tabs.update(tabId, { url: `${chrome.runtime.getURL(EDITOR_PATH)}?capture=${id}` });
  } catch (error) {
    if (id) await drafts.discard(id).catch(() => undefined);
    if (windowId !== undefined) await chrome.windows.remove(windowId).catch(() => undefined);
    const reason = error instanceof Error && error.message === 'blocked' ? 'blocked' : 'unavailable';
    await chrome.windows.create({ url: `${chrome.runtime.getURL(EDITOR_PATH)}?captureError=${reason}`, type: 'popup', width: 460, height: 600 }).catch(() => undefined);
  }
}

export function installCaptureMenu(): void {
  // Optional guards keep local preview/test environments without extension APIs usable.
  if (!chrome.contextMenus || !chrome.storage.session) return;
  void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);
  let registration = Promise.resolve();
  const register = () => {
    registration = registration.then(() => new Promise<void>((resolve) => {
      const properties = { title: 'Save selection to Fillin', contexts: ['selection'] as ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] };
      chrome.contextMenus.update(CAPTURE_MENU, properties, () => {
        if (!chrome.runtime.lastError) return resolve();
        chrome.contextMenus.create({ id: CAPTURE_MENU, ...properties }, () => {
          void chrome.runtime.lastError;
          resolve();
        });
      });
    }));
  };
  register();
  chrome.runtime.onInstalled.addListener(register);
  chrome.contextMenus.onClicked.addListener((info, tab) => { void captureSelection(info, tab); });
  chrome.windows.onRemoved.addListener((id) => { void drafts.closeWindow(id).catch(() => undefined); });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!['FILLIN_CAPTURE_READ', 'FILLIN_CAPTURE_DISCARD'].includes(message?.type)) return false;
    if (!isCaptureId(message.id) || !Number.isInteger(message.windowId) || !captureSenderAllowed(sender, message.id)) {
      respond({ ok: false, error: 'This selection editor could not be verified.' });
      return false;
    }
    const run = async () => {
      const text = await drafts.get(message.id, message.windowId);
      if (message.type === 'FILLIN_CAPTURE_DISCARD') await drafts.discard(message.id);
      return message.type === 'FILLIN_CAPTURE_READ' ? text : undefined;
    };
    void run().then((text) => respond({ ok: true, text }), () => respond({ ok: false, error: 'This selection is unavailable or has expired. Select the text again, or retry.' }));
    return true;
  });
}
