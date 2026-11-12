import { describe, it, expect } from 'vitest';
import { getTemplateFields, hasTemplateCursor, resolveTemplate, resolveTemplateWithCursor } from './resolveTemplate';
import { snippetSchema } from '../models/snippet';

describe('date templates', () => {
  const context = { now: new Date(2024, 1, 29, 13, 5), locale: 'en-US' };
  it('resolves repeated tokens from one timestamp', () => {
    expect(resolveTemplate('{{date}} / {{date}} / {{time}} / {{datetime}}', context)).toBe(
      'Feb 29, 2024 / Feb 29, 2024 / 01:05 PM / Feb 29, 2024, 01:05 PM'
    );
  });
  it('uses the local calendar for ISO dates and handles year boundaries', () => {
    expect(resolveTemplate('{{date}}', { ...context, dateFormat: 'iso' })).toBe('2024-02-29');
    expect(resolveTemplate('{{date}}', { ...context, now: new Date(2025, 11, 31, 23, 59) })).toBe(
      'Dec 31, 2025'
    );
    expect(resolveTemplate('{{date}}', { ...context, now: new Date(2026, 0, 1, 0, 0) })).toBe(
      'Jan 1, 2026'
    );
  });
  it('escapes literal tokens without recursively resolving them', () => {
    expect(resolveTemplate('\\{{date}} {{ date }}', context)).toBe('{{date}} Feb 29, 2024');
  });
  it.skipIf(Intl.DateTimeFormat().resolvedOptions().timeZone !== 'America/New_York')(
    'handles the spring daylight-saving jump in local time',
    () => {
      expect(
        resolveTemplate('{{datetime}}', { now: new Date('2024-03-10T06:59:00Z'), locale: 'en-US' })
      ).toBe('Mar 10, 2024, 01:59 AM');
      expect(
        resolveTemplate('{{datetime}}', { now: new Date('2024-03-10T07:00:00Z'), locale: 'en-US' })
      ).toBe('Mar 10, 2024, 03:00 AM');
    }
  );
  it('rejects unsupported names, incomplete tokens, and invalid dates', () => {
    for (const value of ['{{name}}', '{{clipboard}}', '{{Date}}', '{{date']) {
      expect(() => resolveTemplate(value, context)).toThrow();
    }
    expect(() => resolveTemplate('{{date}}', { ...context, now: new Date(NaN) })).toThrow();
  });
  it('preserves existing literal snippets and rejects unsupported versions and HTML templates', () => {
    const base = { id: '1', trigger: '/date', content: '{{name}}', createdAt: 1, updatedAt: 1 };
    expect(snippetSchema.parse(base).content).toBe('{{name}}');
    expect(snippetSchema.safeParse({ ...base, templateVersion: 1 }).success).toBe(true);
    expect(snippetSchema.safeParse({ ...base, templateVersion: 2 }).success).toBe(false);
    expect(
      snippetSchema.safeParse({ ...base, content: '{{date}}', templateVersion: 1, isHtml: true })
        .success
    ).toBe(false);
  });
});

describe('fill-in template fields', () => {
  const context = { now: new Date(2026, 10, 12, 10, 30), locale: 'en-US', dateFormat: 'iso' as const };
  it('extracts unique names in order and excludes date and escaped tokens', () => {
    expect(getTemplateFields('Hi {{name}}, {{company}} / {{name}} / {{date}} / \\{{literal}}')).toEqual(['name', 'company']);
  });
  it('renders repeated fields once, preserves Unicode/whitespace, and never interprets values', () => {
    expect(resolveTemplate('{{name}} / {{name}} / {{order_number}} / {{date}}', {
      ...context, fields: { name: ' Zoë 🐴 ', order_number: '<b>{{date}}</b>\n42' },
    })).toBe(' Zoë 🐴  /  Zoë 🐴  / <b>{{date}}</b>\n42 / 2026-11-12');
  });
  it('provides explicit editor previews but rejects missing or blank submitted values', () => {
    expect(resolveTemplate('Hi {{name}}', { ...context, preview: true })).toBe('Hi ‹name›');
    const invalid: Record<string, string>[] = [{}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(2001) }];
    for (const fields of invalid) {
      expect(() => resolveTemplate('{{name}}', { ...context, fields })).toThrow();
    }
    expect(() => resolveTemplate('{{name}}', { ...context, fields: Object.create({ name: 'inherited' }) })).toThrow();
  });
  it('rejects invalid, reserved, malformed and excessive field names', () => {
    for (const token of ['clipboard', 'selection', 'constructor', 'prototype', '__proto__', 'Name', 'two words', 'name|default', '', 'x'.repeat(49)]) {
      expect(() => getTemplateFields(`{{${token}}}`)).toThrow();
    }
    expect(() => getTemplateFields('{{name')).toThrow();
    expect(() => getTemplateFields('{{outer{{inner}}')).toThrow();
    expect(() => getTemplateFields(Array.from({ length: 21 }, (_, n) => `{{field_${n}}}`).join(''))).toThrow('20');
    expect(() => resolveTemplate('{{name}}'.repeat(51), { ...context, fields: { name: 'x'.repeat(2000) } })).toThrow('too long');
  });
});

