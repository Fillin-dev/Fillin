import React from 'react';

export const HowItWorks = () => (
  <section id="how-it-works" className="section-shell section-space">
    <div className="section-intro">
      <div>
        <p className="eyebrow mb-3">From thought to shortcut</p>
        <h2 className="section-title">Make it yours in three steps.</h2>
      </div>
    </div>
    <div className="surface-card steps-grid">
      <div className="step-item">
        <span className="step-number">01</span>
        <h3 className="feature-title">Save your words</h3>
        <p className="muted-text">Pair a short trigger with a phrase you type often.</p>
        <code className="inline-code mt-5 inline-block">/email → you@example.com</code>
      </div>
      <div className="step-item">
        <span className="step-number">02</span>
        <h3 className="feature-title">Find your place</h3>
        <p className="muted-text">Open a website text field and type your trigger.</p>
        <code className="inline-code mt-5 inline-block">Hello, reach me at /email</code>
      </div>
      <div className="step-item">
        <span className="step-number">03</span>
        <h3 className="feature-title">Let it expand</h3>
        <p className="muted-text">Press the shortcut. Your saved text takes its place.</p>
        <div className="mt-5">
          <kbd className="keycap">Ctrl</kbd> + <kbd className="keycap">Space</kbd>
        </div>
      </div>
    </div>
  </section>
);
