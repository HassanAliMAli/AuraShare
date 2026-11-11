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
  | { kind: 'transfer-complete'; fileIndex: number; crc?: number }
  | { kind: 'text'; text: string };

/** Discriminated union of every frame exchanged over the signaling socket. */
export type WireSignal =
  | { type: 'hello'; role: 'sender' | 'receiver' }
  | { type: 'peer-present' }
  | { type: 'peer-left' }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit };
