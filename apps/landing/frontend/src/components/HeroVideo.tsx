import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

export const HERO_VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';
const POSTER = '/media/cinematic-poster.jpg';
type DataConnection = Partial<Pick<EventTarget, 'addEventListener' | 'removeEventListener'>> & {
  saveData?: boolean;
};

export const HeroVideo = () => {
  const mediaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const syncRef = useRef<() => void>();
  const manualPause = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [failed, setFailed] = useState(false);
  const [limitedMotion, setLimitedMotion] = useState(
    () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !!(navigator as Navigator & { connection?: DataConnection }).connection?.saveData
  );

  useEffect(() => {
    const video = videoRef.current!;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: DataConnection }).connection;
    let disposed = false;
    let visible = false;
    let mediaFailed = false;
    const limited = () => motion.matches || !!connection?.saveData;
    const shouldPlay = () =>
      !disposed &&
      visible &&
      !document.hidden &&
      !limited() &&
      !manualPause.current &&
      !mediaFailed;

    const sync = () => {
      if (disposed) return;
      if (!shouldPlay()) {
        video.pause();
        // Cancel buffering when a visitor switches to reduced motion or data saving.
        if (limited() && video.hasAttribute('src')) {
          video.removeAttribute('src');
          video.load();
          setHasFrame(false);
        }
        return;
      }
      if (!video.hasAttribute('src')) {
        video.src = HERO_VIDEO_SRC;
        video.load();
      }
      void video
        .play()
        .then(() => {
          if (!shouldPlay()) video.pause();
        })
        .catch(() => {
          // A pause during loading cancels play; autoplay denial leaves a working play button.
          if (shouldPlay()) setPlaying(false);
        });
    };
    const preferencesChanged = () => {
      setLimitedMotion(limited());
      sync();
    };
    const onPlaying = () => {
      if (!shouldPlay()) {
        video.pause();
        return;
      }
      setPlaying(true);
      setHasFrame(true);
    };
    const onPause = () => {
      if (!disposed) setPlaying(false);
    };
    const onLoaded = () => {
      if (!disposed && video.readyState >= 2 && !limited()) setHasFrame(true);
    };
    const onError = () => {
      mediaFailed = true;
      setFailed(true);
      setHasFrame(false);
      sync();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { threshold: 0.01 }
    );
    syncRef.current = sync;
    observer.observe(mediaRef.current!);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);
    motion.addEventListener('change', preferencesChanged);
    connection?.addEventListener?.('change', preferencesChanged);
    document.addEventListener('visibilitychange', sync);

    return () => {
      disposed = true;
      syncRef.current = undefined;
      observer.disconnect();
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      motion.removeEventListener('change', preferencesChanged);
      connection?.removeEventListener?.('change', preferencesChanged);
      document.removeEventListener('visibilitychange', sync);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, []);

  return (
    <>
      <div ref={mediaRef} className="cinematic-media" aria-hidden="true">
        <img
          src={POSTER}
          width="1600"
          height="894"
          alt=""
          fetchPriority="high"
          className="cinematic-poster"
        />
        <video
          ref={videoRef}
          className="cinematic-video"
          data-ready={hasFrame && !failed}
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          poster={POSTER}
          disablePictureInPicture
          tabIndex={-1}
        />
      </div>
      {!limitedMotion && !failed && (
        <button
          type="button"
          className="cinematic-playback liquid-glass"
          aria-label={playing ? 'Pause background video' : 'Play background video'}
          onClick={() => {
            manualPause.current = playing;
            syncRef.current?.();
          }}
        >
          {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
        </button>
      )}
    </>
  );
};
