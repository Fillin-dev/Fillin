import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
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

  if (path === '/install') {
    return <InstallPage />;
  }

  return (
    <div id="top" className="site-page min-h-screen">
      <Navbar />
      <main>
        <Hero />
        <SocialProof />
        <InteractivePlayground onExpand={(saved) => setDemoKeystrokes((total) => total + saved)} />
        <CommandPaletteShowcase />
        <HowItWorks />
        <Features keystrokesSaved={demoKeystrokes} />
        <Privacy />
        <CTA />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
};
