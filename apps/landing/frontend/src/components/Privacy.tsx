import React from 'react';
import { HardDrive, ShieldCheck, UserRound } from 'lucide-react';

export const Privacy = () => (
  <section id="privacy" className="section-band">
    <div className="section-shell section-space">
      <div className="section-intro">
        <div>
          <p className="eyebrow mb-3">Private by design</p>
          <h2 className="section-title">
            Your browser.
            <br />
            Your business.
          </h2>
        </div>
        <p className="section-description max-w-sm">A small tool that stays close to home.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
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
          <div key={title} className="surface-card p-6">
            <Icon size={21} className="accent-text mb-5" aria-hidden="true" />
            <h3 className="feature-title">{title}</h3>
            <p className="muted-text text-sm">{text}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
