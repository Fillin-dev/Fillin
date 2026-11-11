import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

/** Sample the supplied film into dots so the running silhouette can react to a pointer. */
export const HalftoneHorse = () => {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(false);
  const syncRef = useRef<() => void>();
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const stage = stageRef.current!;
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d');
    const sampler = document.createElement('canvas');
    const sample = sampler.getContext('2d', { willReadFrequently: true });
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let visible = false;
    let loaded = false;
    let rendered = false;
    let canSample = !!context && !!sample;
    let frame = 0;
    let lastFrame = 0;
    let width = 0;
    let height = 0;
    let columns = 0;
    let rows = 0;
    let offsetX = new Float32Array(0);
    let offsetY = new Float32Array(0);
    let ink = '#121b2b';
    let blue = '#2457f5';
    const pointer = { x: 0, y: 0, active: false };

    const draw = (interactive: boolean) => {
      if (!loaded || !width || !context || !sample || !canSample) return;
      try {
        sample.drawImage(video, 0, 0, columns, rows);
        const pixels = sample.getImageData(0, 0, columns, rows).data;
        const spacing = width / columns;
        const reach = Math.min(140, width * 0.23);
        const dots = new Path2D();
        const highlighted = new Path2D();
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < columns; col++) {
            const index = row * columns + col;
            const x = (col + 0.5) * spacing;
            const y = ((row + 0.5) * height) / rows;
            const distance = Math.hypot(x - pointer.x, y - pointer.y);
            const influence = interactive && pointer.active ? Math.max(0, 1 - distance / reach) : 0;
            const push = influence * influence * Math.min(46, width * 0.06);
            const angle = Math.atan2(y - pointer.y, x - pointer.x);
            offsetX[index] += (Math.cos(angle) * push - offsetX[index]) * 0.2;
            offsetY[index] += (Math.sin(angle) * push - offsetY[index]) * 0.2;
            const pixel = index * 4;
            const density = 1 - (pixels[pixel] + pixels[pixel + 1] + pixels[pixel + 2]) / 765;
            if (density < 0.065) continue;
            const radius = Math.min(0.46, Math.sqrt(density) * 0.62) * spacing;
            const path = influence > 0.15 ? highlighted : dots;
            const px = x + (interactive ? offsetX[index] : 0);
            const py = y + (interactive ? offsetY[index] : 0);
            path.moveTo(px + radius, py);
            path.arc(px, py, radius, 0, Math.PI * 2);
          }
        }
        context.clearRect(0, 0, width, height);
        context.fillStyle = ink;
        context.fill(dots);
        context.fillStyle = blue;
        context.fill(highlighted);
        if (!rendered) {
          rendered = true;
          setCanvasReady(true);
        }
      } catch {
        // Keep the original themed film as a fallback if canvas sampling is unavailable.
        canSample = false;
        context.clearRect(0, 0, width, height);
        setCanvasReady(false);
      }
    };
    const canAnimate = () =>
      !disposed && loaded && visible && !document.hidden && !motion.matches && !pausedRef.current;
    const tick = (now: number) => {
      frame = 0;
      if (!canAnimate()) return;
      if (now - lastFrame >= 1000 / 30) {
        draw(true);
        lastFrame = now;
      }
      if (canSample) frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (!canAnimate()) {
        video.pause();
        if (visible && !document.hidden) draw(false);
        return;
      }
      void video
        .play()
        .then(() => {
          if (canAnimate() && canSample && !frame) frame = requestAnimationFrame(tick);
          else if (!canAnimate()) video.pause();
        })
        .catch(() => {
          // Scrolling away can cancel an in-flight play request; that isn't a user pause.
          if (!canAnimate()) return;
          pausedRef.current = true;
          setPaused(true);
          draw(false);
        });
    };
    syncRef.current = sync;
    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      if (!width || !height) return;
      // Bound drawing resolution and particle count on large/retina screens.
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
      columns = Math.min(144, Math.max(48, Math.round(width / 7)));
      rows = Math.round((columns * height) / width);
      sampler.width = columns;
      sampler.height = rows;
      if (sample) sample.imageSmoothingQuality = 'high';
      offsetX = new Float32Array(columns * rows);
      offsetY = new Float32Array(columns * rows);
      if (visible) draw(false);
    };
    const palette = () => {
      const styles = getComputedStyle(stage);
      ink = styles.getPropertyValue('--horse-ink').trim();
      blue = styles.getPropertyValue('--horse-highlight').trim();
      if (visible) draw(false);
    };
    const pointerMove = (event: PointerEvent) => {
      if (motion.matches || pausedRef.current) return;
      const bounds = stage.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      pointer.active = true;
    };
    const pointerLeave = () => {
      pointer.active = false;
    };
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') pointerLeave();
    };
    const loadedData = () => {
      loaded = true;
      draw(false);
      sync();
    };
    const mediaError = () => {
      loaded = false;
      sync();
      setUnavailable(true);
    };
    const motionChange = () => {
      setReducedMotion(motion.matches);
      pointerLeave();
      sync();
    };
    const intersection = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !video.getAttribute('src')) {
          video.src = '/media/halftone-horse.webm';
          video.load();
        }
        sync();
      },
      { threshold: 0.01 }
    );
    const sizeObserver = new ResizeObserver(resize);
    const themeObserver = new MutationObserver(palette);
    intersection.observe(stage);
    sizeObserver.observe(stage);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    stage.addEventListener('pointermove', pointerMove, { passive: true });
    stage.addEventListener('pointerdown', pointerMove, { passive: true });
    stage.addEventListener('pointerleave', pointerLeave);
    stage.addEventListener('pointerup', pointerUp);
    stage.addEventListener('pointercancel', pointerLeave);
    video.addEventListener('loadeddata', loadedData);
    video.addEventListener('error', mediaError);
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', motionChange);
    setReducedMotion(motion.matches);
    palette();
    resize();
    if (video.readyState >= 2) loadedData();
    return () => {
      disposed = true;
      syncRef.current = undefined;
      cancelAnimationFrame(frame);
      video.pause();
      intersection.disconnect();
      sizeObserver.disconnect();
      themeObserver.disconnect();
      stage.removeEventListener('pointermove', pointerMove);
      stage.removeEventListener('pointerdown', pointerMove);
      stage.removeEventListener('pointerleave', pointerLeave);
      stage.removeEventListener('pointerup', pointerUp);
      stage.removeEventListener('pointercancel', pointerLeave);
      video.removeEventListener('loadeddata', loadedData);
      video.removeEventListener('error', mediaError);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', motionChange);
    };
  }, []);

  const toggle = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    syncRef.current?.();
  };
  return (
    <div className="halftone-art" data-testid="footer-halftone">
      <div className="halftone-caption">
        <span>
          <i aria-hidden="true" /> Less repetition. More flow.
        </span>
        {!reducedMotion && !unavailable && (
          <button
            type="button"
            onClick={toggle}
            className="halftone-control"
            aria-label={paused ? 'Resume horse animation' : 'Pause horse animation'}
          >
            {paused ? (
              <Play size={13} aria-hidden="true" />
            ) : (
              <Pause size={13} aria-hidden="true" />
            )}
            <span>{paused ? 'Play' : 'Pause'}</span>
          </button>
        )}
      </div>
      <div ref={stageRef} className="halftone-stage" aria-hidden="true">
        <video
          ref={videoRef}
          className={`halftone-film ${canvasReady || unavailable ? 'halftone-film-hidden' : ''}`}
          width="1922"
          height="1080"
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          tabIndex={-1}
        />
        <canvas ref={canvasRef} className="halftone-canvas" />
      </div>
    </div>
  );
};
