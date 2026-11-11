import React from 'react';
import { ArrowDown, Download, Puzzle } from 'lucide-react';
import release from '../../public/fillin-extension-release.json';

export const DownloadLink = ({ variant = 'primary' }: { variant?: 'primary' | 'hero' | 'nav' }) => (
  <a
    href={`/fillin-extension.zip?v=${release.version}`}
    download={`fillin-extension-${release.version}.zip`}
    aria-label={`Download Fillin ${release.version}`}
    onClick={(event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      window.setTimeout(() => {
        window.location.href = '/install';
      }, 300);
    }}
    className={
      variant === 'primary'
        ? 'button-primary w-full sm:w-auto'
        : `liquid-glass glass-download glass-download-${variant}`
    }
  >
    {variant === 'primary' && <Download size={20} aria-hidden="true" />}
    {variant === 'nav' ? 'Get Fillin' : 'Download Fillin'}
    {variant === 'primary' && ` ${release.version}`}
  </a>
);

export const DownloadButtons = ({ variant = 'content' }: { variant?: 'content' | 'hero' }) => {
  if (variant === 'hero')
    return (
      <div className="hero-downloads">
        <DownloadLink variant="hero" />
        <div className="hero-secondary-links">
          <a href="#playground">
            Try it first <ArrowDown size={12} aria-hidden="true" />
          </a>
          <a href={`/fillin-extension-release.json?v=${release.version}`}>
            Version {release.version} · Release notes
          </a>
        </div>
      </div>
    );
  return (
    <div className="download-buttons">
      <DownloadLink />
      <p className="store-note">
        <Puzzle size={14} aria-hidden="true" /> Chrome Web Store · Coming soon
      </p>
      <a href={`/fillin-extension-release.json?v=${release.version}`} className="text-link">
        Release notes &amp; SHA-256
      </a>
    </div>
  );
};
