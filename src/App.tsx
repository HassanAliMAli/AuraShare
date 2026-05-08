import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AuraDropzone } from './components/AuraDropzone';
import { CustomCursor } from './components/CustomCursor';
import { useSignaling } from './hooks/useSignaling';
import { WebRTCManager } from './lib/webrtc';

// We'll keep the constellation as a decorative background
import { Constellation } from './components/Constellation';
import { useDiscovery } from './hooks/useDiscovery';

function App() {
  const { devices } = useDiscovery();
  const { roomId, createRoom, pollForAnswer, getOffer, postAnswer } = useSignaling();
  
  const [sharingFiles, setSharingFiles] = useState<FileList | null>(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'creating' | 'waiting' | 'connecting' | 'transferring' | 'success' | 'error'>('idle');
  const [joinCode, setJoinCode] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);
  
  const rtcManager = useRef<WebRTCManager | null>(null);

  const initRTC = () => {
    if (rtcManager.current) {
      rtcManager.current.close();
    }
    rtcManager.current = new WebRTCManager({
      onProgress: (p) => setTransferProgress(p),
      onConnected: () => {
        setStatus('connecting');
        if (sharingFiles) {
          setStatus('transferring');
          rtcManager.current?.sendFile(sharingFiles[0]);
        }
      },
      onDisconnected: () => setStatus('error'),
      onFileSent: () => setStatus('success'),
      onFileReceived: (file) => {
        setStatus('success');
        // Auto download
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      onError: (err) => {
        console.error(err);
        setStatus('error');
      }
    });
  };

  const handleFileDrop = async (files: FileList) => {
    if (files.length === 0) return;
    setSharingFiles(files);
    setStatus('creating');
    
    initRTC();
    try {
      const offer = await rtcManager.current!.createOffer();
      const newRoomId = await createRoom(offer);
      if (newRoomId) {
        setStatus('waiting');
        const answer = await pollForAnswer(newRoomId);
        if (answer) {
          await rtcManager.current!.setAnswer(answer);
          // RTC Connection will trigger onConnected
        } else {
          setStatus('error');
        }
      } else {
        setStatus('error');
      }
    } catch (e) {
      setStatus('error');
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode || joinCode.length !== 6) return;
    
    setStatus('connecting');
    initRTC();
    
    try {
      const offer = await getOffer(joinCode.toUpperCase());
      if (offer) {
        const answer = await rtcManager.current!.handleOffer(offer);
        const success = await postAnswer(joinCode.toUpperCase(), answer);
        if (success) {
          // Waiting for RTC to connect and trigger onConnected
        } else {
          setStatus('error');
        }
      } else {
        setStatus('error');
      }
    } catch (e) {
      setStatus('error');
    }
  };

  const reset = () => {
    if (rtcManager.current) rtcManager.current.close();
    setSharingFiles(null);
    setTransferProgress(0);
    setStatus('idle');
    setJoinCode('');
    setIsReceiving(false);
  };

  return (
    <div className="relative w-screen h-screen bg-[#0c0c0e] overflow-hidden font-['Inter'] cursor-none">
      <CustomCursor />
      
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-orange-500/5 blur-[100px] rounded-full" />
      </div>

      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center z-50">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-4 cursor-pointer"
          onClick={reset}
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-2xl">✨</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tighter text-white logo-font">
            AuraShare
          </h1>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-6 z-50"
        >
          <button 
            onClick={() => setIsReceiving(true)}
            className="text-sm font-medium text-white/80 hover:text-white transition-colors"
          >
            Receive File
          </button>
        </motion.div>
      </nav>

      {/* Main Content Area */}
      <main className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
        <div className="w-full max-w-4xl h-[600px] relative flex items-center justify-center pointer-events-auto">
          <AnimatePresence>
            {status === 'idle' && !isReceiving && (
              <div className="absolute inset-0 flex items-center justify-center opacity-30">
                <Constellation 
                  devices={devices} 
                  onDeviceClick={() => {}}
                  className="z-20"
                />
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {status === 'idle' && !isReceiving ? (
              <motion.div 
                key="dropzone"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="z-30 w-full flex justify-center"
              >
                <div className="w-[500px] h-[500px]">
                  <AuraDropzone onFileDrop={handleFileDrop} />
                </div>
              </motion.div>
            ) : status === 'idle' && isReceiving ? (
              <motion.div
                key="receive-form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="z-40 bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 w-full max-w-md"
              >
                <h2 className="text-2xl text-white font-semibold mb-2">Receive File</h2>
                <p className="text-white/60 text-sm mb-6">Enter the 6-digit Aura code from the sender.</p>
                <form onSubmit={handleJoin} className="flex gap-4 relative z-50">
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. A1B2C3"
                    className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-lg tracking-[0.2em] uppercase focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button 
                    type="submit"
                    disabled={joinCode.length !== 6}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium disabled:opacity-50 hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
                  >
                    Join
                  </button>
                </form>
                <button 
                  onClick={reset}
                  className="mt-6 text-sm text-white/40 hover:text-white transition-colors relative z-50"
                >
                  Cancel
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="transfer-status"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.2 }}
                className="z-40 flex flex-col items-center"
              >
                {status === 'waiting' && roomId && (
                  <div className="text-center mb-8 relative z-50">
                    <div className="text-orange-400 font-mono text-sm tracking-widest mb-4">
                      SHARE THIS CODE
                    </div>
                    <div className="text-6xl text-white font-bold tracking-[0.2em] bg-white/5 border border-white/10 rounded-2xl py-4 px-8 mb-4">
                      {roomId}
                    </div>
                    <p className="text-white/40">Waiting for receiver to join...</p>
                  </div>
                )}

                {['connecting', 'transferring'].includes(status) && (
                  <div className="relative flex flex-col items-center z-50">
                    <div className="mt-8 text-center">
                      <div className="text-orange-400 font-mono text-sm tracking-widest mb-2">
                        {status === 'connecting' ? 'ESTABLISHING AURA...' : `RESONATING... ${Math.round(transferProgress)}%`}
                      </div>
                      <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-orange-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${transferProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {status === 'success' && (
                  <div className="text-center relative z-50">
                    <div className="text-emerald-400 font-mono text-sm tracking-widest mb-4">
                      HARMONY ACHIEVED
                    </div>
                    <div className="w-24 h-24 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center mx-auto mb-6">
                      <i className="fa-solid fa-check text-4xl text-emerald-400" />
                    </div>
                    <p className="text-white">Transfer completed successfully.</p>
                    <button onClick={reset} className="mt-6 px-6 py-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors">
                      Share Another
                    </button>
                  </div>
                )}

                {status === 'error' && (
                  <div className="text-center relative z-50">
                    <div className="text-red-400 font-mono text-sm tracking-widest mb-4">
                      CONNECTION LOST
                    </div>
                    <p className="text-white/60 mb-6">The aura was disrupted. Please try again.</p>
                    <button onClick={reset} className="px-6 py-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors">
                      Reset
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-12 left-0 right-0 flex justify-center z-50 pointer-events-none">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-8 text-[10px] uppercase tracking-[0.2em] text-white/20 font-bold"
        >
          <div className="flex items-center gap-2">
             <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
             P2P DIRECT
          </div>
          <div>•</div>
          <div>E2E ENCRYPTED</div>
          <div>•</div>
          <div>NO SIZE LIMIT</div>
        </motion.div>
      </footer>
    </div>
  );
}

export default App;
