import React, { useLayoutEffect, useRef, useState } from 'react';
import { detectTrigger, replaceTrigger } from '@fillin/shared';
import { ArrowUpRight, RotateCcw } from 'lucide-react';

const initialText = 'Hey team,\n\nYou can reach me at /em1';
const trigger = '/em1';
const replacement = 'vishal@example.com';

export const InteractivePlayground = ({ onExpand }: { onExpand: (saved: number) => void }) => {
  const [text, setText] = useState(initialText);
  const [message, setMessage] = useState('Ready when you are.');
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCursor = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCursor.current !== null && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pendingCursor.current, pendingCursor.current);
      pendingCursor.current = null;
    }
  });

  const expand = (fromButton = false) => {
    const field = textareaRef.current;
    if (!field) return;
    const cursor = fromButton ? text.length : field.selectionStart;
    const detection = detectTrigger(text, cursor, [trigger]);
    if (!detection || (!fromButton && field.selectionStart !== field.selectionEnd)) {
      setMessage('Place the cursor just after /em1, then try again.');
      return;
    }
    const result = replaceTrigger(text, detection, replacement);
    pendingCursor.current = result.cursorPosition;
    setText(result.text);
    setExpanded(true);
    const saved = Math.max(0, replacement.length - trigger.length);
    setMessage('Expanded! ' + saved + ' keystrokes saved in this demo.');
    onExpand(saved);
  };

  return (
    <section id="playground" className="editorial-section">
      <div className="section-shell section-space playground-layout">
        <div>
          <p className="section-kicker">Try it for yourself</p>
          <h2 className="section-title">
            A little typing.
            <br />
            <span className="serif-muted">A lot to say.</span>
          </h2>
          <p className="section-description mt-5">
            Place your cursor after <code className="inline-code">/em1</code> and press{' '}
            <kbd className="keycap">Ctrl</kbd> + <kbd className="keycap">Space</kbd>. Or use the
            button below.
          </p>
          <p className="muted-text text-sm mt-4">
            No installation needed. This example stays on this page.
          </p>
        </div>
        <div className="surface-card demo-editor">
          <div className="demo-editor-header">
            <span className="flex items-center gap-1.5" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="demo-document-title">Your next message</span>
            <span className="demo-live-label">Live demo</span>
          </div>
          <label htmlFor="playground-text" className="sr-only">
            Try shortcut expansion
          </label>
          <textarea
            id="playground-text"
            ref={textareaRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setExpanded(false);
              setMessage('Ready when you are.');
            }}
            onKeyDown={(event) => {
              if (event.ctrlKey && event.code === 'Space' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                expand();
              }
            }}
            className="demo-textarea"
            spellCheck={false}
          />
          <div className="demo-editor-actions">
            <button type="button" className="button-primary" onClick={() => expand(true)}>
              Expand shortcut <ArrowUpRight size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="button-reset"
              onClick={() => {
                pendingCursor.current = text === initialText ? null : initialText.length;
                setText(initialText);
                setExpanded(false);
                setMessage('Ready when you are.');
                textareaRef.current?.focus();
                textareaRef.current?.setSelectionRange(initialText.length, initialText.length);
              }}
            >
              <RotateCcw size={14} aria-hidden="true" /> Reset
            </button>
          </div>
          <div className="demo-editor-status" data-expanded={expanded} role="status">
            {message}
          </div>
        </div>
      </div>
    </section>
  );
};
