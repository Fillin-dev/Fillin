import React from 'react';
import { ArrowDown, Puzzle } from 'lucide-react';
import { DownloadButtons } from './DownloadButtons';
import { ShortcutPreview } from './ShortcutPreview';

export const Hero = () => (
  <section className="hero-scene">
    <div className="hero-floats" aria-hidden="true">
      <div className="hero-float hero-float-email">
        <span className="hero-float-label">/email</span>
        <span>samprati@example.com</span>
      </div>
      <div className="hero-float hero-float-zoom">
        <span className="hero-float-label">/zoom</span>
        <span>zoom.us/j/123456</span>
      </div>
      <div className="hero-float hero-float-keys">
        <kbd className="keycap">Ctrl + Space</kbd>
      </div>
      <div className="hero-float hero-float-palette">
        <kbd className="keycap">⌘ Shift K</kbd>
        <span>Spotlight</span>
      </div>
    </div>
    <div className="section-shell hero-section">
      <div className="hero-copy">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span className="highlight-pill">100% free</span>
        </div>
        <h1 className="hero-title">
          Fill in your
          <br />
          own blanks.
        </h1>
        <p className="section-description max-w-lg mt-6">
          Turn the things you type every day into shortcuts.
        </p>
        <div className="mt-8">
          <DownloadButtons />
        </div>
        <a href="#playground" className="hero-demo-link">
          Try it before you install <ArrowDown size={15} aria-hidden="true" />
        </a>
      </div>

      <div className="hero-board surface-card">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-5">
          <span className="eyebrow">A little less typing</span>
          <span className="accent-pill">
            <Puzzle size={13} aria-hidden="true" /> Chrome Extension
          </span>
        </div>
        <ShortcutPreview trigger="/email" content="hello@example.com" />
        <div className="hero-board-second">
          <ShortcutPreview
            trigger="/meeting"
            content="Let's find a time to talk. calendar.example.com"
          />
        </div>
        <div className="hero-board-footer">
          <span>
            <kbd className="keycap">Ctrl</kbd>
            <span className="mx-1.5">+</span>
            <kbd className="keycap">Space</kbd>
          </span>
          <span>Your words, expanded.</span>
        </div>
        <div className="hero-board-note">
          <span className="accent-dot" /> Local-first · No account needed
        </div>
      </div>
    </div>
  </section>
);
