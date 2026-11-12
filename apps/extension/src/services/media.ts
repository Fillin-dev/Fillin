import { snippetRepository } from '../storage/repository';
import { IndexedDbMediaAssetRepository } from '../storage/MediaAssetRepository';
import { MediaSnippetService } from './MediaSnippetService';
import { prepareMediaInWorker } from '../media/prepareMediaClient';

export const mediaAssets = new IndexedDbMediaAssetRepository();
export const mediaSnippetService = new MediaSnippetService(
  snippetRepository,
  mediaAssets,
  undefined,
  prepareMediaInWorker
);
