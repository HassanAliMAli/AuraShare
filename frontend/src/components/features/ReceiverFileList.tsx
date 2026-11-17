import { motion } from 'motion/react';
import { Check, Clock } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { FileIcon } from '../ui/FileIcon';
import { formatBytes } from '../../lib/format';
import { viewVariants } from '../../lib/motion';
import { Button } from '../ui/Button';
import { MAX_FILE_SIZE } from '../../lib/validation';
import { matchesPartial } from '../../lib/direct-save';
import { Panel } from '../ui/Panel';

/** Connected receiver screen: file list with selection, per-file progress, download. */
export function ReceiverFileList() {
  const { state, actions } = useAppStore();
  const busy = state.downloadingFileIndex !== null || state.directIndex !== null || state.checkpointBusy;
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
        {state.receivedFiles.length === 0 ? (
          <p role="status" className="text-center text-sm text-text-2">
            The sender is preparing the transfer. Files will appear here when ready.
          </p>
        ) : (
          <>
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
                    {/* WCAG 2.5.8 asks for a 24px target; the box stays 16px,
                        the label around it supplies the rest. */}
                    <label className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={state.selectedFiles.has(i)}
                        onChange={(e) => {
                          if (state.downloadedFiles.has(i) || state.readyFiles.has(i) || state.savedFiles.has(i)) return;
                          actions.toggleFileSelected(i, e.target.checked);
                        }}
                        disabled={
                          state.downloadedFiles.has(i) ||
                          state.readyFiles.has(i) ||
                          busy || state.savedFiles.has(i) || file.size > MAX_FILE_SIZE
                        }
                        aria-label={`Select ${file.name}`}
                        className="h-4 w-4 accent-(--color-accent)"
                      />
                    </label>
                    <FileIcon
                      name={file.name}
                      type={file.type}
                      className="h-4 w-4 shrink-0 text-text-3"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-text">{file.name}</div>
                      <div className="font-mono text-xs text-text-3">{formatBytes(file.size)}</div>
                    </div>
                    {state.savedFiles.has(i) ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-success" role="status">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Saved to disk
                      </span>
                    ) : state.downloadedFiles.has(i) ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-success">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Download started
                      </span>
                    ) : state.readyFiles.has(i) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => actions.saveFile(i)}
                        aria-label={`Save ${file.name}`}
                      >
                        Save
                      </Button>
                    ) : (state.downloadingFileIndex === i || state.directIndex === i) ? (
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

                  {state.directAvailable && !state.savedFiles.has(i) && !state.downloadedFiles.has(i) &&
                    !state.readyFiles.has(i) && (
                    <div className="ml-7 mt-2 flex flex-wrap gap-2">
                      {state.checkpoint && matchesPartial(state.checkpoint, file) ? (
                        <>
                          <Button size="sm" variant="secondary" disabled={busy || (state.failedFileIndex !== null && !state.directFailed)}
                            aria-label={`Resume ${file.name}`} onClick={() => actions.saveDirect(i, 'resume')}>Resume</Button>
                          <Button size="sm" variant="muted" disabled={busy || (state.failedFileIndex !== null && !state.directFailed)}
                            aria-label={`Start ${file.name} over`} onClick={() => actions.saveDirect(i, 'restart')}>Start over</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="secondary" disabled={busy || (state.failedFileIndex !== null && !state.directFailed)}
                          aria-label={`Save ${file.name} directly`}
                          onClick={() => actions.saveDirect(i, state.checkpoint ? 'direct-only' : 'new')}>Save directly</Button>
                      )}
                      {(state.directFailed || state.directError) && (!state.checkpoint || matchesPartial(state.checkpoint, file)) && (
                        <Button size="sm" variant="muted" disabled={busy || (state.failedFileIndex !== null && !state.directFailed)}
                          aria-label={`Save ${file.name} without a checkpoint`}
                          onClick={() => actions.saveDirect(i, 'direct-only')}>Save without checkpoint</Button>
                      )}
                    </div>
                  )}
                  {file.size > MAX_FILE_SIZE && <p className="ml-7 mt-1 text-xs text-text-2">Requires direct save.</p>}
                  {(state.downloadingFileIndex === i || state.directIndex === i) && (
                    <div
                      className="ml-7 mt-2 h-0.5 w-full overflow-hidden rounded-full bg-border"
                      role="progressbar"
                      aria-label={`Receiving ${file.name}`}
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
          </>
        )}

        {state.receivedFiles.length > 0 && !state.directAvailable && (
          <p role="status" className="mt-4 text-sm text-text-2">
            Direct saving is unavailable with this browser or peer. You can receive files up to 256 MiB and save them individually.
          </p>
        )}
        {state.directIndex !== null && state.transferProgress === 0 && (
          <p role="status" className="mt-4 text-sm text-text-2">
            Preparing the destination and verifying the file before transfer.
          </p>
        )}
        {state.waitingForMemory && (
          <p role="status" className="mt-4 text-sm text-text-2">
            Waiting for memory. Save a received file to free the space it holds.
          </p>
        )}
        {state.transferError && (
          <div className="mt-4 border border-error/40 p-3" role="alert">
            <p className="text-sm text-error">{state.transferError}</p>
            {state.failedFileIndex !== null && (
              <div className="mt-3 flex gap-3">
                {!state.directFailed && <Button onClick={actions.retryTransfer}>Retry file</Button>}
                <Button onClick={actions.skipTransfer}>Skip file</Button>
              </div>
            )}
          </div>
        )}
        {(state.downloadingFileIndex !== null || state.directIndex !== null) && (
          <Button variant="muted" className="mt-4" onClick={actions.cancelTransfer}>Cancel current file</Button>
        )}
        {state.readyFiles.size > 0 && (
          <p role="status" className="mt-4 text-sm text-text-2">
            Received files stay in memory until you save them.
            {' '}Use Save on each file to start its download. Your browser controls where it is saved.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          {state.selectedFiles.size > 0 && (
            <Button
              variant={state.readyFiles.size > 0 ? 'secondary' : 'primary'}
              onClick={actions.downloadSelected}
              disabled={busy || state.failedFileIndex !== null}
              className="flex-1"
            >
              Receive ({state.selectedFiles.size})
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
