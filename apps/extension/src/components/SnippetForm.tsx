import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Snippet, TemplateOptions, getTemplateFields, resolveTemplate, resolveInlineTemplate } from '@fillin/shared';
import { ArrowLeft, Save, X, AlertTriangle, Check } from 'lucide-react';

interface Props {
  snippet?: Snippet;
  initialContent?: string;
  initialTrigger?: string;
  existingSnippets?: Snippet[];
  onSave: (
    trigger: string,
    content: string,
    isHtml: boolean,
    tags?: string[],
    template?: TemplateOptions
  ) => Promise<void>;
  onCancel: () => void;
  error?: string | null;
}

export function SnippetForm({ snippet, initialContent, initialTrigger, existingSnippets, onSave, onCancel, error }: Props) {
  const [trigger, setTrigger] = useState(snippet?.trigger || initialTrigger || '/');
  const [content, setContent] = useState(snippet?.content ?? initialContent ?? '');
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [isHtml, setIsHtml] = useState(snippet?.isHtml || false);
  const [tags, setTags] = useState<string[]>(snippet?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [templateEnabled, setTemplateEnabled] = useState(snippet?.templateVersion === 1);
  const [editAfterInsert, setEditAfterInsert] = useState(snippet?.editAfterInsert ?? false);
  const fieldNames = useMemo(() => { try { return getTemplateFields(content); } catch { return []; } }, [content]);
  const [dateFormat, setDateFormat] = useState<'friendly' | 'iso'>(
    snippet?.dateFormat || 'friendly'
  );
  const preview = useMemo(() => {
    if (!templateEnabled) return { text: '', error: '' };
    try {
      return {
        text: (editAfterInsert && fieldNames.length ? resolveInlineTemplate(content, {
          now: new Date(), locale: navigator.language || 'en-US', dateFormat,
        }).text : resolveTemplate(content, {
          now: new Date(),
          locale: navigator.language || 'en-US',
          dateFormat,
          preview: true,
        })),
        error: '',
      };
    } catch (error) {
      return { text: '', error: (error as Error).message };
    }
  }, [content, templateEnabled, dateFormat, editAfterInsert, fieldNames]);

  useEffect(() => {
    setLocalError(error || null);
  }, [error]);

  // Check duplicate and prefix conflicts in real time
  const conflict = useMemo(() => {
    const clean = trigger.trim();
    if (!clean || clean === '/' || !existingSnippets) {
      return { type: 'none' as const, message: '', suggestions: [] as string[] };
    }

    const otherSnippets = existingSnippets.filter((s) => s.id !== snippet?.id);

    // 1. Exact Duplicate Conflict
    const duplicate = otherSnippets.find((s) => s.trigger.toLowerCase() === clean.toLowerCase());
    if (duplicate) {
      const base = clean.startsWith('/') ? clean.slice(1) : clean;
      const suggestions = [`/${base}2`, `/${base}_alt`, `/my${base}`].filter(
        (cand) => !otherSnippets.some((s) => s.trigger.toLowerCase() === cand.toLowerCase())
      );

      return {
        type: 'duplicate' as const,
        message: `Trigger "${clean}" already exists. Choose a unique shortcut.`,
        suggestions,
      };
    }

    // 2. Prefix / Overlap Conflict
    const prefixOverlap = otherSnippets.find(
      (s) =>
        (clean.toLowerCase().startsWith(s.trigger.toLowerCase()) &&
          clean.length > s.trigger.length) ||
        (s.trigger.toLowerCase().startsWith(clean.toLowerCase()) && s.trigger.length > clean.length)
    );

    if (prefixOverlap) {
      const base = clean.startsWith('/') ? clean.slice(1) : clean;
      const suggestions = [`/${base}_`, `/${base}1`].filter(
        (cand) => !otherSnippets.some((s) => s.trigger.toLowerCase() === cand.toLowerCase())
      );

      return {
        type: 'prefix' as const,
        message: `Shares prefix with "${prefixOverlap.trigger}". Both shortcuts work when typed in full.`,
        suggestions,
      };
    }

    return { type: 'none' as const, message: '', suggestions: [] as string[] };
  }, [trigger, existingSnippets, snippet]);

  const validTrigger = /^\/[a-zA-Z0-9_-]+$/.test(trigger);
  const isValid =
    validTrigger && content.trim().length > 0 && conflict.type !== 'duplicate' && !preview.error;

  const handleAddTag = (val: string) => {
    const clean = val
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    if (clean && !tags.includes(clean)) {
      setTags((current) => (current.includes(clean) ? current : [...current, clean]));
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(tagInput);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    setLocalError(null);
    setIsSubmitting(true);
    try {
      const pendingTag = tagInput
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
      const savedTags = pendingTag ? Array.from(new Set([...tags, pendingTag])) : tags;
      const finalTags = savedTags.length ? savedTags : undefined;
      if (templateEnabled || snippet?.templateVersion) {
        await onSave(trigger, content, isHtml, finalTags, {
          templateVersion: templateEnabled ? 1 : undefined,
          dateFormat: templateEnabled ? dateFormat : undefined,
          ...((editAfterInsert && fieldNames.length && templateEnabled) || snippet?.editAfterInsert !== undefined
            ? { editAfterInsert: templateEnabled && editAfterInsert && !!fieldNames.length ? true : undefined } : {}),
        });
      } else await onSave(trigger, content, isHtml, finalTags);
      onCancel();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="popup-editor">
      <header className="editor-header">
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="icon-button"
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>{snippet ? 'Edit Snippet' : 'New Snippet'}</h1>
          <p>{snippet ? 'Fine-tune your saved shortcut.' : 'A few letters. Your full message.'}</p>
        </div>
      </header>
      <form onSubmit={handleSubmit} className="snippet-form" aria-busy={isSubmitting}>
        <div className="editor-scroll">
          {localError && (
            <div role="alert" className="form-error">
              {localError}
            </div>
          )}
          <div className="form-field">
            <label htmlFor="snippet-trigger">Shortcut</label>
            <div className="trigger-input">
              <span aria-hidden="true">/</span>
              <input
                id="snippet-trigger"
                type="text"
                value={trigger.replace(/^\//, '')}
                onChange={(event) => setTrigger('/' + event.target.value.replace(/\//g, ''))}
                placeholder="email, name, sig..."
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={isSubmitting}
                aria-describedby="trigger-help"
                aria-invalid={conflict.type === 'duplicate' || (trigger !== '/' && !validTrigger)}
              />
            </div>
            <p id="trigger-help" className="field-help">
              {trigger === '/' ? (
                'Letters, numbers, dashes and underscores.'
              ) : !validTrigger ? (
                'Use only letters, numbers, dashes and underscores.'
              ) : conflict.type === 'none' ? (
                <span className="available-trigger">
                  <Check size={12} /> Shortcut available
                </span>
              ) : null}
            </p>
            {conflict.type !== 'none' && (
              <div
                className={conflict.type === 'duplicate' ? 'form-error' : 'form-warning'}
                role={conflict.type === 'duplicate' ? 'alert' : 'status'}
              >
                <p className="flex items-start gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{conflict.message}</span>
                </p>
                {conflict.suggestions.length > 0 && (
                  <div className="trigger-suggestions">
                    <span>Try:</span>
                    {conflict.suggestions.map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => setTrigger(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-field">
            <div className="field-label-row">
              <label htmlFor="snippet-content">Expanded text</label>
              <span>{content.length.toLocaleString()} characters</span>
            </div>
            <textarea
              ref={contentRef}
              id="snippet-content"
              className="popup-input snippet-content-input"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="The text that will be inserted..."
              disabled={isSubmitting}
            />
            <p className="field-help">
              This replaces your shortcut when you press <kbd>Ctrl + Space</kbd>.
            </p>
          </div>

          <div className="form-field">
            {snippet?.trigger === '/today' && !templateEnabled && (
              <button
                type="button"
                className="popup-secondary"
                disabled={isSubmitting}
                onClick={() => {
                  setContent('{{date}}');
                  setIsHtml(false);
                  setTemplateEnabled(true);
                }}
              >
                Make /today show the current date
              </button>
            )}
            <label className="format-option">
              <input
                type="checkbox"
                checked={templateEnabled}
                disabled={isSubmitting || isHtml}
                onChange={(event) => setTemplateEnabled(event.target.checked)}
              />
              <span>
                <strong>Use template values</strong>
                <small>Use dates or ask for fields such as name and company when expanding.</small>
              </span>
            </label>
            {templateEnabled && (
              <>
                <div className="trigger-suggestions">
                  {['date', 'time', 'datetime', 'name', 'company', 'cursor'].map((token) => (
                    <button
                      type="button"
                      key={token}
                      disabled={isSubmitting}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        const start = contentRef.current?.selectionStart ?? content.length;
                        const end = contentRef.current?.selectionEnd ?? start;
                        const text = '{{' + token + '}}';
                        setContent(content.slice(0, start) + text + content.slice(end));
                        requestAnimationFrame(() => {
                          contentRef.current?.focus();
                          contentRef.current?.setSelectionRange(
                            start + text.length,
                            start + text.length
                          );
                        });
                      }}
                    >
                      {'{{' + token + '}}'}
                    </button>
                  ))}
                </div>
                <label className="format-option">
                  <input type="checkbox" checked={editAfterInsert && fieldNames.length > 0}
                    disabled={isSubmitting || fieldNames.length === 0}
                    onChange={(event) => setEditAfterInsert(event.target.checked)} />
                  <span>
                    <strong>Edit fields after insertion</strong>
                    <small>Inserts placeholders immediately in supported text boxes. Use Tab and Shift+Tab to edit; other editors use the fill-in dialog.</small>
                    <small>Repeated fields are edited separately. Escape stops navigation and keeps your edits.</small>
                  </span>
                </label>
                <label>
                  Date format
                  <select
                    className="popup-input"
                    value={dateFormat}
                    disabled={isSubmitting}
                    onChange={(event) => setDateFormat(event.target.value as 'friendly' | 'iso')}
                  >
                    <option value="friendly">Nov 11, 2026</option>
                    <option value="iso">2026-11-11 (ISO)</option>
                  </select>
                </label>
                {preview.error ? (
                  <p role="alert" className="form-error">
                    {preview.error}
                  </p>
                ) : (
                  <div className="field-help">
                    <strong>Preview now</strong>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{preview.text}</p>
                    <p>Fill-in fields are answered when expanding. Dates use the time you start the expansion.</p>
                  </div>
                )}
                <p className="field-help">
                  Use \\{'{{date}}'} for literal braces. Add fields such as {'{{name}}'} or
                  {' {{order_number}}'} using lowercase letters, numbers, and underscores.
                  {' '}Use one {'{{cursor}}'} marker where typing should resume.
                </p>
              </>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="snippet-tags">
              Tags <span className="optional-label">Optional</span>
            </label>
            <div className="tag-input-row">
              <input
                id="snippet-tags"
                className="popup-input"
                type="text"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => {
                  if (tagInput.trim()) handleAddTag(tagInput);
                }}
                placeholder="Add tag and press Enter (e.g. email, work)..."
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="popup-secondary"
                disabled={!tagInput.trim() || isSubmitting}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleAddTag(tagInput)}
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="form-tags">
                {tags.map((tag) => (
                  <span key={tag}>
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      disabled={isSubmitting}
                      aria-label={'Remove tag ' + tag}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <label htmlFor="htmlToggle" className="format-option">
            <input
              id="htmlToggle"
              type="checkbox"
              checked={isHtml}
              onChange={(event) => setIsHtml(event.target.checked)}
              disabled={isSubmitting || templateEnabled}
            />
            <span>
              <strong>Rich text (HTML)</strong>
              <small>Enable only when your snippet contains HTML.</small>
            </span>
          </label>
        </div>
        <footer className="editor-footer">
          <button type="submit" disabled={isSubmitting || !isValid} className="popup-primary">
            <Save size={16} aria-hidden="true" />
            {isSubmitting ? 'Saving...' : snippet ? 'Update Snippet' : 'Save Snippet'}
          </button>
          <p>Saved locally in your browser.</p>
        </footer>
      </form>
    </div>
  );
}
