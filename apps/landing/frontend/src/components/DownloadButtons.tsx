import React from 'react';
import { Download, Puzzle } from 'lucide-react';
import release from '../../public/fillin-extension-release.json';

export const DownloadButtons = () => {
  return (
    <div className="flex flex-col gap-4 items-center">
      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full">
      <a 
        href={`/fillin-extension.zip?v=${release.version}`}
        download={`fillin-extension-${release.version}.zip`}
        onClick={() => {
          setTimeout(() => {
            window.location.href = '/install';
          }, 300);
        }}
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-6 py-4 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-950 rounded-full font-semibold hover:bg-gray-800 dark:hover:bg-white transition-colors w-full sm:w-auto justify-center"
      >
        <Download size={20} />
        Download Fillin {release.version}
      </a>
      <button 
        disabled
        className="flex items-center gap-2 px-6 py-4 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full font-semibold border border-gray-200 dark:border-gray-700 cursor-not-allowed w-full sm:w-auto justify-center"
        title="Coming soon to the Chrome Web Store"
      >
        <Puzzle size={20} />
        Chrome Web Store (Coming Soon)
      </button>
      </div>
      <a href={`/fillin-extension-release.json?v=${release.version}`} className="text-sm text-gray-500 dark:text-gray-400 underline underline-offset-4">
        Release notes &amp; SHA-256
      </a>
    </div>
  );
};
