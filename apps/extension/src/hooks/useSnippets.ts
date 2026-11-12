import { useState, useEffect, useCallback, useRef } from 'react';
import { Snippet, TemplateOptions } from '@fillin/shared';
import { SnippetService } from '../services/SnippetService';

export function useSnippets(service: SnippetService) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const revision = useRef(0);

  const loadSnippets = useCallback(
    async (showLoading = false) => {
      const request = ++revision.current;
      try {
        if (showLoading) setLoading(true);
        setError(null);
        const data = await service.getSnippets();
        if (request !== revision.current) return;
        setSnippets(data);
        setLoadError(null);
      } catch (err) {
        if (request !== revision.current) return;
        const message = err instanceof Error ? err.message : 'Failed to load snippets';
        setError(message);
        setLoadError(message);
      } finally {
        if (request === revision.current) setLoading(false);
      }
    },
    [service]
  );

  useEffect(() => {
    loadSnippets(true);
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && 'fillin_snippets' in changes) void loadSnippets();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === 'fillin_snippets') void loadSnippets();
    };
    if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(changed);
    window.addEventListener('storage', storage);
    return () => {
      revision.current++;
      if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(changed);
      window.removeEventListener('storage', storage);
    };
  }, [loadSnippets]);

  const createSnippet = async (
    trigger: string,
    content: string,
    isHtml: boolean = false,
    tags?: string[],
    template?: TemplateOptions
  ) => {
    try {
      setError(null);
      await service.createSnippet(trigger, content, isHtml, tags, template);
      await loadSnippets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create snippet');
      throw err;
    }
  };

  const updateSnippet = async (
    id: string,
    trigger: string,
    content: string,
    isHtml: boolean = false,
    tags?: string[],
    template?: TemplateOptions
  ) => {
    try {
      setError(null);
      await service.updateSnippet(id, {
        trigger,
        content,
        isHtml,
        tags,
        ...template,
      });
      await loadSnippets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update snippet');
      throw err;
    }
  };

  const deleteSnippet = async (id: string) => {
    try {
      setError(null);
      await service.deleteSnippet(id);
      await loadSnippets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete snippet');
      throw err;
    }
  };

  const loadStarterPack = async () => {
    try {
      setError(null);
      await service.loadStarterPack();
      await loadSnippets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load starter pack');
      throw err;
    }
  };

  const importSnippets = async (incoming: unknown[]) => {
    try {
      setError(null);
      const res = await service.importSnippets(incoming);
      await loadSnippets();
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import snippets');
      throw err;
    }
  };

  return {
    snippets,
    loading,
    error,
    loadError,
    createSnippet,
    updateSnippet,
    deleteSnippet,
    loadStarterPack,
    importSnippets,
    reload: () => loadSnippets(true),
  };
}
