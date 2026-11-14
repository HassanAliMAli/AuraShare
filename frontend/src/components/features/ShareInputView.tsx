import { motion } from 'motion/react';
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
      role="tabpanel"
      id={`share-panel-${state.shareMode}`}
      aria-labelledby={`share-tab-${state.shareMode}`}
      className="z-30 flex w-full justify-center"
    >
      <div className="w-full max-w-xl">
        {state.shareMode === 'files' ? (
          <AuraDropzone onFileDrop={(f) => actions.startShare(f, undefined)} />
        ) : (
          <AuraTextarea onTextShare={(t) => actions.startShare(undefined, t)} />
        )}
      </div>
    </motion.div>
  );
}
