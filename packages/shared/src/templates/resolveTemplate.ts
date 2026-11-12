export type DateFormat = 'friendly' | 'iso';

const DATE_TOKENS = new Set(['date', 'time', 'datetime']);
const RESERVED = new Set(['clipboard', 'selection', 'constructor', 'prototype']);
type Part = { literal: string } | { token: string };

function parse(content: string): Part[] {
  const parts: Part[] = [];
  let cursors = 0;
  let position = 0;
  while (position < content.length) {
    const start = content.indexOf('{{', position);
    if (start < 0) { parts.push({ literal: content.slice(position) }); break; }
    const escaped = start > position && content[start - 1] === '\\';
    parts.push({ literal: content.slice(position, escaped ? start - 1 : start) });
    const end = content.indexOf('}}', start + 2);
    if (end < 0) throw new Error('Close template values with }}.');
    const token = content.slice(start + 2, end).trim();
    if (escaped) parts.push({ literal: content.slice(start, end + 2) });
    else {
      if (!/^[a-z][a-z0-9_]{0,47}$/.test(token) || RESERVED.has(token)) {
        throw new Error(`Unsupported template value: {{${token}}}. Use lowercase field names such as name or order_number.`);
      }
      if (token === 'cursor' && ++cursors > 1) throw new Error('Use only one {{cursor}} marker per template.');
      parts.push({ token });
    }
    position = end + 2;
  }
  return parts;
}

/** Unique user fields, in first-appearance order. No browser APIs or state. */
export function getTemplateFields(content: string): string[] {
  const fields = [...new Set(parse(content).flatMap((part) =>
    'token' in part && !DATE_TOKENS.has(part.token) && part.token !== 'cursor' ? [part.token] : []))];
  if (fields.length > 20) throw new Error('Use at most 20 different fields in one template.');
  return fields;
}

/** Callers supply one timestamp for the entire expansion, including its dialog. */
export interface ResolvedTemplate {
  text: string;
  /** UTF-16 offset in normalized text; null preserves end-of-expansion behavior. */
  cursorOffset: number | null;
}

export interface EditablePlaceholder { name: string; start: number; end: number }
export interface InlineTemplate extends ResolvedTemplate {
  placeholders: EditablePlaceholder[];
  /** Number of occurrences preceding the final cursor anchor (affinity). */
  fieldsBeforeCursor: number;
}

export interface TemplateContext {
  now: Date;
  locale: string;
  dateFormat?: DateFormat;
  fields?: Readonly<Record<string, string>>;
  preview?: boolean;
}

export function hasTemplateCursor(content: string): boolean {
  return parse(content).some((part) => 'token' in part && part.token === 'cursor');
}

export function resolveTemplateWithCursor(
  content: string,
  context: TemplateContext
): ResolvedTemplate {
  const { text, cursorOffset } = renderTemplate(content, context, false);
  return { text, cursorOffset };
}

function renderTemplate(content: string, context: TemplateContext, inline: boolean): InlineTemplate {
  const { now, locale, dateFormat = 'friendly' } = context;
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid template date.');
  const date =
    dateFormat === 'iso'
      ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      : new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(now);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(now);
  const values: Record<string, string> = { date, time, datetime: `${date}, ${time}` };
  getTemplateFields(content);
  const renderPart = (part: Part): string => {
    if ('literal' in part) return part.literal;
    if (DATE_TOKENS.has(part.token)) return values[part.token];
    if (inline) return `‹${part.token}›`;
    if (context.fields && Object.prototype.hasOwnProperty.call(context.fields, part.token)) {
      const value = context.fields[part.token];
      if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new Error(`Enter a value for ${part.token} (up to 2,000 characters).`);
      return value; // Never parse supplied values recursively or treat them as HTML.
    }
    if (context.preview) return `‹${part.token}›`;
    throw new Error(`Enter a value for ${part.token}.`);
  };
  let result = '';
  let cursorOffset: number | null = null;
  let fieldsBeforeCursor: number | null = null;
  const placeholders: EditablePlaceholder[] = [];
  for (const part of parse(content)) {
    if ('token' in part && part.token === 'cursor') { cursorOffset = result.length; fieldsBeforeCursor = placeholders.length; continue; }
    const value = renderPart(part);
    if (inline && 'token' in part && !DATE_TOKENS.has(part.token)) {
      if (placeholders.length >= 100) throw new Error('Inline editing supports at most 100 field occurrences.');
      placeholders.push({ name: part.token, start: result.length, end: result.length + value.length });
    }
    // At most two raw code units can normalize to one. Bound intermediate
    // output too, while allowing CRLF pairs across substitution boundaries.
    if (result.length + value.length > 200_000) throw new Error('The completed message is too long. Use at most 100,000 characters.');
    result += value;
  }
  const normalize = (text: string) => text.replace(/\r\n?/g, '\n');
  const text = normalize(result);
  if (text.length > 100_000) throw new Error('The completed message is too long. Use at most 100,000 characters.');
  return {
    text,
    cursorOffset: cursorOffset === null ? null : normalize(result.slice(0, cursorOffset)).length,
    placeholders: placeholders.map((field) => ({ ...field, start: normalize(result.slice(0, field.start)).length, end: normalize(result.slice(0, field.end)).length })),
    fieldsBeforeCursor: fieldsBeforeCursor ?? placeholders.length,
  };
}

/** Repeated fields deliberately produce independent editable occurrences. */
export function resolveInlineTemplate(content: string, context: Pick<TemplateContext, 'now' | 'locale' | 'dateFormat'>): InlineTemplate {
  return renderTemplate(content, context, true);
}

export function resolveTemplate(content: string, context: TemplateContext): string {
  return resolveTemplateWithCursor(content, context).text;
}
