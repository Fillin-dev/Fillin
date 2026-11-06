import { Snippet, snippetSchema } from '@fillin/shared';

export const SNIPPET_READ_ERROR =
  'Could not read your saved snippets. Nothing has been changed. Try again.';
export const SNIPPET_DATA_ERROR =
  'Your saved snippets contain invalid data. The original data has been left untouched.';
export const SNIPPET_WRITE_ERROR = 'Could not save your snippets. Try again.';

export function validateSnippetLibrary(value: unknown): Snippet[] {
  const result = snippetSchema.array().safeParse(value);
  if (!result.success) throw new Error(SNIPPET_DATA_ERROR);

  const ids = new Set<string>();
  const triggers = new Set<string>();
  for (const snippet of result.data) {
    if (ids.has(snippet.id) || triggers.has(snippet.trigger)) {
      throw new Error(SNIPPET_DATA_ERROR);
    }
    ids.add(snippet.id);
    triggers.add(snippet.trigger);
  }
  return result.data;
}
