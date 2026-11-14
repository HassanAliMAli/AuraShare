import { motion } from 'motion/react';
import { Check, Clock } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { FileIcon } from '../ui/FileIcon';
import { formatBytes } from '../../lib/format';
import { viewVariants } from '../../lib/motion';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

/** Connected receiver screen: file list with selection, per-file progress, download. */
export function ReceiverFileList() {
  const { state, actions } = useAppStore();
  const totalBytes = state.receivedFiles.reduce((s, f) => s + f.size, 0);

  return (
    <motion.div
      variants={viewVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="z-40 flex w-full flex-col items-center px-4"
    >
      <div className="w-full max-w-lg">
        <div className="text-center">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Receiver connected
          </div>
          <div className="mt-3 text-2xl font-medium text-text">
            {state.receivedFiles.length}{' '}
            {state.receivedFiles.length === 1 ? 'file' : 'files'} ready
          </div>
          <div className="mt-1.5 font-mono text-xs text-text-2">{formatBytes(totalBytes)} total</div>
        </div>

        <Panel className="mt-6 overflow-hidden">
          {state.receivedFiles.map((file, i) => (
            <div key={i} className="border-b border-border px-4 py-3 last:border-b-0">
              <div className="flex items-center gap-3 overflow-hidden">
                <input
                  type="checkbox"
                  checked={state.selectedFiles.has(i)}
                  onChange={(e) => {
                    if (state.downloadedFiles.has(i)) return;
                    actions.toggleFileSelected(i, e.target.checked);
                  }}
                  disabled={state.downloadedFiles.has(i)}
                  aria-label={`Select ${file.name}`}
                  className="h-4 w-4 shrink-0 accent-(--color-accent)"
                />
                <FileIcon
                  name={file.name}
                  type={file.type}
                  className="h-4 w-4 shrink-0 text-text-3"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-text">{file.name}</div>
                  <div className="font-mono text-xs text-text-3">{formatBytes(file.size)}</div>
                </div>
                {state.downloadedFiles.has(i) ? (
                  <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                ) : state.downloadingFileIndex === i ? (
                  <motion.div
                    className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border-strong border-t-accent"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    aria-hidden="true"
                  />
                ) : (
                  <Clock className="h-4 w-4 shrink-0 text-text-3" aria-hidden="true" />
                )}
              </div>

              {state.downloadingFileIndex === i && (
                <div
                  className="ml-7 mt-2 h-0.5 w-full overflow-hidden rounded-full bg-border"
                  role="progressbar"
                  aria-label={`Downloading ${file.name}`}
                  aria-valuenow={Math.round(state.transferProgress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <motion.div
                    className="h-full origin-left bg-accent"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: state.transferProgress / 100 }}
                  />
                </div>
              )}
            </div>
          ))}
        </Panel>

        <div className="mt-5 flex gap-3">
          {state.selectedFiles.size > 0 && (
            <Button
              variant="primary"
              onClick={actions.downloadSelected}
              className="flex-1"
            >
              Download ({state.selectedFiles.size})
            </Button>
          )}
          <Button variant="secondary" onClick={actions.reset} className="flex-1">
            End session
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
