import { useEffect, useSyncExternalStore } from 'react';
import { motion, useSpring, useMotionValue } from 'framer-motion';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener('change', callback);
      return () => mediaQuery.removeEventListener('change', callback);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export const CustomCursor = () => {
  const isTouch = useMediaQuery('(pointer: coarse)');
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 30, stiffness: 250, mass: 0.5 };
  const cursorX = useSpring(mouseX, springConfig);
  const cursorY = useSpring(mouseY, springConfig);

  const trailX = useSpring(mouseX, { damping: 40, stiffness: 150, mass: 1 });
  const trailY = useSpring(mouseY, { damping: 40, stiffness: 150, mass: 1 });

  useEffect(() => {
    if (isTouch) return undefined;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isTouch, mouseX, mouseY]);

  if (isTouch) return null;

  return (
    <>
      {/* High-Visibility Pointer Arrow - Always at the center */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[10000] mix-blend-difference"
        style={{
          x: mouseX,
          y: mouseY,
          translateX: '-20%', // Offset to make the tip the exact point
          translateY: '-20%',
        }}
      >
        <svg 
          width="24" 
          height="24" 
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]"
        >
          <path 
            d="M5.65376 12.3673L15.617 19.3473C17.223 20.4715 19.421 19.3248 19.421 17.38V3.42005C19.421 1.47527 17.223 0.328509 15.617 1.45271L5.65376 8.43271C4.19503 9.45381 4.19503 11.3462 5.65376 12.3673Z" 
            fill="white"
            transform="rotate(-15 12 12)" 
          />
        </svg>
      </motion.div>

      {/* Magnetic Liquid Aura - Follows with momentum */}
      <motion.div
        className="fixed top-0 left-0 w-8 h-8 md:w-10 md:h-10 rounded-full border border-indigo-500/30 pointer-events-none z-[9999] mix-blend-screen"
        style={{
          x: trailX,
          y: trailY,
          translateX: '-50%',
          translateY: '-50%',
        }}
      />
      
      <motion.div
        className="fixed top-0 left-0 w-3 h-3 md:w-4 md:h-4 pointer-events-none z-[9999] flex items-center justify-center"
        style={{
          x: cursorX,
          y: cursorY,
          translateX: '-50%',
          translateY: '-50%',
        }}
      >
        <div className="w-full h-full bg-indigo-500/40 rounded-full blur-[2px] relative">
          <motion.div 
            animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute inset-0 bg-white/20 rounded-full blur-[4px]"
          />
        </div>
      </motion.div>
    </>
  );
};
