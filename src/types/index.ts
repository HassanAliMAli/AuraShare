/**
 * Shared types for AuraShare.
 * Single source of truth — import from here, never redeclare.
 */

export type FileDescriptor = {
  name: string;
  size: number;
  type: string;
  index?: number;
};

export type AppStatus =
  | 'idle'
  | 'sharing'
  | 'connected'
  | 'downloading'
  | 'success'
  | 'error'
  | 'connecting';

export type ShareMode = 'text' | 'files';

/** Discriminated union of every message sent over the RTC data channel. */
export type SignalingMessage =
  | { kind: 'file-descriptors'; files: FileDescriptor[] }
  | { kind: 'file-metadata'; name: string; size: number; type: string; index: number }
  | { kind: 'file-request'; index: number }
  | { kind: 'file-acknowledged'; index: number }
  | { kind: 'transfer-complete'; fileIndex: number }
  | { kind: 'text'; text: string };
