/**
 * All marketing copy for the landing page — single source of truth.
 * Components import from here; no copy lives in JSX.
 */

export const NAV_LINKS = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Why AuraShare', href: '#why-aurashare' },
  { label: 'Privacy', href: '#privacy' },
  { label: 'FAQ', href: '#faq' },
] as const;

export const HERO = {
  eyebrow: 'Peer-to-peer file sharing',
  title: 'Send files between your devices. Instantly.',
  subtitle: 'No account. No ads. No subscription. Just open AuraShare and start sharing.',
  ctaPrimary: 'Start Sharing',
  ctaSecondary: 'See How It Works',
  trust: ['P2P DIRECT', 'E2E ENCRYPTED', 'INFINITE CAPACITY'],
} as const;

export type DeviceKind = 'phone' | 'computer';

export const HOW_IT_WORKS = {
  eyebrow: 'How it works',
  title: 'One code. Two devices. Zero friction.',
  subtitle:
    'AuraShare pairs any two devices in seconds — no cables, no account, no upload step.',
  steps: [
    {
      id: '01',
      from: 'phone',
      to: 'computer',
      title: 'Phone → Computer',
      description: 'Snap a photo on your phone, drop it on your laptop. No cable, no cloud detour.',
    },
    {
      id: '02',
      from: 'computer',
      to: 'phone',
      title: 'Computer → Phone',
      description: 'Move documents, PDFs, and media to your phone while you are out and about.',
    },
    {
      id: '03',
      from: 'computer',
      to: 'computer',
      title: 'Computer → Computer',
      description: 'Shuttle files between your work and home machines in seconds.',
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

export type FeatureIconKey = 'zap' | 'monitor-smartphone' | 'infinity';

export const WHY_AURASHARE = {
  eyebrow: 'Why AuraShare',
  title: 'Your files take the direct route.',
  features: [
    {
      icon: 'zap',
      title: 'Direct & instant',
      description:
        'Files travel device-to-device over WebRTC. No queue, no upload-then-download round trip, no "preparing your transfer".',
    },
    {
      icon: 'monitor-smartphone',
      title: 'No install needed',
      description:
        'AuraShare runs in any modern browser on any device. Open it, get a code, share.',
    },
    {
      icon: 'infinity',
      title: 'Unlimited capacity',
      description:
        'Files never touch a server, so there is no storage cap. Share up to 2 GiB per file, as often as you like.',
    },
  ] as const satisfies ReadonlyArray<{
    icon: FeatureIconKey;
    title: string;
    description: string;
  }>,
} as const;

export const PRIVACY = {
  eyebrow: 'Private by design',
  title: "Your devices don't need an account to talk to each other.",
  subtitle:
    'AuraShare connects your two devices directly. The cloud only introduces them — it never sees your files, your metadata, or you.',
  chips: ['No account', 'No ads', 'No tracking', 'End-to-end encrypted', 'Nothing stored'],
  relayLabel: 'Relays handshake only',
  directLabel: 'Files — direct P2P',
  caption: 'File data flows peer-to-peer. The 6-character code is all the cloud ever handles.',
} as const;

export const FAQS = [
  {
    id: 'free',
    q: 'Is it really free, no catches?',
    a: 'Yes. No account, no ads, no subscription, no paywalls. Your devices do the work, so there is nothing to charge for.',
  },
  {
    id: 'different',
    q: 'How is this different from WeTransfer or Google Drive?',
    a: 'Those route your files through a server. AuraShare connects your two devices directly — nothing is uploaded, nothing is stored, nothing to clean up afterward.',
  },
  {
    id: 'install',
    q: 'Do I need to install anything?',
    a: 'No. It runs in any modern browser on any device. Open it, get a 6-character code, share.',
  },
  {
    id: 'size',
    q: 'How big can files be?',
    a: 'Up to 2 GiB per file, and capacity is effectively unlimited because files never touch a server.',
  },
  {
    id: 'security',
    q: 'Is it secure?',
    a: 'Yes. Files travel over an end-to-end encrypted WebRTC connection (DTLS). The cloud relays only the initial handshake and never sees file content.',
  },
  {
    id: 'network',
    q: 'Do both devices need to be on the same network?',
    a: 'No. AuraShare works across networks and countries — STUN/TURN handles the connection under the hood.',
  },
] as const;

export const FINAL_CTA = {
  title: 'Your next file transfer is already free.',
  subtitle: 'Open AuraShare on two devices. Start sharing in seconds.',
  cta: 'Start Sharing',
} as const;

export const FOOTER = {
  tagline: 'Files flow between your devices. Directly, privately, free.',
  backToTop: 'Back to top',
  trust: ['P2P DIRECT', 'E2E ENCRYPTED', 'INFINITE CAPACITY'],
} as const;
