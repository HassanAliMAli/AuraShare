import { motion } from 'framer-motion';
import { Check, Clock } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { FileIcon } from '../ui/FileIcon';
import { viewVariants, receiveFormVariants } from '../../lib/motion';

/** Receiver's code-entry form (idle + isReceiving). */
export function ReceiveCodeForm() {
  const { state, actions } = useAppStore();

  return (
    <motion.div
      variants={receiveFormVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="z-40 bg-bright/5 backdrop-blur-3xl p-6 md:p-12 rounded-3xl md:rounded-[48px] border border-bright/10 w-full max-w-sm md:max-w-md shadow-2xl mx-auto"
    >
      <h2 className="text-2xl md:text-3xl text-text-primary font-black mb-2 tracking-tighter">Receive Aura</h2>
      <p className="text-text-secondary text-xs md:text-sm mb-6 md:mb-10 leading-relaxed uppercase tracking-widest font-bold">Input the 6-digit cosmic code.</p>
      <form
        onSubmit={(e) => { e.preventDefault(); actions.join(state.joinCode); }}
        className="flex flex-col gap-4 relative z-50"
      >
        <input
          type="text"
          maxLength={6}
          value={state.joinCode}
          onChange={(e) => actions.setJoinCode(e.target.value.toUpperCase())}
          placeholder="A1B2C3"
          aria-label="6-digit cosmic code"
          className="w-full bg-bright/5 border border-bright/10 rounded-xl md:rounded-2xl px-4 py-4 md:py-6 text-text-primary text-2xl md:text-4xl font-black tracking-[0.4em] text-center uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-signal focus:border-signal transition-colors placeholder:text-text-ghost"
        />
        <button
          type="submit"
          disabled={state.joinCode.length !== 6}
          className="w-full py-4 md:py-5 rounded-xl md:rounded-2xl bg-bright text-void font-black uppercase tracking-widest disabled:opacity-20 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl text-xs md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          Establish Link
        </button>
      </form>
      <button
        type="button"
        onClick={actions.reset}
        className="w-full mt-6 text-[10px] text-text-ghost hover:text-text-secondary font-black uppercase tracking-[0.2em] transition-colors relative z-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal rounded-xl"
      >
        Cancel Connection
      </button>
    </motion.div>
  );
}

/** Sender waiting screen: shows the code + sent-file acknowledgement list. */
export function SharingView() {
  const { state, actions } = useAppStore();

  return (
    <motion.div
      variants={viewVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="z-40 flex flex-col items-center w-full px-4"
    >
      <div className="text-center w-full relative z-50">
        <div className="text-warn font-black text-[10px] md:text-xs tracking-[0.4em] mb-4 md:mb-8 uppercase">Transmission Code</div>
        <div className="text-5xl md:text-8xl text-text-primary font-black tracking-[0.2em] md:tracking-[0.3em] bg-bright/5 border border-bright/10 rounded-3xl md:rounded-[56px] py-8 md:py-12 px-4 md:px-16 mb-6 md:mb-10 shadow-2xl backdrop-blur-2xl inline-block w-full max-w-sm md:max-w-none">
          {state.roomId}
        </div>
        {state.receiverReady ? (
          <p className="text-transfer uppercase tracking-[0.3em] text-[10px] font-black animate-pulse">Receiver Connected</p>
        ) : (
          <p className="text-text-ghost uppercase tracking-[0.3em] text-[10px] font-black animate-pulse">Waiting for cosmic alignment...</p>
        )}
        {state.sentFiles.length > 0 && (
          <div className="mt-6 w-full max-w-sm mx-auto">
            <div className="text-text-secondary text-[10px] font-black uppercase tracking-widest mb-3">Files Sent</div>
            <div className="space-y-2">
              {state.sentFiles.map((file, i) => (
                <div key={i} className="flex items-center justify-between bg-bright/5 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <FileIcon name={file.name} type={file.type} className="w-5 h-5 text-text-secondary shrink-0" />
                    <span className="text-text-primary text-sm font-bold truncate">{file.name}</span>
                  </div>
                  {state.acknowledgedFiles.has(i) ? (
                    <Check className="w-4 h-4 text-transfer shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-text-ghost shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={actions.reset}
          className="mt-8 text-[10px] text-text-ghost hover:text-text-secondary font-black uppercase tracking-[0.2em] transition-colors relative z-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal rounded-xl"
        >
          End Session
        </button>
      </div>
    </motion.div>
  );
}
