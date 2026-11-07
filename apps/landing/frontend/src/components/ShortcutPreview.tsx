import React, { useId, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

export function ShortcutPreview({
  trigger,
  content,
  defaultExpanded = false,
}: {
  trigger: string;
  content: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const id = useId();
  return (
    <button
      type="button"
      className="shortcut-preview"
      data-expanded={expanded}
      aria-label={'Preview ' + trigger + ' shortcut'}
      aria-expanded={expanded}
      aria-describedby={expanded ? id : undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setExpanded(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setExpanded(false);
      }}
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
      onClick={() => setExpanded(true)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setExpanded(false);
      }}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="shortcut-trigger">{trigger}</span>
        <ArrowUpRight size={17} aria-hidden="true" />
      </span>
      <span className="shortcut-preview-slot">
        <span className="shortcut-hint" aria-hidden={expanded}>
          Hover, focus or tap to preview
        </span>
        <span id={id} className="shortcut-expansion" aria-hidden={!expanded}>
          {content}
        </span>
      </span>
    </button>
  );
}
