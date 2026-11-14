import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P2PManager } from '@/lib/webrtc';
import type { SignalingCallbacks, WireSignal } from '@/lib/signaling';
import { FakePeerConnection, installPeerConnection, makeEvents } from './fakes';
const state = vi.hoisted(() => ({
  channels: [] as Array<{ callbacks: SignalingCallbacks; open: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }>,
  mint: vi.fn(), ice: vi.fn(),
}));
vi.mock('@/lib/signaling', () => ({
  mintRoom: state.mint, fetchPeerIce: state.ice,
  SignalingChannel: class {
    open = vi.fn(async () => ({ token: 'a'.repeat(64), expiresAt: Date.now() + 86400000 }));
    send = vi.fn(); close = vi.fn(); startHeartbeat = vi.fn(); stopHeartbeat = vi.fn();
    callbacks: SignalingCallbacks;
    constructor(callbacks: SignalingCallbacks) { this.callbacks = callbacks; state.channels.push(this); }
  },
}));
const managers: P2PManager[] = [];
beforeEach(() => {
  state.channels = []; state.mint.mockReset().mockResolvedValue('ABC123');
  state.ice.mockReset().mockResolvedValue({ iceServers: [{ urls: 'stun:test' }], expiresAt: null, degraded: true });
  installPeerConnection();
});
afterEach(() => { managers.splice(0).forEach((manager) => manager.close()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function manager() { const events = makeEvents(); const peer = new P2PManager(events); managers.push(peer); return { peer, events }; }
function signal(message: WireSignal) { state.channels.at(-1)!.callbacks.onMessage(message); }
const pc = () => FakePeerConnection.instances.at(-1)!;
const generation = 'b'.repeat(32);

describe('P2P session ownership and negotiation', () => {
  it('obtains per-peer credentials after admission and waits for receiver readiness', async () => {
    const { peer } = manager(); await expect(peer.initialize()).resolves.toBe('ABC123');
    expect(state.ice).toHaveBeenCalledWith('ABC123', 'a'.repeat(64), expect.any(AbortSignal));
    expect(pc().createOffer).not.toHaveBeenCalled();
    signal({ type: 'ready' });
    await vi.waitFor(() => expect(pc().createOffer).toHaveBeenCalledWith({ iceRestart: false }));
  });
  it('buffers ICE until its generation has a remote description', async () => {
    const { peer } = manager(); await peer.join('ABC123');
    const candidate = { candidate: 'candidate:test' };
    signal({ type: 'ice', candidate, generation });
    await Promise.resolve(); expect(pc().addIceCandidate).not.toHaveBeenCalled();
    signal({ type: 'offer', sdp: { type: 'offer', sdp: 'remote' }, generation });
    await vi.waitFor(() => expect(pc().addIceCandidate).toHaveBeenCalledWith(candidate));
    expect(state.channels.at(-1)!.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer', generation }));
  });
  it('does not create a peer connection after cancelling a pending room mint', async () => {
    let resolve!: (code: string) => void;
    state.mint.mockReturnValue(new Promise<string>((done) => { resolve = done; }));
    const { peer } = manager(); const opening = peer.initialize();
    const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    peer.close(); resolve('ABC123'); await rejected;
    expect(FakePeerConnection.instances).toHaveLength(0);
  });
  it('does not send an SDP offer after closing during createOffer', async () => {
    const { peer } = manager(); await peer.initialize();
    let resolve!: (description: { type: "offer"; sdp: string }) => void;
    pc().createOffer.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    signal({ type: 'ready' }); await Promise.resolve(); await Promise.resolve();
    peer.close(); resolve({ type: 'offer', sdp: 'late' }); await Promise.resolve(); await Promise.resolve();
    expect(state.channels.at(-1)!.send.mock.calls.some(([msg]) => msg.type === 'offer')).toBe(false);
  });
  it('requires an old peer to reload instead of waiting for unsupported frames', async () => {
    const { peer, events } = manager(); await peer.join('ABC123');
    signal({ type: 'hello', role: 'sender' });
    await vi.waitFor(() => expect(events.onError).toHaveBeenCalledWith(expect.stringContaining('Reload AuraShare')));
  });
});
