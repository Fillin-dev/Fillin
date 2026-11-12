import { type MediaSnippet, mediaDescriptorSchema } from '@fillin/shared';
import { MediaSnippetService } from '../services/MediaSnippetService';
import { ChromeStorageRepository } from '../storage/ChromeStorageRepository';
import { IndexedDbMediaAssetRepository, type AssetRecord } from '../storage/MediaAssetRepository';
import { BlacklistService } from '../services/BlacklistService';
import { bytesToBase64, MEDIA_CHUNK_BYTES } from '../media/transfer';
import { mediaHash } from '../media/prepareMedia';

const lifetime = 120_000;
type Transfer = { owner: string; snippet: MediaSnippet; asset: AssetRecord; expires: number };
export function installMediaTransfer() {
  const transfers = new Map<string, Transfer>();
  let opening = 0;
  chrome.tabs?.onRemoved?.addListener((tabId) => {
    for (const [key, transfer] of transfers)
      if (transfer.owner.startsWith(`${tabId}:`)) transfers.delete(key);
  });
  const repository = new ChromeStorageRepository();
  const service = new MediaSnippetService(repository, new IndexedDbMediaAssetRepository());
  const blacklist = new BlacklistService(true);
  const owner = (sender: chrome.runtime.MessageSender) =>
    `${sender.tab?.id}:${sender.frameId}:${sender.documentId || sender.url}`;
  const permitted = async (sender: chrome.runtime.MessageSender) => {
    if (
      sender.id !== chrome.runtime.id ||
      !Number.isInteger(sender.tab?.id) ||
      typeof sender.url !== 'string' ||
      !/^https?:\/\//.test(sender.url)
    )
      throw new Error('This page cannot request saved media.');
    const domains = await blacklist.getBlacklist();
    for (const url of [sender.url, sender.tab?.url].filter(Boolean)) {
      const host = new URL(url!).hostname.toLowerCase().replace(/^www\./, '');
      if (domains.some((domain) => host === domain || host.endsWith('.' + domain)))
        throw new Error('Fillin is paused on this website.');
    }
  };
  chrome.runtime.onMessage.addListener((value: unknown, sender, respond) => {
    if (
      !value ||
      typeof value !== 'object' ||
      (value as { type?: unknown }).type !== 'FILLIN_MEDIA'
    )
      return false;
    const request = value as Record<string, unknown>;
    void (async () => {
      await permitted(sender);
      const now = Date.now();
      for (const [key, transfer] of transfers) if (transfer.expires <= now) transfers.delete(key);
      if (request.action === 'begin') {
        if (
          typeof request.id !== 'string' ||
          request.id.length > 200 ||
          !Number.isSafeInteger(request.revision) ||
          transfers.size + opening >= 8
        )
          throw new Error('Invalid image request or too many open previews. Close one and retry.');
        opening++;
        try {
          const snippet = (await repository.getAll()).find((snippet) => snippet.id === request.id);
          if (!snippet || snippet.kind !== 'media' || snippet.updatedAt !== request.revision)
            throw new Error('The image snippet changed or was removed. Start again.');
          const asset = await service.readSelected(snippet);
          // Recheck policy after asynchronous IO, before exposing any bytes.
          await permitted(sender);
          const token = crypto.randomUUID();
          transfers.set(token, {
            owner: owner(sender),
            snippet,
            asset,
            expires: Date.now() + lifetime,
          });
          return {
            token,
            descriptor: mediaDescriptorSchema.parse(asset),
            thumbnailSize: asset.thumbnail.size,
            thumbnailHash: await mediaHash(asset.thumbnail),
          };
        } finally {
          opening--;
        }
      }
      if (typeof request.token !== 'string') throw new Error('Invalid image transfer.');
      const transfer = transfers.get(request.token);
      if (!transfer || transfer.owner !== owner(sender))
        throw new Error('This image preview expired. Close it and try again.');
      if (request.action === 'close') {
        transfers.delete(request.token);
        return null;
      }
      const current = (await repository.getAll()).find(
        (snippet) => snippet.id === transfer.snippet.id
      );
      if (!current || JSON.stringify(current) !== JSON.stringify(transfer.snippet)) {
        transfers.delete(request.token);
        throw new Error('The image snippet changed. Start again.');
      }
      if (request.action === 'check') {
        transfer.expires = Date.now() + lifetime;
        return null;
      }
      if (
        request.action !== 'chunk' ||
        !['original', 'thumbnail'].includes(String(request.part)) ||
        !Number.isSafeInteger(request.offset) ||
        (request.offset as number) < 0
      )
        throw new Error('Invalid image chunk request.');
      const blob = transfer.asset[request.part as 'original' | 'thumbnail'];
      const offset = request.offset as number;
      if (offset >= blob.size || offset % MEDIA_CHUNK_BYTES !== 0)
        throw new Error('Invalid image chunk offset.');
      const bytes = new Uint8Array(
        await blob.slice(offset, offset + MEDIA_CHUNK_BYTES).arrayBuffer()
      );
      await permitted(sender);
      return { offset, data: bytesToBase64(bytes) };
    })().then(
      (value) => respond({ ok: true, value }),
      (error) =>
        respond({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not load saved media.',
        })
    );
    return true;
  });
}
