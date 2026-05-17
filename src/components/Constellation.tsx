import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface Device {
  id: string;
  name: string;
  icon: string;
  status: 'online' | 'busy' | 'away';
  angle: number;
  radius: number;
}

interface ConstellationProps {
  devices: Device[];
  onDeviceClick: (deviceId: string) => void;
  className?: string;
}

const generateRandomDuration = (base: number, range: number): number => {
  return base + Math.random() * range;
};

export const Constellation: React.FC<ConstellationProps> = ({ devices, onDeviceClick, className }) => {
  const randomDurations = useMemo(() => {
    return devices.map(() => ({
      x: generateRandomDuration(4, 2),
      y: generateRandomDuration(5, 2),
    }));
  }, [devices]);

  return (
    <div className={cn("absolute inset-0 pointer-events-none", className)}>
      {devices.map((device, index) => {
        const x = Math.cos((device.angle * Math.PI) / 180) * device.radius;
        const y = Math.sin((device.angle * Math.PI) / 180) * device.radius;
        const duration = randomDurations[index];

        return (
          <motion.div
            key={device.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: 1, 
              opacity: 1,
              x: [x - 5, x + 5, x - 5],
              y: [y - 5, y + 5, y - 5]
            }}
            transition={{
              opacity: { duration: 1 },
              scale: { duration: 0.5, type: "spring" },
              x: { duration: duration.x, repeat: Infinity, ease: "easeInOut" },
              y: { duration: duration.y, repeat: Infinity, ease: "easeInOut" }
            }}
            style={{ 
              left: '50%', 
              top: '50%',
              marginLeft: -32, // Offset half width
              marginTop: -32, // Offset half height
            }}
            className="absolute z-20 pointer-events-auto group cursor-pointer"
            onClick={() => onDeviceClick(device.id)}
          >
            {/* Device Orb */}
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center text-2xl group-hover:border-orange-400/50 group-hover:bg-white/10 transition-all shadow-lg overflow-hidden">
                {device.icon}
                
                {/* Status Glow */}
                <div className={cn(
                  "absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full border-2 border-[#0c0c0e]",
                  device.status === 'online' ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : 
                  device.status === 'busy' ? "bg-orange-400" : "bg-white/20"
                )} />
              </div>

              {/* Tooltip/Label */}
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                <div className="px-3 py-1.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-medium tracking-wider text-white uppercase">
                  {device.name}
                </div>
              </div>

              {/* Orbital Path (Visual Accent) */}
              <div 
                className="absolute inset-[-10px] rounded-full border border-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ 
                  animation: 'spin 20s linear infinite'
                }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
