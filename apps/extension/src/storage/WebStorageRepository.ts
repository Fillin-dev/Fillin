import { Snippet } from '@fillin/shared';
import { SnippetRepository } from './SnippetRepository';
import {
  validateSnippetLibrary,
  SNIPPET_READ_ERROR,
  SNIPPET_DATA_ERROR,
  SNIPPET_WRITE_ERROR,
} from './validateSnippetLibrary';

const STORAGE_KEY = 'fillin_snippets';

export class WebStorageRepository implements SnippetRepository {
  async getAll(): Promise<Snippet[]> {
    let data: string | null;
    try {
      data = localStorage.getItem(STORAGE_KEY);
    } catch {
      throw new Error(SNIPPET_READ_ERROR);
    }
    if (data === null) return [];

    let value: unknown;
    try {
      value = JSON.parse(data);
    } catch {
      throw new Error(SNIPPET_DATA_ERROR);
    }
    return validateSnippetLibrary(value);
  }

  async save(snippets: Snippet[]): Promise<void> {
    const validated = validateSnippetLibrary(snippets);
    // Never replace a library that cannot currently be read and validated.
    await this.getAll();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
    } catch {
      throw new Error(SNIPPET_WRITE_ERROR);
    }
  }
}
