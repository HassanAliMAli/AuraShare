import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AuraDropzone } from './components/AuraDropzone';
import { Constellation } from './components/Constellation';
import { CustomCursor } from './components/CustomCursor';
import { useDiscovery } from './hooks/useDiscovery';
import { cn } from './lib/utils';

function App() {
  const { devices } = useDiscovery();
  const [sharingFiles, setSharingFiles] = useState<FileList | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [transferProgress, setTransferProgress] = useState(0);

  const handleFileDrop = (files: FileList) => {
    setSharingFiles(files);
    console.log('Files dropped:', files);
  };

  const handleDeviceClick = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (sharingFiles) {
      startSimulatedTransfer();
    }
  };

  const startSimulatedTransfer = () => {
    setTransferProgress(1);
    const interval = setInterval(() => {
      setTransferProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setSharingFiles(null);
            setSelectedDeviceId(null);
            setTransferProgress(0);
          }, 2000);
          return 100;
        }
        return prev + Math.random() * 5;
      });
    }, 100);
  };

  return (
    <div className="relative w-full h-screen bg-[#0c0c0e] overflow-hidden flex items-center justify-center font-['Inter'] cursor-none">
      <CustomCursor />
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-orange-500/5 blur-[100px] rounded-full" />
      </div>

      {/* Navigation / Header */}
      <nav className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center z-50">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-4"
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
          className="flex items-center gap-6"
        >
          <a href="#" className="text-sm font-medium text-white/40 hover:text-white transition-colors">Safety</a>
          <a href="#" className="text-sm font-medium text-white/40 hover:text-white transition-colors">Manifesto</a>
          <button className="px-5 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-sm font-medium text-white hover:bg-white/10 transition-all">
            Get App
          </button>
        </motion.div>
      </nav>

      {/* Main Content Area */}
      <main className="relative w-full max-w-6xl h-[600px] flex items-center justify-center">
        {/* Background Constellation (Always visible if no active transfer) */}
        <AnimatePresence>
          {!selectedDeviceId && (
            <Constellation 
              devices={devices} 
              onDeviceClick={handleDeviceClick}
              className="z-20"
            />
          )}
        </AnimatePresence>

        {/* Central Aura Dropzone */}
        <AuraDropzone 
          onFileDrop={handleFileDrop}
          className={cn(
            "z-30 transition-transform duration-700",
            selectedDeviceId ? "scale-110" : "scale-100"
          )}
        />

        {/* Transfer Progress / Success UI */}
        <AnimatePresence>
          {selectedDeviceId && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
            >
              <div className="relative flex flex-col items-center">
                {/* Connection Energy Path */}
                <svg className="absolute w-[800px] h-[800px] pointer-events-none">
                   <motion.path
                    d="M 400 400 Q 500 300 600 200" // This would be dynamic in real impl
                    fill="none"
                    stroke="url(#energyGradient)"
                    strokeWidth="4"
                    strokeDasharray="10,10"
                    initial={{ strokeDashoffset: 100 }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                   />
                   <defs>
                    <linearGradient id="energyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#ff6b00" />
                    </linearGradient>
                   </defs>
                </svg>

                <div className="mt-[420px] text-center">
                  <div className="text-orange-400 font-mono text-sm tracking-widest mb-2">
                    {transferProgress < 100 ? `RESONATING... ${Math.round(transferProgress)}%` : 'HARMONY ACHIEVED'}
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
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Branding / Info */}
      <footer className="absolute bottom-12 left-0 right-0 flex justify-center z-50">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-8 text-[10px] uppercase tracking-[0.2em] text-white/20 font-bold"
        >
          <div className="flex items-center gap-2">
             <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
             2.4K SHARING
          </div>
          <div>•</div>
          <div>P2P ENCRYPTED</div>
          <div>•</div>
          <div>NO SIZE LIMIT</div>
        </motion.div>
      </footer>
    </div>
  );
}

export default App;
