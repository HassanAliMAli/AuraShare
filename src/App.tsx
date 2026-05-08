import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AuraDropzone } from './components/AuraDropzone';
import { AuraTextarea } from './components/AuraTextarea';
import { CustomCursor } from './components/CustomCursor';
import { useSignaling } from './hooks/useSignaling';
import { WebRTCManager } from './lib/webrtc';

function App() {
  const { roomId, error: signalingError, createRoom, pollForAnswer, getOffer, postAnswer, addCandidate, getCandidates, clearError } = useSignaling();
  
  const [transferProgress, setTransferProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'creating' | 'waiting' | 'connecting' | 'transferring' | 'success' | 'error'>('idle');
  const [joinCode, setJoinCode] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);
  const [shareMode, setShareMode] = useState<'text' | 'files'>('text');
  const [receivedText, setReceivedText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const rtcManager = useRef<WebRTCManager | null>(null);
  const candidatePollingInterval = useRef<any>(null);
  const currentRoomIdRef = useRef<string | null>(null);
  const processedCandidates = useRef(new Set<string>());

  useEffect(() => {
    return () => {
      if (candidatePollingInterval.current) clearInterval(candidatePollingInterval.current);
      if (rtcManager.current) rtcManager.current.close();
    };
  }, []);

  const startNewSharingFlow = async (files?: FileList, text?: string) => {
    setStatus('creating');
    processedCandidates.current.clear();
    
    const manager = new WebRTCManager({
        onProgress: (p) => setTransferProgress(p),
        onConnected: () => setStatus('transferring'),
        onDisconnected: () => { if (['transferring', 'connecting'].includes(status)) setStatus('error'); },
        onFileSent: () => setStatus('success'),
        onFileReceived: async (file) => {
          setStatus('success');
          if (file.name === 'aura-text-msg.txt') setReceivedText(await file.text());
          else {
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url; a.download = file.name; a.click();
            URL.revokeObjectURL(url);
          }
        },
        onError: (err) => { setErrorMessage(err); setStatus('error'); },
        onCandidate: (candidate) => {
            if (currentRoomIdRef.current) addCandidate(currentRoomIdRef.current, 'sender', candidate);
        }
    });
    rtcManager.current = manager;

    try {
      const offer = await manager.createOffer();
      const newRoomId = await createRoom(offer);
      if (newRoomId) {
        currentRoomIdRef.current = newRoomId;
        setStatus('waiting');
        
        candidatePollingInterval.current = setInterval(async () => {
            const candidates = await getCandidates(newRoomId, 'sender');
            candidates.forEach((c: any) => {
                const cStr = JSON.stringify(c);
                if (!processedCandidates.current.has(cStr)) {
                    processedCandidates.current.add(cStr);
                    manager.addCandidate(c);
                }
            });
        }, 1000); // 1s polling for ultra-robustness

        const answer = await pollForAnswer(newRoomId);
        if (answer) {
          await manager.setAnswer(answer);
          if (files) manager.sendFile(files[0]);
          else if (text) {
            const blob = new Blob([text], { type: 'text/plain' });
            manager.sendFile(new File([blob], 'aura-text-msg.txt', { type: 'text/plain' }));
          }
        }
      }
    } catch (e) {
      setStatus('error');
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.toUpperCase();
    if (code.length !== 6) return;
    setStatus('connecting');
    currentRoomIdRef.current = code;
    processedCandidates.current.clear();
    
    try {
      const offer = await getOffer(code);
      if (offer) {
        const manager = new WebRTCManager({
            onProgress: (p) => setTransferProgress(p),
            onConnected: () => setStatus('transferring'),
            onDisconnected: () => { if (['transferring', 'connecting'].includes(status)) setStatus('error'); },
            onFileSent: () => setStatus('success'),
            onFileReceived: async (file) => {
              setStatus('success');
              if (file.name === 'aura-text-msg.txt') setReceivedText(await file.text());
              else {
                const url = URL.createObjectURL(file);
                const a = document.createElement('a');
                a.href = url; a.download = file.name; a.click();
                URL.revokeObjectURL(url);
              }
            },
            onError: (err) => { setErrorMessage(err); setStatus('error'); },
            onCandidate: (candidate) => {
                addCandidate(code, 'receiver', candidate);
            }
        });
        rtcManager.current = manager;

        candidatePollingInterval.current = setInterval(async () => {
            const candidates = await getCandidates(code, 'receiver');
            candidates.forEach((c: any) => {
                const cStr = JSON.stringify(c);
                if (!processedCandidates.current.has(cStr)) {
                    processedCandidates.current.add(cStr);
                    manager.addCandidate(c);
                }
            });
        }, 1000); // 1s polling for ultra-robustness

        const answer = await manager.handleOffer(offer);
        await postAnswer(code, answer);
      } else {
        setErrorMessage('Invalid Aura Code');
        setStatus('error');
      }
    } catch (e) {
      setStatus('error');
    }
  };

  const reset = () => {
    if (rtcManager.current) rtcManager.current.close();
    if (candidatePollingInterval.current) clearInterval(candidatePollingInterval.current);
    currentRoomIdRef.current = null;
    processedCandidates.current.clear();
    setTransferProgress(0);
    setStatus('idle');
    setJoinCode('');
    setIsReceiving(false);
    setReceivedText(null);
    setErrorMessage(null);
    clearError();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="relative w-screen h-screen bg-[#0c0c0e] overflow-hidden font-['Inter'] cursor-none text-white">
      <CustomCursor />
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-orange-500/5 blur-[100px] rounded-full" />
      </div>

      <nav className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center z-50">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-4 cursor-pointer" onClick={reset}>
          <div className="w-10 h-10 rounded-2xl overflow-hidden flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <img src="/logo.svg" alt="AuraShare" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold tracking-tighter text-white logo-font">AuraShare</h1>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-6 z-50">
          <button onClick={() => setIsReceiving(true)} className="text-sm font-medium text-white/80 hover:text-white transition-colors">Receive Aura</button>
        </motion.div>
      </nav>

      <main className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none p-4">
        <AnimatePresence>
          {status === 'idle' && !isReceiving && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="pointer-events-auto bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-1.5 flex gap-1 mb-12 shadow-xl">
              {(['text', 'files'] as const).map((mode) => (
                <button key={mode} onClick={() => setShareMode(mode)} className={`relative px-8 py-2.5 rounded-2xl text-sm font-bold uppercase tracking-[0.1em] transition-colors duration-300 ${shareMode === mode ? 'text-[#0c0c0e]' : 'text-white/40 hover:text-white/60'}`}>
                  {shareMode === mode && <motion.div layoutId="activeTab" className="absolute inset-0 bg-white rounded-2xl z-0" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />}
                  <span className="relative z-10">{mode}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full max-w-4xl min-h-[500px] relative flex items-center justify-center pointer-events-auto">
          <AnimatePresence mode="wait">
            {status === 'idle' && !isReceiving ? (
              <motion.div key={shareMode} initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }} className="z-30 w-full flex justify-center">
                <div className="w-full max-w-xl">
                  {shareMode === 'files' ? <AuraDropzone onFileDrop={(f) => startNewSharingFlow(f, undefined)} /> : <AuraTextarea onTextShare={(t) => startNewSharingFlow(undefined, t)} />}
                </div>
              </motion.div>
            ) : status === 'idle' && isReceiving ? (
              <motion.div key="receive-form" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="z-40 bg-white/5 backdrop-blur-3xl p-10 rounded-[40px] border border-white/10 w-full max-w-md shadow-2xl">
                <h2 className="text-3xl text-white font-bold mb-2 tracking-tight">Receive Aura</h2>
                <p className="text-white/40 text-sm mb-8 leading-relaxed">Enter the 6-digit connection code.</p>
                <form onSubmit={handleJoin} className="flex flex-col gap-4 relative z-50">
                  <input type="text" maxLength={6} value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="A1B2C3" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white text-3xl font-bold tracking-[0.4em] text-center uppercase focus:outline-none focus:border-indigo-500 transition-colors" />
                  <button type="submit" disabled={joinCode.length !== 6} className="w-full py-4 rounded-2xl bg-white text-[#0c0c0e] font-black uppercase tracking-widest disabled:opacity-20 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg">Establish Link</button>
                </form>
                <button onClick={reset} className="w-full mt-6 text-xs text-white/20 hover:text-white/40 font-bold uppercase tracking-widest transition-colors relative z-50">Cancel Connection</button>
              </motion.div>
            ) : (
              <motion.div key="transfer-status" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.2 }} className="z-40 flex flex-col items-center">
                {status === 'waiting' && roomId && (
                  <div className="text-center mb-8 relative z-50">
                    <div className="text-orange-400 font-mono text-sm tracking-[0.3em] mb-6 font-bold">TRANSMISSION CODE</div>
                    <div className="text-7xl text-white font-black tracking-[0.3em] bg-white/5 border border-white/10 rounded-[40px] py-8 px-12 mb-6 shadow-2xl backdrop-blur-xl">{roomId}</div>
                    <p className="text-white/20 uppercase tracking-widest text-xs font-bold">Waiting for cosmic alignment...</p>
                  </div>
                )}
                {['connecting', 'transferring'].includes(status) && (
                  <div className="relative flex flex-col items-center z-50">
                    <div className="mt-8 text-center">
                      <div className="text-indigo-400 font-mono text-sm tracking-[0.3em] mb-4 font-bold uppercase">{status === 'connecting' ? 'Establishing Aura...' : `Resonating... ${Math.round(transferProgress)}%`}</div>
                      <div className="w-80 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-orange-500" initial={{ width: 0 }} animate={{ width: `${transferProgress}%` }} />
                      </div>
                    </div>
                  </div>
                )}
                {status === 'success' && (
                  <div className="text-center relative z-50 max-w-lg">
                    <div className="text-emerald-400 font-mono text-sm tracking-[0.3em] mb-6 font-bold">HARMONY ACHIEVED</div>
                    {receivedText ? (
                      <div className="bg-white/5 border border-white/10 p-8 rounded-[40px] backdrop-blur-xl mb-8">
                        <p className="text-white/80 text-lg leading-relaxed mb-6 text-left max-h-60 overflow-y-auto font-light italic">"{receivedText}"</p>
                        <button onClick={() => copyToClipboard(receivedText)} className="flex items-center gap-3 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-colors mx-auto text-xs uppercase tracking-widest font-bold"><i className="fa-solid fa-copy" />Copy to Universe</button>
                      </div>
                    ) : (
                      <div className="w-32 h-32 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(52,211,153,0.1)]"><i className="fa-solid fa-check text-5xl text-emerald-400" /></div>
                    )}
                    <button onClick={reset} className="px-10 py-4 rounded-2xl bg-white text-[#0c0c0e] font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-xl">Begin New Cycle</button>
                  </div>
                )}
                {status === 'error' && (
                  <div className="text-center relative z-50">
                    <div className="text-red-400 font-mono text-sm tracking-[0.3em] mb-6 font-bold uppercase">Cosmos Disrupted</div>
                    <p className="text-white font-bold mb-8 uppercase tracking-widest text-xs">{signalingError || errorMessage || "A cosmic storm has broken the link."}</p>
                    <button onClick={reset} className="px-10 py-4 rounded-2xl bg-white text-[#0c0c0e] font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-xl">Try Re-Alignment</button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="absolute bottom-12 left-0 right-0 flex justify-center z-50 pointer-events-none">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-8 text-[10px] uppercase tracking-[0.3em] text-white/20 font-black">
          <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />P2P DIRECT</div>
          <div className="opacity-50">•</div><div>E2E ENCRYPTED</div>
          <div className="opacity-50">•</div><div>INFINITE CAPACITY</div>
        </motion.div>
      </footer>
    </div>
  );
}

export default App;
