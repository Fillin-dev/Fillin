import { Snippet, snippetSchema, TemplateOptions } from '@fillin/shared';
import { SnippetRepository } from '../storage/SnippetRepository';
import { withSnippetWriteLock } from '../storage/withSnippetWriteLock';

export const STARTER_SNIPPETS: Omit<
  Snippet,
  'id' | 'createdAt' | 'updatedAt'
>[] = [
  {
    trigger: '/today',
    content: '{{date}}',
    templateVersion: 1,
    tags: ['utility'],
    isHtml: false,
  },
  { trigger: '/time', content: '{{time}}', templateVersion: 1, tags: ['utility'], isHtml: false },
  { trigger: '/now', content: '{{datetime}}', templateVersion: 1, tags: ['utility'], isHtml: false },
  {
    trigger: '/shrug',
    content: '¯\\_(ツ)_/¯',
    tags: ['fun'],
    isHtml: false,
  },
  {
    trigger: '/meeting',
    content:
      "Thanks for reaching out! Let's schedule a quick 15-minute call: https://cal.com/your-link",
    tags: ['work', 'email'],
    isHtml: false,
  },
  {
    trigger: '/followup',
    content:
      'Hi there, just following up on our previous conversation to see if you have any updates!',
    tags: ['email'],
    isHtml: false,
  },
  {
    trigger: '/tableflip',
    content: '(╯°□°)╯︵ ┻━┻',
    tags: ['fun'],
    isHtml: false,
  },
];

export class SnippetService {
  constructor(private repository: SnippetRepository) {}

  async createSnippet(
    trigger: string,
    content: string,
    isHtml: boolean = false,
    tags?: string[],
    template: TemplateOptions = {}
  ): Promise<Snippet> {
    return withSnippetWriteLock(async () => {
      const snippets = await this.repository.getAll();

      if (snippets.some((s) => s.trigger === trigger)) {
        throw new Error(`Snippet with trigger "${trigger}" already exists.`);
      }

      const now = Date.now();
      const newSnippet: Snippet = {
        ...template,
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2),
        trigger,
        content,
        isHtml,
        tags: tags && tags.length > 0 ? tags : undefined,
        createdAt: now,
        updatedAt: now,
      };

      const parsed = snippetSchema.safeParse(newSnippet);
      if (!parsed.success) {
        throw new Error(
          `Validation failed: ${parsed.error.issues?.[0]?.message || parsed.error.message}`
        );
      }

      snippets.push(parsed.data);
      await this.repository.save(snippets);

      return parsed.data;
    });
  }

  async getSnippets(): Promise<Snippet[]> {
    return this.repository.getAll();
  }

  async getSnippetByTrigger(trigger: string): Promise<Snippet | undefined> {
    const snippets = await this.repository.getAll();
    return snippets.find((s) => s.trigger === trigger);
  }

  async updateSnippet(
    id: string,
    updates: Partial<Pick<Snippet, 'trigger' | 'content' | 'isHtml' | 'tags' | 'templateVersion' | 'dateFormat' | 'editAfterInsert'>>
  ): Promise<Snippet> {
    return withSnippetWriteLock(async () => {
      const snippets = await this.repository.getAll();
      const index = snippets.findIndex((s) => s.id === id);

      if (index === -1) {
        throw new Error(`Snippet with ID "${id}" not found.`);
      }

      const currentSnippet = snippets[index];
      if (currentSnippet.kind === 'media') throw new Error('Use the media editor to change this snippet.');

      if (updates.trigger && updates.trigger !== currentSnippet.trigger) {
        const triggerExists = snippets.some(
          (s) => s.trigger === updates.trigger
        );
        if (triggerExists) {
          throw new Error(
            `Snippet with trigger "${updates.trigger}" already exists.`
          );
        }
      }

      const updatedSnippet: Snippet = {
        ...currentSnippet,
        ...updates,
        tags:
          updates.tags !== undefined
            ? updates.tags.length > 0
              ? updates.tags
              : undefined
            : currentSnippet.tags,
        updatedAt: Date.now(),
      };

      const parsed = snippetSchema.safeParse(updatedSnippet);
      if (!parsed.success) {
        throw new Error(
          `Validation failed: ${parsed.error.issues?.[0]?.message || parsed.error.message}`
        );
      }

      snippets[index] = parsed.data;
      await this.repository.save(snippets);

      return parsed.data;
    });
  }

  async deleteSnippet(id: string): Promise<void> {
    return withSnippetWriteLock(async () => {
      const snippets = await this.repository.getAll();
      const filtered = snippets.filter((s) => s.id !== id);

      if (filtered.length === snippets.length) {
        throw new Error(`Snippet with ID "${id}" not found.`);
      }

      await this.repository.save(filtered);
    });
  }

  async importSnippets(
    incomingData: unknown[]
  ): Promise<{ imported: number; updated: number; skipped: number }> {
    return withSnippetWriteLock(async () => {
      if (!Array.isArray(incomingData)) {
        throw new Error('Import data must be a JSON array of snippets.');
      }
      if (incomingData.some(item => item && typeof item === 'object' && 'kind' in item &&
          (item as { kind?: string }).kind !== undefined && (item as { kind?: string }).kind !== 'text')) {
        throw new Error('Media snippets require a full backup with original files. This JSON import has not changed your library.');
      }

      const existing = await this.repository.getAll();
      const existingMap = new Map(existing.map((s) => [s.trigger, s]));

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const item of incomingData) {
        const parsed = snippetSchema.safeParse(item);
        if (!parsed.success) {
          skipped++;
          continue;
        }

        const snippet = parsed.data;
        if (existingMap.has(snippet.trigger)) {
          // Update existing snippet
          const curr = existingMap.get(snippet.trigger)!;
          if (curr.kind === 'media') { skipped++; continue; }
          existingMap.set(snippet.trigger, {
            ...curr,
            content: snippet.content,
            isHtml: snippet.isHtml,
            tags: snippet.tags,
            templateVersion: snippet.templateVersion,
            dateFormat: snippet.dateFormat,
            editAfterInsert: snippet.editAfterInsert,
            updatedAt: Date.now(),
          });
          updated++;
        } else {
          // Add new
          existingMap.set(snippet.trigger, {
            ...snippet,
            id:
              snippet.id ||
              (typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : Math.random().toString(36).substring(2)),
            createdAt: snippet.createdAt || Date.now(),
            updatedAt: Date.now(),
          });
          imported++;
        }
      }

      const result = Array.from(existingMap.values());
      await this.repository.save(result);

      return { imported, updated, skipped };
    });
  }

  async loadStarterPack(): Promise<Snippet[]> {
    return withSnippetWriteLock(async () => {
      const existing = await this.repository.getAll();
      const existingTriggers = new Set(existing.map((s) => s.trigger));
      const now = Date.now();

      const added: Snippet[] = [];
      for (const starter of STARTER_SNIPPETS) {
        if (!existingTriggers.has(starter.trigger)) {
          const snippet: Snippet = {
            id:
              typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : Math.random().toString(36).substring(2),
            trigger: starter.trigger,
            content: starter.content,
            isHtml: starter.isHtml,
            tags: starter.tags,
            templateVersion: starter.templateVersion,
            dateFormat: starter.dateFormat,
            editAfterInsert: starter.editAfterInsert,
            createdAt: now,
            updatedAt: now,
          };
          existing.push(snippet);
          added.push(snippet);
        }
      }

      if (added.length > 0) {
        await this.repository.save(existing);
      }

      return existing;
    });
  }
}
