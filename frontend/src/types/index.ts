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

/** Legacy v1 shapes, recognized only to show an upgrade message to old peers. */
export type SignalingMessage =
  | { kind: 'file-descriptors'; files: FileDescriptor[] }
  | { kind: 'file-metadata'; name: string; size: number; type: string; index: number }
  | { kind: 'file-request'; index: number }
  | { kind: 'file-acknowledged'; index: number }
  | { kind: 'transfer-complete'; fileIndex: number; crc?: number }
  | { kind: 'text'; text: string };

/** Discriminated union of every frame exchanged over the signaling socket. */
export type WireSignal =
  | { type: 'hello'; role: 'sender' | 'receiver'; version?: 2 }
  | { type: 'ready' }
  | { type: 'refresh-request' }
  | { type: 'refresh-prepare'; id: string }
  | { type: 'refresh-ready'; id: string }
  | { type: 'peer-present' }
  | { type: 'peer-left' }
  | { type: 'room-expired' }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; generation?: string }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; generation?: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit; generation?: string };
