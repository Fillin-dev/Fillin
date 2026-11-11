import React, { useState } from 'react';
import { Download, ArrowUpRight, FolderOpen, Keyboard, Lock } from 'lucide-react';
import { ShortcutPreview } from './ShortcutPreview';

const examples = {
  '#work': { trigger: '/meeting', content: "Let's hop on a quick call" },
  '#email': { trigger: '/followup', content: 'Following up on our previous note' },
  '#dev': { trigger: '/pr', content: 'LGTM! Merged to main branch' },
  '#support': { trigger: '/refund', content: 'Your refund has been processed' },
};

export const Features = ({ keystrokesSaved }: { keystrokesSaved: number }) => {
  const [activeTag, setActiveTag] = useState<keyof typeof examples>('#work');
  const example = examples[activeTag];
  return (
    <div className="section-shell capability-grid">
      <article className="capability-card capability-tags">
        <FolderOpen size={20} strokeWidth={1.5} className="capability-icon" aria-hidden="true" />
        <h3 className="feature-title">A place for every phrase.</h3>
        <p className="muted-text">Group your words with tags. Pick one to try a shortcut.</p>
        <div className="tag-choices" role="group" aria-label="Example tags">
          {(Object.keys(examples) as (keyof typeof examples)[]).map((tag) => (
            <button
              key={tag}
              className="tag-option"
              aria-pressed={activeTag === tag}
              onClick={() => setActiveTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <p className="sr-only" role="status">
          {example.trigger + ' → ' + example.content}
        </p>
        <ShortcutPreview key={activeTag} {...example} defaultExpanded />
      </article>
      <article className="capability-card capability-backup">
        <Lock size={20} strokeWidth={1.5} className="capability-icon" aria-hidden="true" />
        <h3 className="feature-title">Keep a copy. Keep it yours.</h3>
        <p className="muted-text">
          Your snippets stay in your browser. Export a JSON backup from the extension whenever you
          need it.
        </p>
        <div className="backup-preview">
          <span className="font-mono text-xs break-all">fillin-backup.json</span>
          <Download size={17} aria-hidden="true" />
        </div>
        <span className="capability-note">Local storage. A backup on your terms.</span>
      </article>
      <article className="capability-card capability-metric">
        <span className="section-kicker">A little less typing</span>
        <output
          aria-label="Demo keystrokes saved"
          aria-live="polite"
          className="demo-count"
          key={keystrokesSaved}
        >
          {keystrokesSaved.toLocaleString()}
        </output>
        <h3 className="feature-title">Keystrokes saved in this demo.</h3>
        <p className="muted-text">
          Try an expansion above and watch this number grow. Just for your visit.
        </p>
        <a className="text-link" href="#playground">
          Try another shortcut <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </article>
      <article className="capability-card capability-editors">
        <Keyboard size={20} strokeWidth={1.5} className="capability-icon" aria-hidden="true" />
        <h3 className="feature-title">Your words. Everyday places.</h3>
        <p className="muted-text">
          From a quick reply to a warm introduction. Hover, focus, or tap to preview.
        </p>
        <div className="editor-examples">
          <ShortcutPreview
            trigger="/thanks"
            content="Thanks for your help. I really appreciate it!"
          />
          <ShortcutPreview
            trigger="/intro"
            content="Hello! Great to meet you. Here's a little about me."
          />
        </div>
        <div className="editor-places" aria-label="Supported editor examples">
          Gmail <span>·</span> Notion <span>·</span> Google Docs <span>·</span> Text fields
        </div>
      </article>
    </div>
  );
};
