import { z } from 'zod';
import { getTemplateFields, resolveInlineTemplate } from '../templates/resolveTemplate.js';

const TRIGGER_REGEX = /^\/[a-zA-Z0-9_-]+$/;

export const snippetSchema = z
  .object({
    id: z.string().min(1, 'ID is required'),
    trigger: z
      .string()
      .regex(
        TRIGGER_REGEX,
        'Trigger must begin with / and contain only letters, numbers, underscores, or hyphens'
      ),
    content: z.string(),
    isHtml: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    templateVersion: z.literal(1).optional(),
    dateFormat: z.enum(['friendly', 'iso']).optional(),
    editAfterInsert: z.boolean().optional(),
    createdAt: z.number(),
    updatedAt: z.number(),
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

export type Snippet = z.infer<typeof snippetSchema>;
export type TemplateOptions = Pick<Snippet, 'templateVersion' | 'dateFormat' | 'editAfterInsert'>;
