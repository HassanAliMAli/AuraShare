import { motion } from 'framer-motion';
import { Check, Clock } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { FileIcon } from '../ui/FileIcon';
import { formatBytes } from '../../lib/format';
import { viewVariants } from '../../lib/motion';

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
      className="z-40 flex flex-col items-center w-full px-4"
    >
      <div className="relative flex flex-col items-center z-50 w-full max-w-md">
        <div className="w-full text-center">
          <div className="text-transfer font-black text-[10px] md:text-xs tracking-[0.4em] mb-4 md:mb-6 font-bold uppercase">
            Receiver Connected
          </div>
          <div className="text-3xl md:text-4xl text-text-primary font-black tracking-tight mb-2">
            {state.receivedFiles.length} {state.receivedFiles.length === 1 ? 'file' : 'files'} ready
          </div>
          <div className="text-text-secondary text-xs md:text-sm mb-6 md:mb-8">
            {formatBytes(totalBytes)} total
          </div>
        </div>
        <div className="w-full bg-bright/5 border border-bright/10 rounded-2xl md:rounded-3xl p-4 md:p-6 max-h-[40vh] overflow-y-auto scrollbar-hide">
          {state.receivedFiles.map((file, i) => (
            <div key={i} className="py-3 border-b border-bright/5 last:border-0">
              <div className="flex items-center gap-3 overflow-hidden mb-2">
                <input
                  type="checkbox"
                  checked={state.selectedFiles.has(i)}
                  onChange={(e) => {
                    if (state.downloadedFiles.has(i)) return;
                    actions.toggleFileSelected(i, e.target.checked);
                  }}
                  disabled={state.downloadedFiles.has(i)}
                  aria-label={`Select ${file.name}`}
                  className="w-5 h-5 rounded border-bright/20 bg-bright/5 accent-signal cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
                />
                <FileIcon name={file.name} type={file.type} className="w-5 h-5 md:w-6 md:h-6 text-signal shrink-0" />
                <div className="overflow-hidden flex-1">
                  <div className="text-text-primary text-sm font-bold truncate">{file.name}</div>
                  <div className="text-text-secondary text-xs">{formatBytes(file.size)}</div>
                </div>
                {state.downloadedFiles.has(i) ? (
                  <Check className="w-5 h-5 text-transfer shrink-0" />
                ) : state.downloadingFileIndex === i ? (
                  <motion.div
                    className="w-5 h-5 rounded-full border-2 border-signal border-t-transparent animate-spin"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  />
                ) : (
                  <Clock className="w-5 h-5 text-text-ghost shrink-0" />
                )}
              </div>
              {state.downloadingFileIndex === i && (
                <div
                  className="w-full h-1 bg-bright/5 rounded-full overflow-hidden ml-8"
                  role="progressbar"
                  aria-label={`Downloading ${file.name}`}
                  aria-valuenow={Math.round(state.transferProgress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <motion.div
                    className="h-full bg-gradient-transfer"
                    initial={{ width: 0 }}
                    animate={{ width: `${state.transferProgress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-4 md:mt-6">
          {state.selectedFiles.size > 0 && (
            <button
              type="button"
              onClick={actions.downloadSelected}
              className="flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl bg-signal hover:bg-signal-dim text-bright font-black uppercase tracking-widest text-xs md:text-sm transition-all hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            >
              Download ({state.selectedFiles.size})
            </button>
          )}
          <button
            type="button"
            onClick={actions.reset}
            className="flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl bg-bright/5 hover:bg-bright/10 border border-bright/10 text-text-secondary font-black uppercase tracking-widest text-xs md:text-sm transition-all hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          >
            End Session
          </button>
        </div>
      </div>
    </motion.div>
  );
}
