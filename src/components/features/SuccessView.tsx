import { motion } from 'framer-motion';
import { Copy, Check, Zap } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { viewVariants } from '../../lib/motion';

/** Success screen: shows received text (with copy) or a generic success badge. */
export function SuccessView() {
  const { state, actions } = useAppStore();

  return (
    <motion.div
      variants={viewVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="z-40 flex flex-col items-center w-full px-4"
    >
      <div className="text-center relative z-50 w-full max-w-lg">
        <div className="text-transfer font-black text-[10px] md:text-xs tracking-[0.4em] mb-6 md:mb-10 uppercase">Harmony Achieved</div>

        {state.receivedText ? (
          <div className="bg-bright/5 border border-bright/10 p-6 md:p-10 rounded-3xl md:rounded-[48px] backdrop-blur-2xl mb-8 md:mb-12 shadow-2xl overflow-hidden">
            <p className="text-text-primary text-base md:text-xl leading-relaxed mb-6 md:mb-10 text-left max-h-60 overflow-y-auto scrollbar-hide font-light italic">
              "{state.receivedText}"
            </p>
            <button
              type="button"
              onClick={() => actions.copyText(state.receivedText ?? '')}
              aria-label="Copy received text to clipboard"
              className="flex items-center gap-3 px-6 md:px-10 py-3 md:py-4 bg-bright/10 hover:bg-bright/20 rounded-xl md:rounded-2xl transition-all active:scale-95 text-[10px] md:text-xs uppercase tracking-widest font-black mx-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              <Copy className="w-4 h-4" />
              Copy to Universe
            </button>
          </div>
        ) : (
          <div className="w-24 h-24 md:w-40 md:h-40 rounded-full bg-transfer/10 border border-transfer/20 flex items-center justify-center mx-auto mb-8 md:mb-12 shadow-glow-transfer">
            <Check className="w-12 h-12 md:w-20 md:h-20 text-transfer" />
          </div>
        )}

        <button
          type="button"
          onClick={actions.reset}
          className="px-10 md:px-16 py-4 md:py-5 rounded-xl md:rounded-2xl bg-bright text-void font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-2xl text-xs md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          Begin New Cycle
        </button>
      </div>
    </motion.div>
  );
}

/** Error screen: shows the error message + retry entry point. */
export function ErrorView() {
  const { state, actions } = useAppStore();

  return (
    <motion.div
      variants={viewVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="z-40 flex flex-col items-center w-full px-4"
    >
      <div className="text-center relative z-50 w-full max-w-lg">
        <div className="text-error font-black text-[10px] md:text-xs tracking-[0.4em] mb-8 uppercase">Cosmos Disrupted</div>
        <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-error/10 border border-error/20 flex items-center justify-center mx-auto mb-8">
          <Zap className="w-10 h-10 md:w-12 md:h-12 text-error" />
        </div>
        <p className="text-text-primary font-black mb-2 uppercase tracking-[0.2em] text-[10px] md:text-xs">
          {state.errorMessage || "Link Failed"}
        </p>
        <button
          type="button"
          onClick={actions.reset}
          className="px-10 md:px-14 py-4 md:py-5 rounded-xl md:rounded-2xl bg-bright text-void font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl mt-8 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          Try Re-Alignment
        </button>
      </div>
    </motion.div>
  );
}
