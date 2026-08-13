import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { FileIcon } from '../../ui/FileIcon';
import { formatBytes } from '../../../lib/format';
import { usePrefersReducedMotion } from '../../../hooks';
import { BLOB_RADIUS_KEYFRAMES, beamVariants, packetVariants, floatVariants } from '../../../lib/motion';

const PACKET_SIZE = 24.6 * 1024 * 1024;
const CODE = 'A1B2C3';

/** Vertical flow segment: beam + traveling packet between two devices. */
function FlowSegment({ reduced }: { reduced: boolean }) {
  return (
    <div className="relative mx-auto w-px h-12 md:h-16 bg-signal/20" aria-hidden="true">
      <motion.div
        className="absolute inset-x-0 top-0 h-full bg-gradient-to-b from-signal/60 to-transfer/60 origin-top"
        animate={reduced ? { scaleY: 1, opacity: 0.4 } : beamVariants.animate}
      />
      <motion.div
        className="absolute left-1/2 -ml-1 top-0 w-2 h-2 rounded-full bg-bright shadow-glow-signal"
        animate={reduced ? { opacity: 0 } : packetVariants.animate}
      />
    </div>
  );
}

/**
 * Hero centerpiece: laptop → aura core → phone with a looping file packet.
 * Purely decorative; the Hero headline carries the meaning (aria-hidden).
 */
export function DeviceFlowVisual() {
  const prefersReduced = usePrefersReducedMotion();

  return (
    <div
      className="relative mx-auto mt-12 md:mt-16 w-full max-w-[300px] sm:max-w-sm flex flex-col items-center"
      aria-hidden="true"
    >
      {/* Laptop frame */}
      <div className="relative z-10 w-full bg-aura-2 border border-bright/10 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center gap-1.5 mb-3" aria-hidden="true">
          <span className="w-2 h-2 rounded-full bg-bright/15" />
          <span className="w-2 h-2 rounded-full bg-bright/15" />
          <span className="w-2 h-2 rounded-full bg-bright/15" />
          <span className="ml-2 flex-1 h-2 rounded-full bg-bright/10" />
        </div>
        <motion.div
          variants={floatVariants}
          animate={prefersReduced ? undefined : 'animate'}
          className="w-fit flex items-center gap-2 bg-bright/5 border border-bright/10 rounded-xl px-3 py-2"
        >
          <FileIcon name="video.mp4" type="video/mp4" className="w-4 h-4 text-signal shrink-0" />
          <span className="text-[10px] font-bold text-text-primary leading-none">video.mp4</span>
          <span className="text-[9px] text-text-ghost">· {formatBytes(PACKET_SIZE)}</span>
        </motion.div>
      </div>

      <FlowSegment reduced={prefersReduced} />

      {/* Aura core — morphing blob */}
      <div className="relative z-10 flex justify-center">
        <motion.div
          animate={
            prefersReduced
              ? {}
              : { borderRadius: BLOB_RADIUS_KEYFRAMES, rotate: 360 }
          }
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-signal/20 via-transfer/20 to-warn/20 backdrop-blur-2xl border border-bright/10 shadow-glow-signal flex flex-col items-center justify-center gap-1.5"
        >
          <img src="/logo.svg" alt="" className="w-12 h-12 md:w-14 md:h-14 opacity-90" />
          <span className="bg-bright/10 rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-[0.3em] text-text-secondary">
            {CODE}
          </span>
        </motion.div>
      </div>

      <FlowSegment reduced={prefersReduced} />

      {/* Phone frame */}
      <div className="relative z-10 w-fit bg-aura-2 border border-bright/10 rounded-[1.75rem] p-2 shadow-2xl">
        <div className="rounded-[1.4rem] border border-bright/10 bg-void/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-transfer shrink-0" />
            <span className="text-[10px] font-bold text-text-primary">video.mp4 received</span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-bright/5 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-transfer origin-left"
              initial={{ scaleX: 0 }}
              animate={
                prefersReduced
                  ? { scaleX: 1 }
                  : { scaleX: [0, 1, 1, 0] }
              }
              transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
