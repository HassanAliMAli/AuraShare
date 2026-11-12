/**
 * All marketing copy for the landing page — single source of truth.
 * Components import from here; no copy lives in JSX.
 *
 * Tone: plain and specific. No cosmic vocabulary, no hype filler — every
 * line states something a reader can verify.
 */

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
    'Open AuraShare on two devices, enter the six-character code, and the files travel directly between them. No account, no upload step, no server in the path.',
  ctaPrimary: 'Start sharing',
  ctaSecondary: 'See how it works',
  /** Short factual facts, not marketing badges. */
  specs: [
    { label: 'Account', value: 'Not required' },
    { label: 'Max file', value: '2 GiB' },
    { label: 'Encryption', value: 'End-to-end' },
  ],
} as const;

export type DeviceKind = 'phone' | 'computer';

export const HOW_IT_WORKS = {
  eyebrow: 'How it works',
  title: 'One code. Two devices.',
  subtitle:
    'Nothing is uploaded. The server introduces your two devices and then steps out of the path.',
  steps: [
    {
      id: '01',
      from: 'phone',
      to: 'computer',
      title: 'Phone to computer',
      description: 'Take a photo on your phone and send it to your laptop. No cable, no upload.',
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
  mechanismTail: 'Files flow directly between them.',
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
      values: ['Device to device', 'Via server', 'Via server', 'Device to device'],
    },
    {
      label: 'Account required',
      values: ['No', 'Optional', 'Yes', 'No'],
    },
    {
      label: 'Max file size',
      values: ['2 GiB', '3 GB', '5 TB', 'Limited by device'],
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
  title: 'Your files never touch a server.',
  subtitle:
    'The cloud introduces your two devices and then steps out of the path. It never sees your files, your metadata, or you.',
  points: [
    'No account',
    'No ads',
    'No tracking',
    'Nothing stored',
  ],
  relayLabel: 'Handshake only',
  directLabel: 'File data, direct',
  caption:
    'The six-character code and the SDP handshake are the only things the server ever handles.',
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
    a: 'Those route your files through a server. AuraShare connects your two devices directly — nothing is uploaded, nothing is stored, and there is nothing to clean up afterward.',
  },
  {
    id: 'install',
    q: 'Do I need to install anything?',
    a: 'No. It runs in any modern browser on any device. Open it, get a six-character code, share.',
  },
  {
    id: 'size',
    q: 'How big can files be?',
    a: 'Up to 2 GiB per file. Capacity is effectively unlimited because files never touch a server.',
  },
  {
    id: 'security',
    q: 'Is it secure?',
    a: 'Yes. Files travel over an end-to-end encrypted WebRTC connection (DTLS). The server relays only the initial handshake and never sees file content.',
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
  trust: ['NO ACCOUNT', 'NO SERVER', 'END-TO-END ENCRYPTED'],
} as const;
