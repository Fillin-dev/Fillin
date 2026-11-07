import React, { useState } from 'react';
import { ArrowUpRight, Check, Download, Keyboard, Lock, Tag, Zap } from 'lucide-react';
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
    <section id="features" className="section-shell section-space">
      <div className="section-intro">
        <div>
          <p className="eyebrow mb-3">The everyday essentials</p>
          <h2 className="section-title">
            Small shortcuts.
            <br />
            More room to work.
          </h2>
        </div>
        <p className="section-description max-w-sm">
          Less repetition, a tidier library, and words that stay yours.
        </p>
      </div>
      <div className="feature-grid">
        <article className="surface-card feature-card feature-wide">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <span className="feature-icon">
              <Zap size={23} aria-hidden="true" />
            </span>
            <span className="highlight-pill">Try the demo above</span>
          </div>
          <div className="demo-metric">
            <output
              aria-label="Demo keystrokes saved"
              aria-live="polite"
              className="demo-count"
              key={keystrokesSaved}
            >
              {keystrokesSaved.toLocaleString()}
            </output>
            <span className="muted-text text-sm">keystrokes saved in this demo</span>
          </div>
          <div>
            <h3 className="feature-title">Less typing. You can count on it.</h3>
            <p className="muted-text">
              Run an expansion in the playground and watch this number grow. This counter is just
              for your visit.
            </p>
          </div>
          <a className="text-link mt-5" href="#playground">
            Give it a try <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </article>

        <article className="surface-card feature-card feature-local">
          <div className="flex items-center justify-between gap-3">
            <span className="feature-icon">
              <Lock size={23} aria-hidden="true" />
            </span>
            <span className="accent-pill">
              <Check size={12} aria-hidden="true" /> Local-first
            </span>
          </div>
          <div className="my-7">
            <h3 className="feature-title">Your words stay with you.</h3>
            <p className="muted-text">
              Snippets live in your browser. Export a JSON backup whenever you need it.
            </p>
          </div>
          <div className="backup-preview">
            <span className="font-mono text-xs break-all">fillin-backup.json</span>
            <Download size={18} aria-hidden="true" />
          </div>
        </article>

        <article className="surface-card feature-card">
          <span className="feature-icon">
            <Tag size={23} aria-hidden="true" />
          </span>
          <div className="my-6">
            <h3 className="feature-title">A place for every phrase.</h3>
            <p className="muted-text">
              Choose a tag to see its shortcut. Preview the full text below.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Example tags">
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

        <article className="surface-card feature-card feature-wide">
          <span className="feature-icon">
            <Keyboard size={23} aria-hidden="true" />
          </span>
          <div className="my-6">
            <h3 className="feature-title">One shortcut. Everyday places.</h3>
            <p className="muted-text">
              Use saved phrases in forms, email, and rich-text editors. Try a couple of examples.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <ShortcutPreview
              trigger="/thanks"
              content="Thanks for your help. I really appreciate it!"
            />
            <ShortcutPreview
              trigger="/intro"
              content="Hello! Great to meet you. Here's a little about me."
            />
          </div>
          <div className="flex flex-wrap gap-2 mt-5" aria-label="Supported editor examples">
            {['Gmail', 'Notion', 'Google Docs', 'Text fields'].map((app) => (
              <span key={app} className="editor-chip">
                {app}
              </span>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
};
