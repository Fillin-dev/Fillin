import { describe, expect, it } from 'vitest';
import { resolveInlineTemplate } from './resolveTemplate';
import { snippetSchema } from '../models/snippet';

const context = { now: new Date(2026, 10, 12, 10, 30), locale: 'en-US', dateFormat: 'iso' as const };
describe('inline placeholder compilation', () => {
  it('keeps repeated occurrences independent and separates fields from dynamic values', () => {
    const result = resolveInlineTemplate('🐴 Hi {{name}} / {{date}} / {{name}}{{cursor}}!', context);
    expect(result.text).toBe('🐴 Hi ‹name› / 2026-11-12 / ‹name›!');
    expect(result.placeholders).toHaveLength(2);
    expect(result.placeholders.map((p) => result.text.slice(p.start, p.end))).toEqual(['‹name›', '‹name›']);
    expect(result.fieldsBeforeCursor).toBe(2);
    expect(result.cursorOffset).toBe(result.text.length - 1);
  });
  it('keeps final cursor affinity before, between or after field occurrences, including after empty edits', () => {
    expect(resolveInlineTemplate('{{cursor}}{{name}}', context).fieldsBeforeCursor).toBe(0);
    expect(resolveInlineTemplate('{{name}}{{cursor}}{{company}}', context).fieldsBeforeCursor).toBe(1);
    const end = resolveInlineTemplate('{{name}}{{company}}', context);
    expect(end.fieldsBeforeCursor).toBe(2); expect(end.cursorOffset).toBeNull();
  });
  it('maps normalized line endings and excludes escaped fields and cursor markers', () => {
    const result = resolveInlineTemplate('A\r\n\\{{name}} {{company}}\r{{cursor}}\\{{cursor}}', context);
    expect(result.text).toBe('A\n{{name}} ‹company›\n{{cursor}}');
    expect(result.placeholders).toEqual([{ name: 'company', start: 'A\n{{name}} '.length, end: 'A\n{{name}} ‹company›'.length }]);
    expect(result.cursorOffset).toBe('A\n{{name}} ‹company›\n'.length);
  });
  it('requires explicit template mode and user fields, and bounds inline occurrences', () => {
    const base = { id: '1', trigger: '/go', content: '{{name}}', createdAt: 1, updatedAt: 1 };
    expect(snippetSchema.safeParse({ ...base, editAfterInsert: true }).success).toBe(false);
    expect(snippetSchema.safeParse({ ...base, templateVersion: 1, editAfterInsert: true }).success).toBe(true);
    expect(snippetSchema.safeParse({ ...base, templateVersion: 1, editAfterInsert: true, isHtml: true }).success).toBe(false);
    expect(snippetSchema.safeParse({ ...base, templateVersion: 1, editAfterInsert: true, content: '{{date}}{{cursor}}' }).success).toBe(false);
    expect(() => resolveInlineTemplate('{{name}}'.repeat(101), context)).toThrow('100');
    expect(resolveInlineTemplate('{{name}}'.repeat(100), context).placeholders).toHaveLength(100);
  });
});
