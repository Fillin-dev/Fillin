export type InsertionResult = 'inserted' | 'copied' | 'failed';
export type CursorInsertionResult = { result: 'inserted'; insertedLength: number } | { result: 'failed' };
export interface TemplateBookmark {
  isValid(): boolean;
  restore(): boolean;
  dispose(): void;
}
export interface InputAdapter {
  getTarget?(): HTMLElement | null;
  startInlineEditing?(start: number, end: number, template: InlineTemplate, eligible: () => boolean): InlineStartResult;
  prepareTemplateInsertion?(start: number, end: number): TemplateBookmark | null;
  canCopyTemplate?(): boolean;
  canPlaceTemplateCursor?(content: string, cursorOffset: number): boolean;
  replaceTextWithCursor?(start: number, end: number, content: string, cursorOffset: number): CursorInsertionResult | Promise<CursorInsertionResult>;
  getText(): string;
  getCursorPosition(): number | null;
  replaceText(start: number, end: number, newContent: string, isHtml?: boolean): void | InsertionResult | Promise<InsertionResult>;
}
import type { InlineTemplate } from '@fillin/shared';
import type { InlineStartResult } from '../templates/InlineSession';
