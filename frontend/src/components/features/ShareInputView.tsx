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
      className="z-30 flex w-full justify-center"
    >
      {(['text', 'files'] as const).map((mode) => (
        <div key={mode} role="tabpanel" id={`share-panel-${mode}`}
          aria-labelledby={`share-tab-${mode}`} hidden={state.shareMode !== mode}
          className="w-full max-w-xl">
          {/* Both panels stay mounted so switching tabs keeps the draft and
              the file selection instead of throwing them away. */}
          {mode === 'files'
            ? <AuraDropzone onFileDrop={(f) => actions.startShare(f, undefined)} />
            : <AuraTextarea onTextShare={(t) => actions.startShare(undefined, t)} />}
        </div>
      ))}
    </motion.div>
  );
}
