import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AuraDropzone } from './components/AuraDropzone';
import { AuraTextarea } from './components/AuraTextarea';
import { CustomCursor } from './components/CustomCursor';
import { P2PManager } from './lib/webrtc';

function App() {
  const [transferProgress, setTransferProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'creating' | 'waiting' | 'connecting' | 'transferring' | 'success' | 'error'>('idle');
  const [joinCode, setJoinCode] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);
  const [shareMode, setShareMode] = useState<'text' | 'files'>('text');
  const [receivedText, setReceivedText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  
  const p2pManager = useRef<P2PManager | null>(null);
  const receivedFileUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (p2pManager.current) p2pManager.current.close();
      if (receivedFileUrl.current) URL.revokeObjectURL(receivedFileUrl.current);
    };
  }, []);

  const startSharingFlow = async (files?: FileList, text?: string) => {
    try {
      setStatus('creating');
      if (p2pManager.current) p2pManager.current.close();

      const manager = new P2PManager({
          onProgress: (p) => setTransferProgress(p),
          onConnected: () => {
              setStatus('transferring');
              if (files) manager.sendFile(files[0]);
              else if (text) {
                const blob = new Blob([text], { type: 'text/plain' });
                manager.sendFile(new File([blob], 'aura-text-msg.txt', { type: 'text/plain' }));
              }
          },
          onDisconnected: () => { if (['transferring', 'connecting'].includes(status)) setStatus('error'); },
          onFileSent: () => setStatus('success'),
          onFileReceived: async (file) => {
            setStatus('success');
            if (file.name === 'aura-text-msg.txt') setReceivedText(await file.text());
            else {
              if (receivedFileUrl.current) URL.revokeObjectURL(receivedFileUrl.current);
              const url = URL.createObjectURL(file);
              receivedFileUrl.current = url;
              const a = document.createElement('a');
              a.href = url; a.download = file.name; a.click();
            }
          },
          onError: (err) => { 
            console.error('P2P Error:', err);
            setErrorMessage(err); 
            setStatus('error'); 
          }
      });
      p2pManager.current = manager;

      const code = await manager.initialize();
      setRoomId(code);
      setStatus('waiting');
    } catch (e) {
      setErrorMessage('Alignment Failed');
      setStatus('error');
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.toUpperCase().trim();
    if (code.length !== 6) return;
    
    try {
      setStatus('connecting');
      if (p2pManager.current) p2pManager.current.close();
      
      const manager = new P2PManager({
          onProgress: (p) => setTransferProgress(p),
          onConnected: () => setStatus('transferring'),
          onDisconnected: () => { if (['transferring', 'connecting'].includes(status)) setStatus('error'); },
          onFileSent: () => setStatus('success'),
          onFileReceived: async (file) => {
            setStatus('success');
            if (file.name === 'aura-text-msg.txt') setReceivedText(await file.text());
            else {
              if (receivedFileUrl.current) URL.revokeObjectURL(receivedFileUrl.current);
              const url = URL.createObjectURL(file);
              receivedFileUrl.current = url;
              const a = document.createElement('a');
              a.href = url; a.download = file.name; a.click();
            }
          },
          onError: (err) => { 
            setErrorMessage(err); 
            setStatus('error'); 
          }
      });
      p2pManager.current = manager;
      await manager.join(code);
    } catch (e) {
      setErrorMessage('Cosmic Link Broken');
      setStatus('error');
    }
  };

  const reset = () => {
    if (p2pManager.current) p2pManager.current.close();
    if (receivedFileUrl.current) {
        URL.revokeObjectURL(receivedFileUrl.current);
        receivedFileUrl.current = null;
    }
    setTransferProgress(0);
    setStatus('idle');
    setJoinCode('');
    setIsReceiving(false);
    setReceivedText(null);
    setErrorMessage(null);
    setRoomId(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="relative w-screen h-screen bg-[#0c0c0e] overflow-hidden font-['Inter'] cursor-none text-white selection:bg-indigo-500/30">
      <CustomCursor />
      
      {/* Dynamic Background - Scaled for all resolutions */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] md:w-[40%] h-[60%] md:h-[40%] bg-indigo-500/10 blur-[80px] md:blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] md:w-[40%] h-[60%] md:h-[40%] bg-purple-500/10 blur-[80px] md:blur-[120px] rounded-full" />
        <div className="absolute top-[20%] right-[10%] w-[50%] md:w-[30%] h-[50%] md:h-[30%] bg-orange-500/5 blur-[70px] md:blur-[100px] rounded-full" />
      </div>

      {/* Navigation - Responsive Padding */}
      <nav className="absolute top-0 left-0 right-0 p-4 md:p-8 flex justify-between items-center z-50">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 md:gap-4 cursor-pointer"
          onClick={reset}
        >
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl overflow-hidden flex items-center justify-center shadow-lg shadow-indigo-500/20 bg-white/5">
            <img src="/logo.svg" alt="AuraShare" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tighter text-white logo-font whitespace-nowrap">
            AuraShare
          </h1>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-4 md:gap-6 z-50"
        >
          <button 
            onClick={() => setIsReceiving(true)}
            className="text-xs md:text-sm font-bold uppercase tracking-widest text-white/80 hover:text-white transition-colors"
          >
            Receive
          </button>
        </motion.div>
      </nav>

      {/* Main Content Area - Full Center for all devices */}
      <main className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none p-4 md:p-8">
        
        {/* Toggle - Responsive Scaling */}
        <AnimatePresence>
          {status === 'idle' && !isReceiving && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="pointer-events-auto bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl md:rounded-3xl p-1 flex gap-1 mb-8 md:mb-12 shadow-xl"
            >
              {(['text', 'files'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setShareMode(mode)}
                  className={`relative px-6 md:px-10 py-2 md:py-3 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-[0.2em] transition-colors duration-300 ${shareMode === mode ? 'text-[#0c0c0e]' : 'text-white/30 hover:text-white/60'}`}
                >
                  {shareMode === mode && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-white rounded-xl md:rounded-2xl z-0"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10">{mode}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full max-w-4xl min-h-[400px] md:min-h-[500px] relative flex items-center justify-center pointer-events-auto">
          <AnimatePresence mode="wait">
            {status === 'idle' && !isReceiving ? (
              <motion.div 
                key={shareMode}
                initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                className="z-30 w-full flex justify-center"
              >
                <div className="w-full max-w-[90vw] md:max-w-xl">
                  {shareMode === 'files' ? (
                    <AuraDropzone onFileDrop={(f) => startSharingFlow(f, undefined)} />
                  ) : (
                    <AuraTextarea onTextShare={(t) => startSharingFlow(undefined, t)} />
                  )}
                </div>
              </motion.div>
            ) : status === 'idle' && isReceiving ? (
              <motion.div
                key="receive-form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="z-40 bg-white/5 backdrop-blur-3xl p-6 md:p-12 rounded-3xl md:rounded-[48px] border border-white/10 w-full max-w-sm md:max-w-md shadow-2xl mx-auto"
              >
                <h2 className="text-2xl md:text-3xl text-white font-black mb-2 tracking-tighter">Receive Aura</h2>
                <p className="text-white/40 text-xs md:text-sm mb-6 md:mb-10 leading-relaxed uppercase tracking-widest font-bold">Input the 6-digit cosmic code.</p>
                <form onSubmit={handleJoin} className="flex flex-col gap-4 relative z-50">
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="A1B2C3"
                    className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-2xl px-4 py-4 md:py-6 text-white text-2xl md:text-4xl font-black tracking-[0.4em] text-center uppercase focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/5"
                  />
                  <button 
                    type="submit"
                    disabled={joinCode.length !== 6}
                    className="w-full py-4 md:py-5 rounded-xl md:rounded-2xl bg-white text-[#0c0c0e] font-black uppercase tracking-widest disabled:opacity-20 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl text-xs md:text-sm"
                  >
                    Establish Link
                  </button>
                </form>
                <button 
                  onClick={reset}
                  className="w-full mt-6 text-[10px] text-white/20 hover:text-white/40 font-black uppercase tracking-[0.2em] transition-colors relative z-50"
                >
                  Cancel Connection
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="transfer-status"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="z-40 flex flex-col items-center w-full px-4"
              >
                {status === 'waiting' && roomId && (
                  <div className="text-center w-full relative z-50">
                    <div className="text-orange-400 font-black text-[10px] md:text-xs tracking-[0.4em] mb-4 md:mb-8 uppercase">Transmission Code</div>
                    <div className="text-5xl md:text-8xl text-white font-black tracking-[0.2em] md:tracking-[0.3em] bg-white/5 border border-white/10 rounded-3xl md:rounded-[56px] py-8 md:py-12 px-4 md:px-16 mb-6 md:mb-10 shadow-2xl backdrop-blur-2xl inline-block w-full max-w-sm md:max-w-none">
                      {roomId}
                    </div>
                    <p className="text-white/20 uppercase tracking-[0.3em] text-[10px] font-black animate-pulse">Waiting for cosmic alignment...</p>
                  </div>
                )}

                {['connecting', 'transferring'].includes(status) && (
                  <div className="relative flex flex-col items-center z-50 w-full max-w-md">
                    <div className="w-full text-center">
                      <div className="text-indigo-400 font-black text-[10px] md:text-xs tracking-[0.4em] mb-4 md:mb-6 font-bold uppercase">
                        {status === 'connecting' ? 'Establishing Aura...' : `Resonating... ${Math.round(transferProgress)}%`}
                      </div>
                      <div className="w-full h-1.5 md:h-2 bg-white/5 rounded-full overflow-hidden shadow-inner">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-orange-500 shadow-[0_0_20px_rgba(99,102,241,0.5)]"
                          initial={{ width: 0 }}
                          animate={{ width: `${transferProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {status === 'success' && (
                  <div className="text-center relative z-50 w-full max-w-lg">
                    <div className="text-emerald-400 font-black text-[10px] md:text-xs tracking-[0.4em] mb-6 md:mb-10 uppercase">Harmony Achieved</div>
                    
                    {receivedText ? (
                      <div className="bg-white/5 border border-white/10 p-6 md:p-10 rounded-3xl md:rounded-[48px] backdrop-blur-2xl mb-8 md:mb-12 shadow-2xl overflow-hidden">
                        <p className="text-white/90 text-base md:text-xl leading-relaxed mb-6 md:mb-10 text-left max-h-60 overflow-y-auto scrollbar-hide font-light italic">
                          "{receivedText}"
                        </p>
                        <button 
                          onClick={() => copyToClipboard(receivedText)}
                          className="flex items-center gap-3 px-6 md:px-10 py-3 md:py-4 bg-white/10 hover:bg-white/20 rounded-xl md:rounded-2xl transition-all active:scale-95 text-[10px] md:text-xs uppercase tracking-widest font-black mx-auto"
                        >
                          <i className="fa-solid fa-copy" />
                          Copy to Universe
                        </button>
                      </div>
                    ) : (
                      <div className="w-24 h-24 md:w-40 md:h-40 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-8 md:mb-12 shadow-[0_0_80px_rgba(52,211,153,0.15)]">
                        <i className="fa-solid fa-check text-4xl md:text-7xl text-emerald-400" />
                      </div>
                    )}
                    
                    <button onClick={reset} className="px-10 md:px-16 py-4 md:py-5 rounded-xl md:rounded-2xl bg-white text-[#0c0c0e] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-2xl text-xs md:text-sm">
                      Begin New Cycle
                    </button>
                  </div>
                )}

                {status === 'error' && (
                  <div className="text-center relative z-50 w-full max-w-lg">
                    <div className="text-red-400 font-black text-[10px] md:text-xs tracking-[0.4em] mb-8 uppercase">Cosmos Disrupted</div>
                    <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-8">
                      <i className="fa-solid fa-bolt-lightning text-4xl md:text-5xl text-red-400" />
                    </div>
                    <p className="text-white font-black mb-2 uppercase tracking-[0.2em] text-[10px] md:text-xs">
                      {errorMessage || "Link Failed"}
                    </p>
                    <button onClick={reset} className="px-10 md:px-14 py-4 md:py-5 rounded-xl md:rounded-2xl bg-white text-[#0c0c0e] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl mt-8 text-xs">
                      Try Re-Alignment
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer - Optimized for small screens */}
      <footer className="absolute bottom-6 md:bottom-12 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-center gap-4 md:gap-8 text-[8px] md:text-[10px] uppercase tracking-[0.2em] md:tracking-[0.4em] text-white/20 font-black text-center"
        >
          <div className="flex items-center gap-2">
             <div className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-emerald-500 animate-pulse" />
             P2P DIRECT
          </div>
          <div className="hidden xs:block opacity-50">•</div>
          <div>E2E ENCRYPTED</div>
          <div className="hidden xs:block opacity-50">•</div>
          <div className="whitespace-nowrap">INFINITE CAPACITY</div>
        </motion.div>
      </footer>
    </div>
  );
}

export default App;
