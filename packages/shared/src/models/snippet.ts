import { z } from 'zod';
import { getTemplateFields, resolveInlineTemplate } from '../templates/resolveTemplate.js';
import { MEDIA_LIMITS, mediaDescriptorSchema } from './media.js';

const TRIGGER_REGEX = /^\/[a-zA-Z0-9_-]+$/;

const identity = {
    id: z.string().min(1, 'ID is required'),
    trigger: z
      .string()
      .regex(
        TRIGGER_REGEX,
        'Trigger must begin with / and contain only letters, numbers, underscores, or hyphens'
      ),
    tags: z.array(z.string()).optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
};

export const textSnippetSchema = z
  .object({
    ...identity,
    kind: z.literal('text').optional(),
    content: z.string(),
    isHtml: z.boolean().optional(),
    templateVersion: z.literal(1).optional(),
    dateFormat: z.enum(['friendly', 'iso']).optional(),
    editAfterInsert: z.boolean().optional(),
    // Refuse media-shaped/future records instead of stripping their fields and
    // accidentally turning them into a text snippet.
    mediaVersion: z.never().optional(),
    assetId: z.never().optional(),
  })
  .superRefine((snippet, context) => {
    if (snippet.editAfterInsert && snippet.templateVersion !== 1) {
      context.addIssue({ code: 'custom', message: 'Inline editing requires an enabled plain-text template.' });
    }
    if (snippet.templateVersion !== 1) return;
    if (snippet.isHtml) {
      context.addIssue({ code: 'custom', message: 'Templates currently support plain text only.' });
      return;
    }
    try {
      const fields = getTemplateFields(snippet.content);
      if (snippet.editAfterInsert) {
        if (!fields.length) throw new Error('Add at least one fill-in field for inline editing.');
        resolveInlineTemplate(snippet.content, { now: new Date(0), locale: 'en-US' });
      }
    } catch (error) {
      context.addIssue({ code: 'custom', message: (error as Error).message });
    }
  });

export const mediaSnippetSchema = z.object({
  ...identity,
  ...mediaDescriptorSchema.shape,
  kind: z.literal('media'),
  mediaVersion: z.literal(1),
  // Empty compatibility field; media is never passed to text expansion.
  content: z.literal(''),
  originalFilename: z.string().min(1).max(110).regex(/^[^\\/\u0000-\u001f\u007f<>:"|?*]+$/),
  caption: z.string().max(MEDIA_LIMITS.caption),
  alt: z.string().max(MEDIA_LIMITS.alt),
  isHtml: z.never().optional(),
  templateVersion: z.never().optional(),
  dateFormat: z.never().optional(),
  editAfterInsert: z.never().optional(),
}).strict().superRefine((value, context) => {
  const descriptor = mediaDescriptorSchema.safeParse(value);
  if (!descriptor.success) context.addIssue({ code: 'custom', message: 'Invalid media dimensions or decoding budget.' });
});

export const snippetSchema = z.union([textSnippetSchema, mediaSnippetSchema]);
export type TextSnippet = z.infer<typeof textSnippetSchema>;
export type MediaSnippet = z.infer<typeof mediaSnippetSchema>;
export type Snippet = TextSnippet | MediaSnippet;
export type TemplateOptions = Pick<TextSnippet, 'templateVersion' | 'dateFormat' | 'editAfterInsert'>;
export function isTextSnippet(snippet: Snippet): snippet is TextSnippet { return snippet.kind !== 'media'; }