describe('final cursor marker', () => {
  const context = { now: new Date(2026, 10, 12, 10, 30), locale: 'en-US', dateFormat: 'iso' as const };
  it('returns exact start, middle and end offsets without treating the marker as a field', () => {
    expect(getTemplateFields('{{cursor}} {{name}}')).toEqual(['name']);
    expect(resolveTemplateWithCursor('{{cursor}}abc', context)).toEqual({ text: 'abc', cursorOffset: 0 });
    expect(resolveTemplateWithCursor('a{{ cursor }}bc', context)).toEqual({ text: 'abc', cursorOffset: 1 });
    expect(resolveTemplateWithCursor('abc{{cursor}}', context)).toEqual({ text: 'abc', cursorOffset: 3 });
    expect(resolveTemplateWithCursor('abc', context)).toEqual({ text: 'abc', cursorOffset: null });
    expect(resolveTemplateWithCursor('{{cursor}}', context)).toEqual({ text: '', cursorOffset: 0 });
  });
  it('calculates the UTF-16 offset after repeated fields, emoji and date substitution', () => {
    const prefix = '🐴 Zoë / Zoë / 2026-11-12 ';
    expect(resolveTemplateWithCursor('🐴 {{name}} / {{name}} / {{date}} {{cursor}}done', { ...context, fields: { name: 'Zoë' } }))
      .toEqual({ text: prefix + 'done', cursorOffset: prefix.length });
  });
  it('normalizes CRLF and bare CR, including boundaries between field values and literals', () => {
    expect(resolveTemplateWithCursor('A\r\n{{name}}\n{{cursor}}C\rD', { ...context, fields: { name: 'B\r' } }))
      .toEqual({ text: 'A\nB\nC\nD', cursorOffset: 4 });
    expect(resolveTemplateWithCursor('A\r{{cursor}}\nB', context)).toEqual({ text: 'A\nB', cursorOffset: 2 });
  });
  it('keeps escaped markers and field answers literal without counting them as markers', () => {
    expect(hasTemplateCursor('\\{{cursor}}')).toBe(false);
    expect(hasTemplateCursor('\\{{cursor}} {{cursor}}')).toBe(true);
    const resolved = resolveTemplateWithCursor('\\{{cursor}} {{name}}{{cursor}}!', { ...context, fields: { name: '{{cursor}}' } });
    expect(resolved).toEqual({ text: '{{cursor}} {{cursor}}!', cursorOffset: '{{cursor}} {{cursor}}'.length });
  });
  it('rejects duplicate markers in enabled templates but preserves literal snippets', () => {
    const content = '{{cursor}} / {{cursor}}';
    expect(() => getTemplateFields(content)).toThrow('only one');
    expect(() => resolveTemplateWithCursor(content, context)).toThrow('only one');
    const snippet = { id: 'cursor', trigger: '/cursor', content, createdAt: 1, updatedAt: 1 };
    expect(snippetSchema.safeParse(snippet).success).toBe(true);
    expect(snippetSchema.safeParse({ ...snippet, templateVersion: 1 }).success).toBe(false);
  });
});
