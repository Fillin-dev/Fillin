import React from 'react';
import { HalftoneHorse } from './HalftoneHorse';

export const Footer = () => (
  <footer id="footer" className="site-footer">
    <div className="section-shell footer-links">
      <a href="/#top" className="footer-brand" aria-label="Fillin home">
        <img src="/logo.svg" alt="" className="w-6 h-6 dark:invert" />
        <span>Fillin</span>
      </a>
      <p>&copy; {new Date().getFullYear()} Fillin. Zero tracking. Just your words.</p>
      <a
        href="https://github.com/Fillin-dev/Fillin"
        target="_blank"
        rel="noopener noreferrer"
        className="footer-github"
      >
        Find us on GitHub <span aria-hidden="true">↗</span>
      </a>
    </div>
    <div className="section-shell footer-art">
      <HalftoneHorse />
    </div>
  </footer>
);
