import { prepareMedia } from './prepareMedia';

self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    self.postMessage({ ok: true, prepared: await prepareMedia(event.data) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Could not prepare this image.',
    });
  }
};
