import React from 'react';
import { Download, Puzzle } from 'lucide-react';
import release from '../../public/fillin-extension-release.json';

export const DownloadButtons = () => {
  return (
    <div className="flex flex-col gap-3 items-start">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch w-full">
        <a
          href={`/fillin-extension.zip?v=${release.version}`}
          download={`fillin-extension-${release.version}.zip`}
          onClick={() => {
            setTimeout(() => {
              window.location.href = '/install';
            }, 300);
          }}
          rel="noopener noreferrer"
          className="button-primary w-full sm:w-auto"
        >
          <Download size={20} />
          Download Fillin {release.version}
        </a>
        <button
          disabled
          className="button-secondary cursor-not-allowed w-full sm:w-auto"
          title="Coming soon to the Chrome Web Store"
        >
          <Puzzle size={20} />
          Web Store · Coming soon
        </button>
      </div>
      <a href={`/fillin-extension-release.json?v=${release.version}`} className="text-link">
        Release notes &amp; SHA-256
      </a>
    </div>
  );
};
