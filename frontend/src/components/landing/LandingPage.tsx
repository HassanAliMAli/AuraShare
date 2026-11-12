import { LandingNav, LandingFooter } from '../layout';
import { Hero } from './Hero/Hero';
import { HowItWorks } from './HowItWorks/HowItWorks';
import { Comparison } from './Comparison/Comparison';
import { PrivacySection } from './PrivacySection/PrivacySection';
import { FAQSection } from './FAQSection/FAQSection';
import { FinalCTA } from './FinalCTA/FinalCTA';

/** Full marketing landing page: hero + all sections + footer. */
export function LandingPage() {
  return (
    <div id="top" className="relative min-h-dvh bg-canvas text-text">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[10001] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-ink"
      >
        Skip to content
      </a>

      <LandingNav />

      <main id="main-content" className="relative">
        <Hero />
        <HowItWorks />
        <Comparison />
        <PrivacySection />
        <FAQSection />
        <FinalCTA />
      </main>

      <LandingFooter />
    </div>
  );
}
