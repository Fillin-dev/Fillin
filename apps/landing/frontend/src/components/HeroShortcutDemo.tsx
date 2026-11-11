import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';

export const HeroShortcutDemo = () => {
  const demoRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    let visible = false;
    const sync = () => setActive(visible && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(demoRef.current!);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return (
    <div
      ref={demoRef}
      className="hero-shortcut animate-fade-rise-delay"
      role="group"
      aria-label="Shortcut demonstration"
      data-active={active}
    >
      <code className="hero-shortcut-trigger">/email</code>
      <ArrowRight size={16} className="hero-shortcut-arrow" aria-hidden="true" />
      <span className="hero-shortcut-result">
        <code key={replay} className="hero-shortcut-value">
          samprati@example.com
        </code>
      </span>
      <button
        type="button"
        className="hero-shortcut-replay"
        aria-label="Replay shortcut demonstration"
        title="Replay example"
        onClick={() => setReplay((value) => value + 1)}
      >
        <RotateCcw size={14} aria-hidden="true" />
      </button>
    </div>
  );
};
