import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Panel } from './Panel';
import { cn } from '../../lib/utils';

type TransmissionCodePanelProps = {
  code: string | null;
  caption?: string;
  alignment?: 'left' | 'center';
  sample?: boolean;
  /** Epoch ms when the waiting code stops working. Omit to hide the countdown. */
  expiresAt?: number | null;
  /** Extra content inside the card, e.g. the room QR. */
  children?: ReactNode;
};

function formatRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The code card, its copy action, and the waiting-code countdown. */
export function TransmissionCodePanel({
  code,
  caption = 'Enter this code on the other device to open the link.',
  alignment = 'left',
  sample = false,
  expiresAt = null,
  children,
}: TransmissionCodePanelProps) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [now, setNow] = useState(() => Date.now());

  // Only tick while a deadline is visible; an idle panel costs no timer.
  useEffect(() => {
    if (expiresAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // The confirmation is momentary; leaving it forever would look like state.
  useEffect(() => {
    if (copied === 'idle') return;
    const id = setTimeout(() => setCopied('idle'), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  };

  const remaining = expiresAt === null ? null : Math.max(0, expiresAt - now);

  return <Panel className="p-6">
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-text-3">Transmission code{sample ? ' example' : ''}</span>
      <span className="flex items-center gap-3">
        <span className="font-mono text-xs text-text-3">6 characters</span>
        {!sample && code && (
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex min-h-6 items-center gap-1.5 font-mono text-xs text-text-2 transition-colors hover:text-accent"
            aria-label="Copy transmission code"
          >
            {copied === 'copied'
              ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy'}
          </button>
        )}
      </span>
    </div>
    {code ? (
      <p className={cn('mt-5 font-mono text-3xl font-medium tracking-[0.18em] text-accent md:text-4xl', alignment === 'center' && 'text-center')}>
        {code}
      </p>
    ) : (
      <p
        role="status"
        className={cn('mt-5 font-mono text-lg text-text-3', alignment === 'center' && 'text-center')}
      >
        Opening a room…
      </p>
    )}
    {remaining !== null && (
      <p className="mt-3 font-mono text-xs text-text-3" role="status">
        {remaining > 0
          ? `Code expires in ${formatRemaining(remaining)}`
          : 'Code expired — start a new session'}
      </p>
    )}
    {copied === 'failed' && (
      <p className="mt-3 text-xs text-error" role="status">
        Could not reach the clipboard. Select the code and copy it manually.
      </p>
    )}
    {children}
    <p className="mt-5 border-t border-border pt-4 text-sm leading-relaxed text-text-2">{caption}</p>
  </Panel>;
}
