import React, { useLayoutEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { HeroVideo } from './components/HeroVideo';
import { SocialProof } from './components/SocialProof';
import { HowItWorks } from './components/HowItWorks';
import { InteractivePlayground } from './components/InteractivePlayground';
import { CommandPaletteShowcase } from './components/CommandPaletteShowcase';
import { Features } from './components/Features';
import { Privacy } from './components/Privacy';
import { CTA } from './components/CTA';
import { FAQ } from './components/FAQ';
import { Footer } from './components/Footer';
import { InstallPage } from './components/InstallPage';

export const App = () => {
  const [demoKeystrokes, setDemoKeystrokes] = useState(0);
  const path = window.location.pathname;

  useLayoutEffect(() => {
    if (path === '/install' || !window.location.hash) return;
    // React mounts after the browser's initial fragment lookup on a cross-page link.
    try {
      document
        .getElementById(decodeURIComponent(window.location.hash.slice(1)))
        ?.scrollIntoView({ block: 'start' });
    } catch {
      /* Ignore malformed fragments while keeping the page usable. */
    }
  }, [path]);

  if (path === '/install') {
    return <InstallPage />;
  }

  return (
    <div id="top" className="site-page min-h-screen">
      <header className="cinematic-entry">
        <HeroVideo />
        <Navbar cinematic />
        <Hero />
      </header>
      <main>
        <SocialProof />
        <InteractivePlayground onExpand={(saved) => setDemoKeystrokes((total) => total + saved)} />
        <HowItWorks />
        <section id="features" className="product-story">
          <CommandPaletteShowcase />
          <Features keystrokesSaved={demoKeystrokes} />
        </section>
        <Privacy />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
};
