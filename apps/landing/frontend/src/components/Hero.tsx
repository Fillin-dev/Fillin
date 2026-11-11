import React from 'react';
import { DownloadButtons } from './DownloadButtons';

export const Hero = () => (
  <section className="cinematic-hero" aria-labelledby="hero-title">
    <h1 id="hero-title" className="cinematic-title animate-fade-rise">
      Fill in your <em>own blanks.</em>
    </h1>
    <p className="cinematic-description animate-fade-rise-delay">
      Create shortcuts for the things you type every day.
      <br className="hero-copy-break" /> Expand your words across the web, instantly.
    </p>
    <div className="cinematic-actions animate-fade-rise-delay-2">
      <DownloadButtons variant="hero" />
    </div>
  </section>
);
