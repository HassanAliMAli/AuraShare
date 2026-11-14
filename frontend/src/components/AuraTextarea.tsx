import { useState } from 'react';
import { motion } from 'motion/react';
import { shareInputVariants } from '../lib/motion';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';

interface AuraTextareaProps {
  onTextShare: (text: string) => void;
  className?: string;
}

export function AuraTextarea({ onTextShare, className }: AuraTextareaProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onTextShare(text);
    }
  };

  return (
    <Panel className={className}>
      <motion.div
        variants={shareInputVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col p-5"
      >
        <label htmlFor="share-text" className="sr-only">
          Text to share
        </label>
        <textarea
          id="share-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or paste the text to send…"
          className="h-40 w-full resize-none bg-transparent font-mono text-md leading-relaxed text-text placeholder:text-text-3 focus:outline-none md:h-52"
        />

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="font-mono text-xs text-text-3">
            {text.length} {text.length === 1 ? 'character' : 'characters'}
          </span>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!text.trim()}
          >
            Send text
          </Button>
        </div>
      </motion.div>
    </Panel>
  );
}
