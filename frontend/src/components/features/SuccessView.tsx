import { motion } from 'motion/react';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { viewVariants } from '../../lib/motion';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

/** Success screen: shows received text with a copy action. */
export function SuccessView() {
  const { state, actions } = useAppStore();
  const [copyFailed, setCopyFailed] = useState(false);

  const copyReceivedText = async () => {
    const copied = await actions.copyText(state.receivedText ?? '');
    setCopyFailed(!copied);
  };

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

        <Panel className="mt-6 p-6">
          <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-left font-mono text-sm leading-relaxed text-text">
            {state.receivedText}
          </p>
          <div className="mt-5 border-t border-border pt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={copyReceivedText}
              aria-label="Copy received text to clipboard"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy text
            </Button>
            {copyFailed && (
              <p className="mt-3 text-xs text-error" role="status">
                Could not reach the clipboard. Select the text above and copy it
                manually.
              </p>
            )}
          </div>
        </Panel>

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
        <div role="alert" aria-atomic="true">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-error">
            Connection failed
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-text-2">
            {state.errorMessage || 'Link failed'}
          </p>
        </div>
        <Button variant="secondary" onClick={actions.reset} className="mt-6">
          Try again
        </Button>
      </div>
    </motion.div>
  );
}
