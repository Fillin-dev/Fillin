import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_KEY } from './CaptureDrafts';

describe('selection context menu', () => {
  let session: Record<string, unknown>;
  let domains: unknown;
  let api: any;
  let capture: typeof import('./contextMenu');
  const info = { menuItemId: 'fillin-save-selection', selectionText: '<b>Keep {{date}}</b>', pageUrl: 'https://example.com/page', editable: false, frameId: 3 };
  beforeEach(async () => {
    vi.resetModules();
    session = {}; domains = [];
    api = {
      runtime: { id: 'fillin', getURL: (path: string) => `chrome-extension://fillin/${path}`, onMessage: { addListener: vi.fn() }, onInstalled: { addListener: vi.fn() } },
      storage: {
        local: { get: vi.fn((key, respond) => respond({ [key]: domains })) },
        session: { get: vi.fn(async () => structuredClone(session)), set: vi.fn(async (value) => { session = structuredClone(value); }), setAccessLevel: vi.fn(async () => {}) },
      },
      tabs: { sendMessage: vi.fn(async () => ({ allowed: true })), update: vi.fn(async () => {}) },
      windows: { create: vi.fn(async () => ({ id: 7, tabs: [{ id: 9 }] })), remove: vi.fn(async () => {}), onRemoved: { addListener: vi.fn() } },
      contextMenus: { update: vi.fn((_id, _properties, done) => done()), create: vi.fn((_properties, done) => done()), onClicked: { addListener: vi.fn() } },
    };
    vi.stubGlobal('chrome', api);
    capture = await import('./contextMenu');
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('verifies the originating frame, creates a window-bound draft, and sends no selected text in URLs', async () => {
    await capture.captureSelection(info, { id: 2 } as chrome.tabs.Tab);
    expect(api.tabs.sendMessage).toHaveBeenCalledWith(2, { type: 'FILLIN_VERIFY_SELECTION', text: info.selectionText }, { frameId: 3 });
    const drafts = session[CAPTURE_KEY] as Record<string, unknown>;
    const id = Object.keys(drafts)[0];
    expect(drafts[id]).toMatchObject({ text: info.selectionText, windowId: 7 });
    expect(api.tabs.update).toHaveBeenCalledWith(9, { url: `chrome-extension://fillin/src/popup/index.html?capture=${id}` });
    expect(JSON.stringify(api.windows.create.mock.calls)).not.toContain('Keep');
  });

  it.each(['blocked-top', 'blocked-frame', 'invalid-settings', 'read-error', 'changed-selection', 'oversized', 'restricted-url'])(
    'fails closed without storing a selection: %s', async (scenario) => {
      const click = { ...info } as chrome.contextMenus.OnClickData;
      if (scenario === 'blocked-top') domains = ['example.com'];
      if (scenario === 'blocked-frame') { domains = ['blocked.test']; click.frameUrl = 'https://child.blocked.test'; }
      if (scenario === 'invalid-settings') domains = 'broken';
      if (scenario === 'read-error') api.storage.local.get.mockImplementation((_key: string, respond: (r: object) => void) => {
        api.runtime.lastError = { message: 'failed' }; respond({}); api.runtime.lastError = undefined;
      });
      if (scenario === 'changed-selection') api.tabs.sendMessage.mockResolvedValue({ allowed: false });
      if (scenario === 'oversized') click.selectionText = 'a'.repeat(100001);
      if (scenario === 'restricted-url') click.pageUrl = 'chrome://extensions';
      await capture.captureSelection(click, { id: 2 } as chrome.tabs.Tab);
      expect(api.storage.session.set).not.toHaveBeenCalled();
      expect(api.tabs.update).not.toHaveBeenCalled();
      expect(api.windows.create.mock.calls[0][0].url).toContain('captureError=');
    });

  it('cleans up a draft and window when navigation fails', async () => {
    api.tabs.update.mockRejectedValueOnce(new Error('failed'));
    await capture.captureSelection(info, { id: 2 } as chrome.tabs.Tab);
    expect(session[CAPTURE_KEY]).toEqual({});
    expect(api.windows.remove).toHaveBeenCalledWith(7);
  });

  it('accepts only the matching extension editor as a draft reader', () => {
    const id = crypto.randomUUID();
    const url = `chrome-extension://fillin/src/popup/index.html?capture=${id}`;
    expect(capture.captureSenderAllowed({ id: 'fillin', url }, id)).toBe(true);
    for (const sender of [{ id: 'other', url }, { id: 'fillin', url: url.replace('//fillin/', '//other/') }, { id: 'fillin', url: url.replace(id, crypto.randomUUID()) }, { id: 'fillin', url: 'https://example.com/' }, { id: 'fillin', url: 'invalid' }]) {
      expect(capture.captureSenderAllowed(sender, id)).toBe(false);
    }
  });

  it('registers an existing menu without creating duplicates', async () => {
    capture.installCaptureMenu();
    await vi.waitFor(() => expect(api.contextMenus.update).toHaveBeenCalledTimes(1));
    expect(api.contextMenus.create).not.toHaveBeenCalled();
    expect(api.contextMenus.onClicked.addListener).toHaveBeenCalledTimes(1);
    expect(api.storage.session.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
  });

  it('creates the menu on first install and serializes repeated registration', async () => {
    let exists = false;
    api.contextMenus.update.mockImplementation((_id: string, _props: object, done: () => void) => {
      api.runtime.lastError = exists ? undefined : { message: 'missing' }; done(); api.runtime.lastError = undefined;
    });
    api.contextMenus.create.mockImplementation((_props: object, done: () => void) => { exists = true; done(); });
    capture.installCaptureMenu();
    api.runtime.onInstalled.addListener.mock.calls[0][0]();
    await vi.waitFor(() => expect(api.contextMenus.update).toHaveBeenCalledTimes(2));
    expect(api.contextMenus.create).toHaveBeenCalledTimes(1);
  });
});
