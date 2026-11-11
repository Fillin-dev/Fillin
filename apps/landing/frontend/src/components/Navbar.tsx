import React from 'react';
import { PRODUCT_NAME } from '@fillin/shared';
import { ThemeControl } from './ThemeControl';
import { DownloadLink } from './DownloadButtons';

export const Navbar = ({ cinematic = false }: { cinematic?: boolean }) => (
  <nav aria-label="Primary" className={cinematic ? 'cinematic-navbar' : 'site-navbar page-navbar'}>
    <div className={cinematic ? 'cinematic-nav-shell' : 'section-shell'}>
      <div className="nav-row">
        <a href="/#top" aria-label="Fillin home" className="nav-brand">
          <img src="/logo.svg" alt="" className="nav-logo dark:invert" />
          <span className="brand-wordmark">{PRODUCT_NAME}</span>
        </a>
        <div className="nav-links">
          <a href="/#how-it-works">How it works</a>
          <a href="/#features">Features</a>
          <a href="/#privacy">Privacy</a>
        </div>
        <div className="nav-actions">
          <ThemeControl compact={cinematic} />
          <a
            href="https://github.com/Fillin-dev/Fillin"
            target="_blank"
            rel="noopener noreferrer"
            className={cinematic ? 'nav-github liquid-glass' : 'nav-github'}
            aria-label="Star Fillin on GitHub"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.66-.31-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 24 12C24 5.37 18.63 0 12 0Z" />
            </svg>
          </a>
          {cinematic && <DownloadLink variant="nav" />}
        </div>
      </div>
    </div>
  </nav>
);
