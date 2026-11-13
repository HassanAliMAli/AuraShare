import { vi } from 'vitest';
import type { P2PEvents } from '@/lib/webrtc';

/** Minimal in-memory RTCDataChannel double. */
export class FakeDataChannel extends EventTarget {
  binaryType: BinaryType = 'blob';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  readyState: RTCDataChannelState = 'open';
  label = 'files';
  ordered = true;

  onmessage: ((this: RTCDataChannel, event: MessageEvent) => void) | null = null;
  onopen: ((this: RTCDataChannel, event: Event) => void) | null = null;
  onclose: ((this: RTCDataChannel, event: Event) => void) | null = null;
  onerror: ((this: RTCDataChannel, event: Event) => void) | null = null;
  onbufferedamountlow: ((this: RTCDataChannel, event: Event) => void) | null = null;

  sent: Array<string | ArrayBuffer> = [];

  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
    if (this.readyState !== 'open') throw new Error('data channel is not open');
    this.sent.push(data as string | ArrayBuffer);
  }

  close(): void {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.onclose?.call(this as unknown as RTCDataChannel, new Event('close'));
    this.dispatchEvent(new Event('close'));
  }

  emit(data: unknown): void {
    this.onmessage?.call(this as unknown as RTCDataChannel, { data } as MessageEvent);
  }

  open(): void {
    this.readyState = 'open';
    this.onopen?.call(this as unknown as RTCDataChannel, new Event('open'));
  }

  fail(): void {
    this.onerror?.call(this as unknown as RTCDataChannel, new Event('error'));
  }

  asRTCDataChannel(): RTCDataChannel {
    return this as unknown as RTCDataChannel;
  }
}

/** Minimal WebSocket double with manual event triggers. */
export class FakeWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) return;
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
    this.dispatchEvent(new Event('close'));
  }

  triggerOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
    this.dispatchEvent(new Event('open'));
  }

  triggerMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  triggerError(): void {
    this.onerror?.(new Event('error'));
    this.dispatchEvent(new Event('error'));
  }
}

/** Minimal RTCPeerConnection double. */
export class FakePeerConnection {
  static instances: FakePeerConnection[] = [];

  readonly config: RTCConfiguration;
  iceConnectionState: RTCIceConnectionState = 'new';
  lastChannel: FakeDataChannel | null = null;

  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;

  createDataChannel = vi.fn((label: string, options?: RTCDataChannelInit) => {
    void options;
    const channel = new FakeDataChannel();
    channel.label = label;
    this.lastChannel = channel;
    return channel.asRTCDataChannel();
  });

  createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'offer-sdp' }));
  createAnswer = vi.fn(async () => ({ type: 'answer' as const, sdp: 'answer-sdp' }));
  setLocalDescription = vi.fn(async () => undefined);
  /**
   * The remote description, once it has been applied.
   *
   * The real `RTCPeerConnection` exposes it, and `addIceCandidate` refuses to
   * work until it is set — so the fake has to behave the same way, or a test
   * cannot tell the difference between "applied" and "buffered".
   */
  remoteDescription: RTCSessionDescriptionInit | null = null;
  setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.remoteDescription = description;
  });
  addIceCandidate = vi.fn(async () => undefined);
  close = vi.fn(() => {
    this.iceConnectionState = 'closed';
  });

  constructor(config: RTCConfiguration = {}) {
    this.config = config;
    FakePeerConnection.instances.push(this);
  }

  asRTCPeerConnection(): RTCPeerConnection {
    return this as unknown as RTCPeerConnection;
  }
}

/** Complete P2P event spies for TransferSession / P2PManager tests. */
export function makeEvents() {
  return {
    onProgress: vi.fn(),
    onTransferComplete: vi.fn(),
    onFileComplete: vi.fn(),
    onFileAcknowledged: vi.fn(),
    onFileDescriptorsReceived: vi.fn(),
    onTextReceived: vi.fn(),
    onConnected: vi.fn(),
    onDisconnected: vi.fn(),
    onReceiverConnected: vi.fn(),
    onRoomEnded: vi.fn(),
    onError: vi.fn(),
    onProtocolError: vi.fn(),
  } satisfies P2PEvents;
}

export function installWebSocket(): void {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
}

export function installPeerConnection(): void {
  FakePeerConnection.instances = [];
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
}
