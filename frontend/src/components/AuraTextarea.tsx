import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { shareInputVariants } from '../lib/motion';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';
import { MAX_TEXT_BYTES } from '../lib/protocol';
import { formatBytes } from '../lib/format';

interface AuraTextareaProps {
  onTextShare: (text: string) => void;
  className?: string;
}

export function AuraTextarea({ onTextShare, className }: AuraTextareaProps) {
  const [text, setText] = useState('');
  const bytes = useMemo(() => new TextEncoder().encode(text).byteLength, [text]);
  const tooLarge = bytes > MAX_TEXT_BYTES;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && !tooLarge) {
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
          aria-invalid={tooLarge}
          aria-describedby="text-size-limit"
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or paste the text to send…"
          className="h-40 w-full resize-none bg-transparent font-mono text-md leading-relaxed text-text placeholder:text-text-3 focus:outline-none md:h-52"
        />

        <p id="text-size-limit" role={tooLarge ? 'alert' : undefined} className={tooLarge ? 'mt-2 text-sm text-error' : 'mt-2 text-xs text-text-3'}>
          {tooLarge ? 'Text exceeds the 1 MiB limit. Shorten it before sending.' : 'Maximum 1 MiB of text.'}
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="font-mono text-xs text-text-3">
            {formatBytes(bytes)} / 1 MiB
          </span>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!text.trim() || tooLarge}
          >
            Send text
          </Button>
        </div>
      </motion.div>
    </Panel>
  );
}
