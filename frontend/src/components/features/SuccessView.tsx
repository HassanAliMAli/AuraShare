import { motion } from 'framer-motion';
import { Copy, Check } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { viewVariants } from '../../lib/motion';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

/** Success screen: shows received text (with copy) or a completion notice. */
export function SuccessView() {
  const { state, actions } = useAppStore();

  return (
    <motion.div
      variants={viewVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="z-40 flex w-full flex-col items-center px-4"
    >
      <div className="w-full max-w-lg">
        <div className="text-center font-mono text-xs uppercase tracking-[0.18em] text-success">
          Transfer complete
        </div>

        {state.receivedText ? (
          <Panel className="mt-6 p-6">
            <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-left font-mono text-sm leading-relaxed text-text">
              {state.receivedText}
            </p>
            <div className="mt-5 border-t border-border pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => actions.copyText(state.receivedText ?? '')}
                aria-label="Copy received text to clipboard"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Copy text
              </Button>
            </div>
          </Panel>
        ) : (
          <Panel className="mt-6 flex items-center gap-3 p-6">
            <Check className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <p className="text-sm text-text-2">
              The files are ready to download.
            </p>
          </Panel>
        )}

        <Button
          variant="secondary"
          onClick={actions.reset}
          className="mt-6 w-full"
        >
          Start another transfer
        </Button>
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
      className="z-40 flex w-full flex-col items-center px-4"
    >
      <div className="w-full max-w-lg text-center">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-error">
          Connection failed
        </div>
        <p className="mt-4 text-sm leading-relaxed text-text-2">
          {state.errorMessage || 'Link failed'}
        </p>
        <Button variant="secondary" onClick={actions.reset} className="mt-6">
          Try again
        </Button>
      </div>
    </motion.div>
  );
}
