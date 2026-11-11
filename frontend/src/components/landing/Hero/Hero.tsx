import { motion } from 'framer-motion';
import { HERO } from '../../../lib/landingCopy';
import { navigate } from '../../../lib/router';
import { staggerContainer, staggerItem } from '../../../lib/motion';
import { DeviceFlowVisual } from '../DeviceFlowVisual/DeviceFlowVisual';

/** Hero: positioning statement, CTAs, trust strip, and the device-flow visual. */
export function Hero() {
  return (
    <section className="relative pt-20 md:pt-28 pb-16 md:pb-24 px-4">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="max-w-3xl mx-auto text-center"
      >
        <motion.p
          variants={staggerItem}
          className="text-[10px] md:text-xs font-black uppercase tracking-[0.4em] text-signal"
        >
          {HERO.eyebrow}
        </motion.p>

        <motion.h1
          variants={staggerItem}
          className="mt-4 text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-text-primary font-display leading-[1.05]"
        >
          {HERO.title}
        </motion.h1>

        <motion.p
          variants={staggerItem}
          className="mt-5 text-base md:text-lg text-text-secondary max-w-xl mx-auto leading-relaxed"
        >
          {HERO.subtitle}
        </motion.p>

        <motion.div
          variants={staggerItem}
          className="mt-8 flex flex-col xs:flex-row items-center justify-center gap-3 md:gap-4"
        >
          <button
            type="button"
            onClick={() => navigate('/app')}
            className="w-full xs:w-auto bg-bright text-void font-black uppercase tracking-widest rounded-xl md:rounded-2xl px-8 md:px-10 py-4 text-xs md:text-sm hover:scale-105 active:scale-95 transition-all shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            {HERO.ctaPrimary} →
          </button>
          <a
            href="#how-it-works"
            className="w-full xs:w-auto bg-bright/5 hover:bg-bright/10 border border-bright/10 text-text-secondary font-black uppercase tracking-widest rounded-xl md:rounded-2xl px-8 md:px-10 py-4 text-xs md:text-sm hover:scale-105 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            {HERO.ctaSecondary}
          </a>
        </motion.div>

        <motion.div
          variants={staggerItem}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[8px] md:text-[10px] uppercase tracking-[0.3em] text-text-ghost font-black"
        >
          {HERO.trust.map((item, i) => (
            <span key={item} className="flex items-center gap-3">
              {i > 0 && <span className="opacity-50">•</span>}
              {item}
            </span>
          ))}
        </motion.div>
      </motion.div>

      <DeviceFlowVisual />
    </section>
  );
}
