import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Star } from 'lucide-react';

export const SocialProof = () => {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetch('https://api.github.com/repos/Fillin-dev/Fillin', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const count = data?.stargazers_count;
        if (active && Number.isSafeInteger(count) && count >= 0) setStars(count);
      })
      .catch(() => {
        /* The repository link remains useful when counts are unavailable. */
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  return (
    <div className="product-facts">
      <div className="section-shell facts-row">
        <ul aria-label="Fillin at a glance">
          <li>Free to use</li>
          <li>Local-first</li>
          <li>No account needed</li>
        </ul>
        <a href="https://github.com/Fillin-dev/Fillin" target="_blank" rel="noopener noreferrer">
          {stars !== null && <Star size={14} aria-hidden="true" />}
          {stars === null ? 'Open source on GitHub' : stars.toLocaleString() + ' stars on GitHub'}
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
};
