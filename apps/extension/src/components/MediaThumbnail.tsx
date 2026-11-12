import React, { useEffect, useRef, useState } from 'react';
import type { MediaSnippet, Snippet } from '@fillin/shared';
import { mediaAssets, mediaSnippetService } from '../services/media';
import { useBlobUrl } from '../media/useBlobUrl';
import { formatMediaSize } from '../media/formatMediaSize';

export function MediaThumbnail({ snippet }: { snippet: MediaSnippet }) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumbnail, setThumbnail] = useState<Blob>();
  const [error, setError] = useState(false);
  const url = useBlobUrl(thumbnail);
  useEffect(() => {
    let current = true;
    setThumbnail(undefined);
    setError(false);
    const load = () => {
      void mediaAssets
        .read(snippet.assetId)
        .then((asset) => {
          if (!current) return;
          if (asset) setThumbnail(asset.thumbnail);
          else setError(true);
        })
        .catch(() => {
          if (current) setError(true);
        });
    };
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === 'undefined') load();
    else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          load();
        }
      });
      if (ref.current) observer.observe(ref.current);
    }
    return () => {
      current = false;
      observer?.disconnect();
    };
  }, [snippet.assetId, snippet.updatedAt]);
  return (
    <div
      ref={ref}
      className="media-thumb"
      aria-label={error ? 'File unavailable — open the editor to replace it' : undefined}
    >
      {error ? (
        <span>
          File
          <br />
          unavailable
        </span>
      ) : url ? (
        <img src={url} alt="" onError={() => setError(true)} />
      ) : (
        <span>Image</span>
      )}
    </div>
  );
}

export function MediaLibraryStatus({ snippets }: { snippets: Snippet[] }) {
  const hasMedia = snippets.some((snippet) => snippet.kind === 'media');
  const [status, setStatus] = useState('Checking saved images…');
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!hasMedia) return;
    let current = true;
    setError(false);
    setStatus('Checking saved images…');
    void mediaSnippetService
      .reconcile()
      .then((result) => {
        if (!current) return;
        const usage = `${formatMediaSize(result.referencedBytes)} / 50 MiB`;
        setStatus(
          result.unavailable.length
            ? `${result.unavailable.length} image file${result.unavailable.length === 1 ? '' : 's'} unavailable. Open the editor to replace the file. ${usage}.`
            : `${usage} · Images are ready to try in practice.`
        );
      })
      .catch(() => {
        if (current) {
          setError(true);
          setStatus('Could not check saved images. Your library has been preserved.');
        }
      });
    return () => {
      current = false;
    };
  }, [snippets, hasMedia, retry]);
  if (!hasMedia) return null;
  return (
    <div className="media-library-status">
      <p role={error ? 'alert' : 'status'}>
        {status}{' '}
        {error && (
          <button type="button" onClick={() => setRetry(retry + 1)}>
            Retry
          </button>
        )}
      </p>
      <p>Export a full ZIP backup to keep your snippets and original image files together.</p>
    </div>
  );
}
