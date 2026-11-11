import React from 'react';
import { HardDrive, ShieldCheck, UserRound } from 'lucide-react';

export const Privacy = () => (
  <section id="privacy" className="privacy-section">
    <div className="section-shell section-space privacy-layout">
      <div>
        <p className="section-kicker">Private by design</p>
        <h2 className="section-title">
          Your browser.
          <br />
          <span className="serif-muted">Your business.</span>
        </h2>
      </div>
      <div className="privacy-list">
        {[
          {
            Icon: HardDrive,
            title: 'Stored locally',
            text: 'Your snippet library lives on your device.',
          },
          {
            Icon: ShieldCheck,
            title: 'No tracking',
            text: 'Your typing and usage stay in your browser.',
          },
          {
            Icon: UserRound,
            title: 'No account',
            text: 'Install Fillin and make your first shortcut.',
          },
        ].map(({ Icon, title, text }) => (
          <article key={title}>
            <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
            <div>
              <h3 className="feature-title">{title}</h3>
              <p className="muted-text">{text}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
);
