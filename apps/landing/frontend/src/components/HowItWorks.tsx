import React from 'react';

export const HowItWorks = () => (
  <section id="how-it-works" className="steps-section">
    <div className="section-shell section-space">
      <div className="section-intro">
        <div>
          <p className="section-kicker">A simpler way to write</p>
          <h2 className="section-title">
            Make it yours.
            <br />
            <span className="serif-muted">In three steps.</span>
          </h2>
        </div>
        <p className="section-description section-copy">
          Your everyday phrases, ready when you need them.
        </p>
      </div>
      <div className="steps-grid">
        <article className="step-item">
          <span className="step-number" aria-hidden="true">
            01
          </span>
          <h3 className="feature-title">Save your words</h3>
          <p className="muted-text">Pair a short trigger with a phrase you type often.</p>
          <code className="inline-code step-example">/email → you@example.com</code>
        </article>
        <article className="step-item">
          <span className="step-number" aria-hidden="true">
            02
          </span>
          <h3 className="feature-title">Find your place</h3>
          <p className="muted-text">Type the trigger in a website text field.</p>
          <code className="inline-code step-example">Reach me at /email</code>
        </article>
        <article className="step-item">
          <span className="step-number" aria-hidden="true">
            03
          </span>
          <h3 className="feature-title">Let it expand</h3>
          <p className="muted-text">Press the shortcut. Your saved text takes its place.</p>
          <div className="step-example">
            <kbd className="keycap">Ctrl</kbd>
            <span className="key-plus">+</span>
            <kbd className="keycap">Space</kbd>
          </div>
        </article>
      </div>
    </div>
  </section>
);
