import { Snippet, getTemplateFields, hasTemplateCursor, resolveTemplate, resolveTemplateWithCursor, resolveInlineTemplate } from '@fillin/shared';
import { InputAdapter, InsertionResult } from '../adapters/InputAdapter';
import { statsService } from '../../services/StatsService';
import { showTemplateDialog } from '../templates/TemplateDialog';
import { stopInlineSession } from '../templates/InlineSession';
import type { MediaSnippet, TextSnippet } from '@fillin/shared';
import { showMediaDialog } from '../media/MediaDialog';

/** Both existing insertion entry points resolve the same saved content. */
export async function expandSnippet(
  adapter: InputAdapter,
  snippet: (Pick<TextSnippet, 'content' | 'isHtml' | 'templateVersion' | 'dateFormat' | 'editAfterInsert'> & { kind?: 'text' }) | MediaSnippet,
  start: number,
  end: number,
  eligible: () => boolean = () => true,
  copyOnly = false
): Promise<InsertionResult> {
  try {
    if (snippet.kind === 'media') {
      stopInlineSession();
      return await showMediaDialog(adapter.getTarget?.() ?? document.activeElement, snippet, start, end, eligible, copyOnly);
    }
    stopInlineSession();
    if (!eligible() || (snippet.templateVersion === 1 && snippet.isHtml)) return 'failed';
    const context = { now: new Date(), locale: navigator.language || 'en-US', dateFormat: snippet.dateFormat };
    const fields = snippet.templateVersion === 1 ? getTemplateFields(snippet.content) : [];
    const hasCursor = snippet.templateVersion === 1 && hasTemplateCursor(snippet.content);
    if (fields.length || hasCursor) {
      const preview = hasCursor ? resolveTemplateWithCursor(snippet.content, { ...context, preview: true }) : null;
      const bookmark = adapter.prepareTemplateInsertion?.(start, end);
      // A missing bookmark may mean either a protected field or an unreliable
      // insertion mapping. Only an explicit safe-copy policy permits fallback.
      if (adapter.prepareTemplateInsertion && !bookmark && !adapter.canCopyTemplate?.()) return 'failed';
      const valid = () => eligible() && (bookmark ? bookmark.isValid() : (adapter.canCopyTemplate?.() ?? true));
      const cursorMapping = !preview || preview.cursorOffset === null || (adapter.canPlaceTemplateCursor?.(preview.text, preview.cursorOffset) ?? true);
      const canInsert = !copyOnly && !!bookmark && (!hasCursor || !!adapter.replaceTextWithCursor) && cursorMapping;
      const insert = async (content: string, cursorOffset: number | null): Promise<InsertionResult> => {
        if (!valid() || !bookmark?.restore() || !valid()) return 'failed';
        if (cursorOffset !== null) {
          if (!adapter.replaceTextWithCursor) return 'failed';
          if (adapter.canPlaceTemplateCursor && !adapter.canPlaceTemplateCursor(content, cursorOffset)) {
            throw new Error('Cursor placement is unavailable for this position. Choose Copy completed message and place the cursor manually.');
          }
          const outcome = await adapter.replaceTextWithCursor(start, end, content, cursorOffset);
          if (outcome.result === 'inserted') void statsService.recordExpansion(end - start, outcome.insertedLength).catch(() => {});
          return outcome.result;
        }
        const outcome = await adapter.replaceText(start, end, content, false) ?? 'failed';
        if (outcome === 'inserted') void statsService.recordExpansion(end - start, content.length).catch(() => {});
        return outcome;
      };
      try {
        let notice: string | undefined;
        if (snippet.editAfterInsert && fields.length) {
          if (!copyOnly && adapter.startInlineEditing && bookmark && valid() && bookmark.restore() && valid()) {
            const layout = resolveInlineTemplate(snippet.content, context);
            const outcome = adapter.startInlineEditing(start, end, layout, eligible);
            if (outcome.result === 'inserted') {
              const labels = layout.placeholders.reduce((sum, p) => sum + p.end - p.start, 0);
              void statsService.recordExpansion(end - start, Math.max(0, outcome.insertedLength - labels)).catch(() => {});
              return 'inserted';
            }
            if (outcome.result === 'failed') return 'failed';
          }
          notice = 'Inline editing is unavailable in this field. Fill in the fields below instead.';
        }
        if (!fields.length && canInsert) {
          const resolved = resolveTemplateWithCursor(snippet.content, context);
          return await insert(resolved.text, resolved.cursorOffset);
        }
        let finalCursor: number | null = null;
        return await showTemplateDialog({
          fields,
          notice,
          render: (values, preview) => {
            const resolved = resolveTemplateWithCursor(snippet.content, { ...context, fields: values, preview });
            if (!preview) finalCursor = resolved.cursorOffset;
            return resolved.text;
          },
          valid,
          canInsert,
          copyReason: hasCursor && !canInsert ? 'Cursor placement is unavailable in this editor. Copy the message and place your cursor manually after pasting.' : undefined,
          restore: () => { if (eligible()) bookmark?.restore(); },
          insert: (content) => insert(content, finalCursor),
        });
      } finally { bookmark?.dispose(); }
    }
    const content =
      snippet.templateVersion === 1
        ? resolveTemplate(snippet.content, context)
        : snippet.content;
    const outcome = await adapter.replaceText(start, end, content, snippet.isHtml);
    const result = outcome ?? 'failed';
    if (result === 'inserted') {
      void statsService.recordExpansion(end - start, content.length).catch(() => {});
    }
    return result;
  } catch {
    return 'failed';
  }
}
