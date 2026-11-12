import { Snippet, snippetSchema } from '@fillin/shared';

export const SNIPPET_READ_ERROR =
  'Could not read your saved snippets. Nothing has been changed. Try again.';
export const SNIPPET_DATA_ERROR =
  'Your saved snippets contain invalid data. The original data has been left untouched.';
export const SNIPPET_WRITE_ERROR = 'Could not save your snippets. Try again.';
export const SNIPPET_VERSION_ERROR = 'This library contains a newer snippet format. Update Fillin before changing it. Your data has been left untouched.';

export function validateSnippetLibrary(value: unknown): Snippet[] {
  if (Array.isArray(value) && value.some(item => item && typeof item === 'object' &&
      (('kind' in item && item.kind !== undefined && !['text', 'media'].includes(item.kind)) ||
       ('mediaVersion' in item && item.mediaVersion !== undefined && item.mediaVersion !== 1)))) {
    throw new Error(SNIPPET_VERSION_ERROR);
  }
  const result = snippetSchema.array().safeParse(value);
  if (!result.success) throw new Error(SNIPPET_DATA_ERROR);

  const ids = new Set<string>();
  const triggers = new Set<string>();
  const mediaAssets = new Map<string, string>();
  for (const snippet of result.data) {
    if (ids.has(snippet.id) || triggers.has(snippet.trigger)) {
      throw new Error(SNIPPET_DATA_ERROR);
    }
    ids.add(snippet.id);
    triggers.add(snippet.trigger);
    if (snippet.kind === 'media') {
      const descriptor = JSON.stringify([snippet.mime, snippet.byteSize, snippet.width, snippet.height, snippet.frameCount]);
      const previous = mediaAssets.get(snippet.assetId);
      if (previous !== undefined && previous !== descriptor) throw new Error(SNIPPET_DATA_ERROR);
      mediaAssets.set(snippet.assetId, descriptor);
    }
  }
  return result.data;
}
