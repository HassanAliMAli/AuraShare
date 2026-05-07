import React, { useEffect, useState } from 'react';
import { motion, useSpring } from 'framer-motion';

export const CustomCursor = () => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const springConfig = { damping: 25, stiffness: 200 };
  const cursorX = useSpring(0, springConfig);
  const cursorY = useSpring(0, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      cursorX.set(e.clientX - 16);
      cursorY.set(e.clientY - 16);
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [cursorX, cursorY]);

  return (
    <>
      <motion.div
        className="fixed top-0 left-0 w-8 h-8 rounded-full border border-white/20 pointer-events-none z-[9999]"
        style={{
          x: cursorX,
          y: cursorY,
        }}
      />
      <motion.div
        className="fixed top-0 left-0 w-2 h-2 bg-indigo-500 rounded-full pointer-events-none z-[9999] blur-[2px]"
        style={{
          x: cursorX.get() + 12,
          y: cursorY.get() + 12,
        }}
        animate={{
          scale: [1, 1.5, 1],
          opacity: [0.5, 0.8, 0.5]
        }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </>
  );
};
