import React from 'react';
import { DownloadButtons } from './DownloadButtons';

export const CTA = () => {
  return (
    <section className="section-shell section-space">
      <div className="surface-card cta-panel">
        <div>
          <p className="eyebrow mb-3">Start with one shortcut</p>
          <h2 className="section-title">Ready to save time?</h2>
          <p className="muted-text mt-4">Your most-used words are a good place to start.</p>
        </div>
        <div className="min-w-0">
          <DownloadButtons />
        </div>
      </div>
    </section>
  );
};
