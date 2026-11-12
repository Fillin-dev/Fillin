import React, { useEffect, useState } from 'react';
import { useBlobUrl } from './useBlobUrl';

export function MediaPreview({
  original,
  thumbnail,
  animated,
  alt,
  onError,
}: {
  original: Blob;
  thumbnail: Blob;
  animated: boolean;
  alt: string;
  onError?: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setPlaying(false);
  }, [original]);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (query.matches) setPlaying(false);
    };
    const hide = () => {
      if (document.hidden) setPlaying(false);
    };
    query.addEventListener('change', stop);
    document.addEventListener('visibilitychange', hide);
    return () => {
      query.removeEventListener('change', stop);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  const url = useBlobUrl(animated && playing ? original : thumbnail);
  return (
    <div className="media-visual">
      {url && <img src={url} alt={alt} onError={onError} />}
      {animated && (
        <button
          type="button"
          className="media-play"
          aria-pressed={playing}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? 'Pause GIF' : 'Play GIF'}
        </button>
      )}
    </div>
  );
}
