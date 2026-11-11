import { BackgroundAura, LandingNav, LandingFooter } from '../layout';
import { Hero } from './Hero/Hero';
import { HowItWorks } from './HowItWorks/HowItWorks';
import { WhyAuraShare } from './WhyAuraShare/WhyAuraShare';
import { PrivacySection } from './PrivacySection/PrivacySection';
import { FAQSection } from './FAQSection/FAQSection';
import { FinalCTA } from './FinalCTA/FinalCTA';

/** Full marketing landing page: hero + all sections + footer. */
export function LandingPage() {
  return (
    <div
      id="top"
      className="relative min-h-dvh bg-void overflow-x-hidden font-body text-text-primary selection:bg-signal/30"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[10001] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-bright focus:text-void focus:rounded-xl focus:font-bold focus:text-sm"
      >
        Skip to content
      </a>

      <BackgroundAura />
      <LandingNav />

      <main id="main-content" className="relative z-10">
        <Hero />
        <HowItWorks />
        <WhyAuraShare />
        <PrivacySection />
        <FAQSection />
        <FinalCTA />
      </main>

      <div className="relative z-10">
        <LandingFooter />
      </div>
    </div>
  );
}
