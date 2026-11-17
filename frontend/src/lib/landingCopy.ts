/**
 * All marketing copy for the landing page — single source of truth.
 * Components import from here; no copy lives in JSX.
 *
 * Tone: plain and specific. No cosmic vocabulary, no hype filler — every
 * line states something a reader can verify.
 */

import { MAX_DIRECT_FILE_SIZE_LABEL, MAX_FILE_SIZE_LABEL } from './validation';

export const NAV_LINKS = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Comparison', href: '#comparison' },
  { label: 'Privacy', href: '#privacy' },
  { label: 'FAQ', href: '#faq' },
] as const;

export const HERO = {
  eyebrow: 'Peer-to-peer file transfer',
  title: 'Send files between your devices.',
  subtitle:
    'Open AuraShare on two devices, enter the six-character code, and send files end-to-end encrypted — directly when the network allows it, through TURN when it does not.',
  ctaPrimary: 'Start sharing',
  ctaSecondary: 'See how it works',
  /** Short factual facts, not marketing badges. */
  specs: [
    { label: 'Account', value: 'Not required' },
    { label: 'Max file', value: MAX_DIRECT_FILE_SIZE_LABEL },
    { label: 'Encryption', value: 'End-to-end' },
  ],
} as const;

export type DeviceKind = 'phone' | 'computer';

export const HOW_IT_WORKS = {
  eyebrow: 'How it works',
  title: 'One code. Two devices.',
  subtitle:
    'File contents are never stored. The server introduces your two devices and then leaves the data path alone — unless a direct connection fails, when TURN relays the encrypted packets.',
  steps: [
    {
      id: '01',
      from: 'phone',
      to: 'computer',
      title: 'Phone to computer',
      description: 'Take a photo on your phone and send it to your laptop. No cable, no file storage.',
    },
    {
      id: '02',
      from: 'computer',
      to: 'phone',
      title: 'Computer to phone',
      description: 'Move a document, a PDF or a video to your phone while you are out.',
    },
    {
      id: '03',
      from: 'computer',
      to: 'computer',
      title: 'Computer to computer',
      description: 'Move files between your work and home machines in a few seconds.',
    },
  ] as const satisfies ReadonlyArray<{
    id: string;
    from: DeviceKind;
    to: DeviceKind;
    title: string;
    description: string;
  }>,
  mechanism: [
    'Open AuraShare on both devices',
    'Drop your files',
    'Enter the 6-character code',
  ],
  mechanismTail: 'Files flow between them, encrypted end to end.',
} as const;

/**
 * AuraShare against the tools people already use. Every cell is a verifiable
 * property of the named product, not a claim about AuraShare.
 *
 * These third-party limits change. WeTransfer's free tier was 2 GB and is now
 * 3 GB (wetransfer.com/resources/free-file-transfer/wetransfer-file-size-limit,
 * checked 2026-11-12). Re-verify every cell before release, and keep the
 * "Free tier" wording for products that also sell a paid plan.
 */
export const COMPARISON = {
  eyebrow: 'Comparison',
  title: 'How it compares',
  subtitle: 'AuraShare against the tools you already use.',
  columns: ['AuraShare', 'WeTransfer', 'Google Drive', 'AirDrop'] as const,
  rows: [
    {
      label: 'File route',
      values: ['Direct, or TURN relay', 'Via server', 'Via server', 'Device to device'],
    },
    {
      label: 'Account required',
      values: ['No', 'Optional', 'Yes', 'No'],
    },
    {
      label: 'Max file size',
      values: [MAX_DIRECT_FILE_SIZE_LABEL, '3 GB', '5 TB', 'Limited by device'],
    },
    {
      label: 'Cost',
      values: ['Free', 'Free tier', 'Free tier', 'Free'],
    },
  ],
} as const satisfies {
  eyebrow: string;
  title: string;
  subtitle: string;
  columns: readonly string[];
  rows: ReadonlyArray<{ label: string; values: readonly string[] }>;
};

export const PRIVACY = {
  eyebrow: 'Privacy',
  title: 'Your files are never stored.',
  subtitle:
    'AuraShare keeps no copy of what you send. The signaling server sees the room code, SDP/ICE handshake and connection metadata; when a direct path fails, TURN relays the encrypted packets without being able to read them.',
  points: [
    'No account',
    'No ads',
    'No file storage',
    'End-to-end encrypted',
  ],
  relayLabel: 'Handshake + room code',
  directLabel: 'File data, direct or via TURN',
  caption:
    'Signaling sees the room code, SDP/ICE handshake and connection metadata. File contents stay end-to-end encrypted; TURN may relay the encrypted packets when a direct path fails.',
} as const;

export const FAQS = [
  {
    id: 'free',
    q: 'Is it really free?',
    a: 'Yes. No account, no ads, no subscription, no paywalls. Your devices do the work, so there is nothing to charge for.',
  },
  {
    id: 'different',
    q: 'How is this different from WeTransfer or Google Drive?',
    a: 'Those route your files through a server. AuraShare connects your two devices directly when the network allows it; if a direct path fails, TURN relays the encrypted packets. File contents are never stored, and there is nothing to clean up afterward.',
  },
  {
    id: 'install',
    q: 'Do I need to install anything?',
    a: 'No. It runs in any modern browser on any device. Open it, get a six-character code, share.',
  },
  {
    id: 'size',
    q: 'How big can files be?',
    a: `Up to ${MAX_DIRECT_FILE_SIZE_LABEL} per file with direct save in a supported receiver. In-memory receiving supports up to ${MAX_FILE_SIZE_LABEL} per file.`,
  },
  {
    id: 'security',
    q: 'Is it secure?',
    a: 'Yes. Files travel over an end-to-end encrypted WebRTC connection (DTLS). The server relays the initial handshake and, when a direct path fails, encrypted TURN packets; it never sees file content.',
  },
  {
    id: 'network',
    q: 'Do both devices need to be on the same network?',
    a: 'No. AuraShare works across networks and countries — STUN and TURN handle the connection under the hood.',
  },
] as const;

export const FINAL_CTA = {
  title: 'Open AuraShare on two devices.',
  subtitle: 'Enter the six-character code and start transferring.',
  cta: 'Start sharing',
} as const;

export const FOOTER = {
  tagline: 'Peer-to-peer file transfer between your own devices.',
  backToTop: 'Back to top',
  trust: ['NO ACCOUNT', 'NO FILE STORAGE', 'END-TO-END ENCRYPTED'],
} as const;
