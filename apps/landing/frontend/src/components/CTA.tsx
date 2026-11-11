import React from 'react';
import { DownloadButtons } from './DownloadButtons';

export const CTA = () => (
  <section className="section-shell section-space closing-section">
    <p className="section-kicker">Start with one shortcut</p>
    <h2 className="closing-title">
      Make room
      <br />
      <span className="serif-muted">for what's next.</span>
    </h2>
    <p className="section-description">Your most-used words, just a shortcut away.</p>
    <DownloadButtons />
  </section>
);
