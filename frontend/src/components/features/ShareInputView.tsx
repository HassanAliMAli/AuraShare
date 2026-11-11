import { motion } from 'framer-motion';
import { AuraDropzone } from '../AuraDropzone';
import { AuraTextarea } from '../AuraTextarea';
import { useAppStore } from '../../stores/appStore';
import { shareInputVariants } from '../../lib/motion';

/** Idle share surface: dropzone (files) or textarea (text) per active mode. */
export function ShareInputView() {
  const { state, actions } = useAppStore();

  return (
    <motion.div
      variants={shareInputVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="z-30 w-full flex justify-center"
    >
      <div className="w-full max-w-[90vw] md:max-w-xl">
        {state.shareMode === 'files' ? (
          <AuraDropzone onFileDrop={(f) => actions.startShare(f, undefined)} />
        ) : (
          <AuraTextarea onTextShare={(t) => actions.startShare(undefined, t)} />
        )}
      </div>
    </motion.div>
  );
}
