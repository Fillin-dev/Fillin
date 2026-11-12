// Test-only entry: bundled into a temporary extension, never a production build.
import { MediaSnippetService } from '../src/services/MediaSnippetService';
import { SnippetService } from '../src/services/SnippetService';
import { ChromeStorageRepository } from '../src/storage/ChromeStorageRepository';
import { IndexedDbMediaAssetRepository } from '../src/storage/MediaAssetRepository';
import { prepareMedia, mediaHash } from '../src/media/prepareMedia';

const snippets = new ChromeStorageRepository();
const assets = new IndexedDbMediaAssetRepository();
let now = Date.now();
Object.assign(globalThis, {
  foundation: {
    snippets, assets, media: new MediaSnippetService(snippets, assets, () => now), text: new SnippetService(snippets),
    prepareMedia, mediaHash, setNow: (value: number) => { now = value; },
    async file(format: string) {
      if (format === 'gif') {
        const hex = '47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b';
        return new Blob([Uint8Array.from(hex.match(/../g)!, value => parseInt(value, 16))], { type: 'image/gif' });
      }
      const response = await fetch(chrome.runtime.getURL('icon48.png'));
      if (!response.ok) throw new Error('Cannot load test icon');
      const png = await response.blob();
      if (format === 'png') return png;
      const bitmap = await createImageBitmap(png);
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        return await canvas.convertToBlob({ type: 'image/jpeg' });
      } finally { bitmap.close(); }
    },
  },
});
document.body.dataset.ready = 'true';
