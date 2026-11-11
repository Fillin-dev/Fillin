import React, { useEffect, useRef, useState } from 'react';
import { Search, Play, Pause, ArrowUpRight } from 'lucide-react';

const snippets = [
  {
    trigger: '/meeting',
    tags: ['work', 'calendar'],
    content: "Let's schedule a quick 15-min call: cal.com/alex",
  },
  {
    trigger: '/followup',
    tags: ['email'],
    content: 'Hi! Following up on our chat earlier this week.',
  },
  { trigger: '/shrug', tags: ['fun'], content: '¯\\_(ツ)_/¯' },
  { trigger: '/today', tags: ['utility'], content: 'Nov 11, 2026' },
];
const descriptions = [
  'Write your message',
  'Open your library',
  'Find your saved words',
  'Search a phrase',
  'Choose your shortcut',
  'Keep the conversation going',
];
const exampleSaved = snippets[0].content.length - snippets[0].trigger.length;

export const CommandPaletteShowcase = () => {
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [visible, setVisible] = useState(false);
  const [documentActive, setDocumentActive] = useState(() => !document.hidden);
  const demoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.15,
    });
    observer.observe(demoRef.current!);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionChanged = () => {
      if (media.matches) setIsPlaying(false);
    };
    const visibilityChanged = () => setDocumentActive(!document.hidden);
    media.addEventListener('change', motionChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', motionChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying || !visible || !documentActive) return;
    const timings = [1400, 700, 600, 1000, 600, 2200];
    const timer = window.setTimeout(() => setStep((value) => (value + 1) % 6), timings[step]);
    return () => window.clearTimeout(timer);
  }, [step, isPlaying, visible, documentActive]);

  const results =
    step >= 3 ? snippets.filter((snippet) => snippet.trigger.includes('meet')) : snippets;
  return (
    <div className="section-shell section-space palette-story">
      <div className="section-copy">
        <p className="section-kicker">Your library, at hand</p>
        <h2 className="section-title">
          Find the words.
          <br />
          <span className="serif-muted">Keep your flow.</span>
        </h2>
        <p className="section-description story-description">
          Search a phrase and bring it into your conversation, without leaving the page.
        </p>
        <div className="palette-keyboard">
          <kbd className="keycap">⌘</kbd>
          <kbd className="keycap">Shift</kbd>
          <kbd className="keycap">K</kbd>
          <span>Open your library</span>
        </div>
        <a href="#playground" className="text-link story-link">
          Try an expansion <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
      <div ref={demoRef} className="palette-demo" aria-label="Snippet library demonstration">
        <div className="palette-toolbar">
          <span className="demo-live-label">Product tour · Example conversation</span>
          <button
            type="button"
            onClick={() => setIsPlaying((value) => !value)}
            className="palette-play"
            title={isPlaying ? 'Pause animation' : 'Play animation'}
            aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
          >
            {isPlaying ? (
              <Pause size={14} aria-hidden="true" />
            ) : (
              <Play size={14} aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="palette-viewport">
          <div>
            <span className="palette-caption">A message, ready to send</span>
            <div className="palette-sample">
              Hey team, are you free tomorrow afternoon?{' '}
              {step === 5 ? (
                <span className="palette-inserted">{snippets[0].content}</span>
              ) : (
                <span className="palette-caret" aria-hidden="true" />
              )}
            </div>
          </div>
          {step >= 2 && step <= 4 && (
            <div className="palette-overlay">
              <div className="palette-window">
                <div className="palette-query">
                  <Search size={16} aria-hidden="true" />
                  <span>{step >= 3 ? 'meet' : 'Search snippets or #tags…'}</span>
                </div>
                <div className="palette-results">
                  {results.map((snippet, index) => (
                    <div
                      key={snippet.trigger}
                      className="palette-result"
                      data-selected={step >= 4 && index === 0}
                    >
                      <div className="palette-result-label">
                        <code>{snippet.trigger}</code>
                        <div className="palette-tags">
                          {snippet.tags.map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                        </div>
                      </div>
                      <span className="palette-result-content" title={snippet.content}>
                        {snippet.content}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="palette-window-footer">
                  <span>Fillin library</span>
                  <span>↑↓ navigate &nbsp; ↵ insert</span>
                </div>
              </div>
            </div>
          )}
          <span className="palette-outcome">
            {step === 5
              ? exampleSaved + ' fewer keystrokes in this example.'
              : 'Your next words are already here.'}
          </span>
        </div>
        <div className="palette-progress">
          <p>{descriptions[step]}</p>
          <div aria-label="Animation steps">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <button
                key={index}
                type="button"
                aria-label={`Jump to animation step ${index + 1}`}
                aria-current={step === index ? 'step' : undefined}
                onClick={() => {
                  setIsPlaying(false);
                  setStep(index);
                }}
              >
                <span />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
