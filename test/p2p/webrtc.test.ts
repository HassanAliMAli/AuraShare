import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P2PManager } from '@/lib/webrtc';
import type { SignalingCallbacks, WireSignal } from '@/lib/signaling';
import { FakeDataChannel, FakePeerConnection, installPeerConnection, makeEvents } from './fakes';
const state = vi.hoisted(() => ({
  channels: [] as Array<{ callbacks: SignalingCallbacks; open: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; startHeartbeat: ReturnType<typeof vi.fn>; stopHeartbeat: ReturnType<typeof vi.fn> }>,
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

// ─── Session, negotiation, and renewal coverage ─────────────────────────────

type Channel = (typeof state.channels)[number];

function channelOf(index = -1): Channel {
  const channel = state.channels.at(index);
  if (!channel) throw new Error('Signaling channel was not constructed');
  return channel;
}

async function sender(expiresAt: number | null = null) {
  state.ice.mockResolvedValue({
    iceServers: [{ urls: 'stun:test' }],
    expiresAt,
    degraded: true,
  });
  const { peer, events } = manager();
  const code = await peer.initialize();
  const channel = channelOf();
  const fake = pc();
  const dc = fake.lastChannel!;
  return { peer, events, channel, fake, dc, code };
}

async function receiver(expiresAt: number | null = null) {
  state.ice.mockResolvedValue({
    iceServers: [{ urls: 'stun:test' }],
    expiresAt,
    degraded: true,
  });
  const { peer, events } = manager();
  await peer.join('ABC123');
  const channel = channelOf();
  const fake = pc();
  const dc = new FakeDataChannel();
  fake.ondatachannel?.({ channel: dc.asRTCDataChannel() } as RTCDataChannelEvent);
  return { peer, events, channel, fake, dc };
}

function signalOn(channel: Channel, message: WireSignal) {
  channel.callbacks.onMessage(message);
}

function offerGeneration(channel: Channel): string {
  const offer = channel.send.mock.calls
    .map(([message]) => message as WireSignal)
    .find((message) => message.type === 'offer');
  if (!offer || offer.type !== 'offer' || !offer.generation) {
    throw new Error('No offer was sent');
  }
  return offer.generation;
}

async function connectSender(expiresAt: number | null = null) {
  const context = await sender(expiresAt);
  signalOn(context.channel, { type: 'ready' });
  await vi.waitFor(() => expect(context.fake.createOffer).toHaveBeenCalled());
  context.dc.emit(JSON.stringify({ v: 2, kind: 'hello' }));
  return context;
}

async function connectReceiver(expiresAt: number | null = null) {
  const context = await receiver(expiresAt);
  context.dc.emit(JSON.stringify({ v: 2, kind: 'hello' }));
  signalOn(context.channel, {
    type: 'offer',
    sdp: { type: 'offer', sdp: 'remote' },
    generation,
  });
  await vi.waitFor(() => expect(context.fake.createAnswer).toHaveBeenCalled());
  return context;
}

async function negotiatedSender(expiresAt: number | null = null) {
  const context = await connectSender(expiresAt);
  context.fake.iceConnectionState = 'connected';
  signalOn(context.channel, {
    type: 'answer',
    sdp: { type: 'answer', sdp: 'remote' },
    generation: offerGeneration(context.channel),
  });
  await vi.waitFor(() => expect(context.fake.setRemoteDescription).toHaveBeenCalled());
  return context;
}

describe('P2P session lifecycle', () => {
  it('applies the matching answer and stops waiting for one', async () => {
    const { events, channel, fake, dc } = await connectSender();
    const generation = offerGeneration(channel);

    signalOn(channel, { type: 'answer', sdp: { type: 'answer', sdp: 'remote' }, generation });
    await vi.waitFor(() => expect(fake.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'remote' }));

    expect(events.onError).not.toHaveBeenCalled();
    expect(dc.readyState).toBe('open');
  });

  it('rejects answers without a generation, on the wrong side, or for another offer', async () => {
    const missing = await connectSender();
    signalOn(missing.channel, { type: 'answer', sdp: { type: 'answer', sdp: 'remote' } });
    await vi.waitFor(() => expect(missing.events.onError).toHaveBeenCalledWith(expect.stringContaining('Could not establish')));

    const wrongGeneration = await connectSender();
    signalOn(wrongGeneration.channel, {
      type: 'answer', sdp: { type: 'answer', sdp: 'remote' }, generation: 'c'.repeat(32),
    });
    await vi.waitFor(() => expect(wrongGeneration.events.onError).toHaveBeenCalled());

    const wrongSide = await receiver();
    signalOn(wrongSide.channel, {
      type: 'answer', sdp: { type: 'answer', sdp: 'remote' }, generation,
    });
    await vi.waitFor(() => expect(wrongSide.events.onError).toHaveBeenCalled());
  });

  it('rejects offers without a generation, on the share side, and after an offer was answered', async () => {
    const missing = await receiver();
    signalOn(missing.channel, { type: 'offer', sdp: { type: 'offer', sdp: 'remote' } });
    await vi.waitFor(() => expect(missing.events.onError).toHaveBeenCalledWith(expect.stringContaining('Reload AuraShare')));

    const wrongSide = await sender();
    signalOn(wrongSide.channel, { type: 'offer', sdp: { type: 'offer', sdp: 'remote' }, generation });
    await vi.waitFor(() => expect(wrongSide.events.onError).toHaveBeenCalled());

    const repeated = await connectReceiver();
    signalOn(repeated.channel, {
      type: 'offer', sdp: { type: 'offer', sdp: 'second' }, generation: 'd'.repeat(32),
    });
    await vi.waitFor(() => expect(repeated.events.onError).toHaveBeenCalled());
  });

  it('flushes buffered ICE and forwards new candidates for the active generation', async () => {
    const { channel, fake } = await receiver();
    const candidate = { candidate: 'candidate:1' };
    signalOn(channel, { type: 'ice', candidate, generation });
    signalOn(channel, {
      type: 'offer', sdp: { type: 'offer', sdp: 'remote' }, generation,
    });
    await vi.waitFor(() => expect(fake.addIceCandidate).toHaveBeenCalledWith(candidate));

    fake.remoteDescription = { type: 'offer', sdp: 'remote' };
    signalOn(channel, { type: 'ice', candidate: { candidate: 'candidate:2' }, generation });
    await vi.waitFor(() => expect(fake.addIceCandidate).toHaveBeenCalledTimes(2));
  });

  it('caps buffered ICE across attempts', async () => {
    const { channel, events } = await receiver();
    for (let index = 0; index < 128; index += 1) {
      signalOn(channel, { type: 'ice', candidate: { candidate: `candidate:${index}` }, generation });
    }
    signalOn(channel, { type: 'ice', candidate: { candidate: 'candidate:overflow' }, generation: 'e'.repeat(32) });

    await vi.waitFor(() => expect(events.onError).toHaveBeenCalledWith(expect.stringContaining('Could not establish')));
  });

  it('bounds the number of buffered generations', async () => {
    const { channel, events } = await receiver();
    signalOn(channel, { type: 'ice', candidate: { candidate: 'a' }, generation: '1'.repeat(32) });
    signalOn(channel, { type: 'ice', candidate: { candidate: 'b' }, generation: '2'.repeat(32) });
    signalOn(channel, { type: 'ice', candidate: { candidate: 'c' }, generation: '3'.repeat(32) });

    await vi.waitFor(() => expect(events.onError).toHaveBeenCalled());
  });

  it('ignores candidates without a generation and retired generations', async () => {
    const { channel, events } = await connectReceiver();
    signalOn(channel, { type: 'ice', candidate: { candidate: 'no-generation' } });
    signalOn(channel, { type: 'ice', candidate: { candidate: 'stale' }, generation: 'f'.repeat(32) });
    await Promise.resolve();

    expect(events.onError).not.toHaveBeenCalled();
  });

  it('surfaces ICE failures and closed connections', async () => {
    const failed = await connectSender();
    failed.fake.iceConnectionState = 'failed';
    failed.fake.oniceconnectionstatechange?.();
    await vi.waitFor(() => expect(failed.events.onError).toHaveBeenCalledWith('ICE negotiation failed'));

    const closed = await connectSender();
    closed.fake.iceConnectionState = 'closed';
    closed.fake.oniceconnectionstatechange?.();
    expect(closed.events.onDisconnected).toHaveBeenCalled();
  });

  it('reports room expiry with and without a peer present', async () => {
    const alone = await receiver();
    signalOn(alone.channel, { type: 'room-expired' });
    expect(alone.events.onRoomEnded).toHaveBeenCalledWith('no-peer');

    const together = await receiver();
    signalOn(together.channel, { type: 'peer-present' });
    await Promise.resolve();
    signalOn(together.channel, { type: 'room-expired' });
    expect(together.events.onRoomEnded).toHaveBeenCalledWith('ended');
  });

  it('treats peer departure and signaling loss as disconnects', async () => {
    const left = await receiver();
    signalOn(left.channel, { type: 'peer-left' });
    expect(left.events.onDisconnected).toHaveBeenCalledTimes(1);

    const lost = await receiver();
    lost.channel.callbacks.onClose();
    expect(lost.events.onDisconnected).toHaveBeenCalledTimes(1);

    const errored = await receiver();
    errored.channel.callbacks.onError();
    expect(errored.events.onError).toHaveBeenCalledWith('Signaling tunnel failed');
  });

  it('refuses to buffer an unbounded number of early frames', async () => {
    const { events } = manager();
    for (let index = 0; index < 129; index += 1) {
      signalOn(channelOf(), { type: 'peer-present' });
    }
    expect(events.onError).toHaveBeenCalledWith('Too many early signaling frames');
  });

  it('starts the heartbeat and transfer handshake when the data channel opens', async () => {
    const { channel, dc } = await sender();
    expect(channel.startHeartbeat).toHaveBeenCalled();
    expect(dc.sent).toContain('{"v":2,"kind":"hello"}');

    dc.emit(JSON.stringify({ v: 2, kind: 'hello' }));
    await Promise.resolve();
    expect(dc.readyState).toBe('open');
  });

  it('notifies the application when the data channel opens or fails', async () => {
    const senderContext = await sender();
    senderContext.dc.emit(JSON.stringify({ v: 2, kind: 'hello' }));
    await Promise.resolve();
    expect(senderContext.events.onReceiverConnected).toHaveBeenCalledTimes(1);

    const receiverContext = await receiver();
    receiverContext.dc.emit(JSON.stringify({ v: 2, kind: 'hello' }));
    await Promise.resolve();
    expect(receiverContext.events.onConnected).toHaveBeenCalledTimes(1);

    const closed = await connectSender();
    closed.dc.close();
    expect(closed.events.onDisconnected).toHaveBeenCalled();

    const broken = await connectSender();
    broken.dc.fail();
    await vi.waitFor(() => expect(broken.events.onError).toHaveBeenCalledWith('Data channel error'));

    const badProtocol = await connectSender();
    badProtocol.dc.emit('not-a-control-frame');
    await vi.waitFor(() => expect(badProtocol.events.onError).toHaveBeenCalledWith('Invalid transfer data or unavailable channel'));
  });

  it('ignores a second data channel', async () => {
    const { fake } = await receiver();
    const second = new FakeDataChannel();
    fake.ondatachannel?.({ channel: second.asRTCDataChannel() } as RTCDataChannelEvent);
    expect(second.readyState).toBe('closed');
  });

  it('forwards application transfer calls to the session', async () => {
    const { peer, dc } = await connectSender();
    peer.sendMeta([new File([new Uint8Array([1])], 'a.txt', { type: 'text/plain' })]);
    peer.sendText('hello');
    peer.requestFile(0);
    peer.cancelTransfer();
    await Promise.resolve();

    expect(dc.sent.some((entry) => typeof entry === 'string' && entry.includes('"descriptors"'))).toBe(true);
    expect(dc.sent.some((entry) => typeof entry === 'string' && entry.includes('"start"'))).toBe(true);
  });

  it('sends ICE candidates for the active generation only', async () => {
    const { channel, fake } = await connectSender();
    fake.localDescription = { type: 'offer', sdp: 'a=ice-ufrag:abcd' };

    fake.onicecandidate?.({
      candidate: { usernameFragment: 'other', toJSON: () => ({ candidate: 'stale' }) },
    } as unknown as RTCPeerConnectionIceEvent);
    fake.onicecandidate?.({
      candidate: { usernameFragment: 'abcd', toJSON: () => ({ candidate: 'fresh' }) },
    } as unknown as RTCPeerConnectionIceEvent);
    fake.onicecandidate?.({
      candidate: { toJSON: () => ({ candidate: 'plain' }) },
    } as unknown as RTCPeerConnectionIceEvent);
    fake.onicecandidate?.({ candidate: null } as unknown as RTCPeerConnectionIceEvent);

    await Promise.resolve();
    const candidates = channel.send.mock.calls
      .map(([message]) => message as WireSignal)
      .filter((message) => message.type === 'ice');
    expect(candidates).toEqual([
      { type: 'ice', candidate: { candidate: 'fresh' }, generation: expect.any(String) },
      { type: 'ice', candidate: { candidate: 'plain' }, generation: expect.any(String) },
    ]);
  });

  it('fails when a candidate cannot be sent', async () => {
    const { channel, fake, events } = await connectSender();
    fake.localDescription = { type: 'offer', sdp: 'a=ice-ufrag:abcd' };
    channel.send.mockImplementation(() => { throw new Error('closed'); });

    fake.onicecandidate?.({
      candidate: { usernameFragment: 'abcd', toJSON: () => ({ candidate: 'fresh' }) },
    } as unknown as RTCPeerConnectionIceEvent);

    await vi.waitFor(() => expect(events.onError).toHaveBeenCalledWith('Could not send ICE candidate'));
  });

  it('closes cleanly and ignores work after cancellation', async () => {
    const { peer, fake } = await connectSender();
    peer.close();
    peer.close();
    expect(fake.close).toHaveBeenCalled();
    expect(() => {
      peer.sendMeta([]);
      peer.sendText('x');
      peer.requestFile(0);
      peer.cancelTransfer();
    }).not.toThrow();

    fake.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'late' }) } } as unknown as RTCPeerConnectionIceEvent);
    fake.oniceconnectionstatechange?.();
  });

  it('survives a peer connection without an SCTP max message size', async () => {
    state.ice.mockResolvedValue({ iceServers: [{ urls: 'stun:test' }], expiresAt: null, degraded: true });
    const { peer } = manager();
    await peer.join('ABC123');
    const fake = pc();
    fake.sctp = undefined as unknown as { maxMessageSize: number };
    const dc = new FakeDataChannel();
    fake.ondatachannel?.({ channel: dc.asRTCDataChannel() } as RTCDataChannelEvent);
    expect(dc.sent).toContain('{"v":2,"kind":"hello"}');
  });
});

describe('P2P credential renewal', () => {
  const visible = () => Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  const hidden = () => Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'hidden',
  });

  it('requests renewal only while visible with expiring credentials', async () => {
    hidden();
    const { channel } = await negotiatedSender(Date.now() + 60_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(state.ice).toHaveBeenCalledTimes(1);

    visible();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(state.ice).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(channel.send.mock.calls.some(([message]) => (message as WireSignal).type === 'refresh-prepare')).toBe(true));
  });

  it('renews the sender after the receiver acknowledges preparation', async () => {
    visible();
    const { channel, fake } = await negotiatedSender(Date.now() + 60_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(fake.setConfiguration).toHaveBeenCalled());

    const prepared = channel.send.mock.calls
      .map(([message]) => message as WireSignal)
      .find((message) => message.type === 'refresh-prepare');
    if (!prepared || prepared.type !== 'refresh-prepare') throw new Error('No refresh-prepare sent');

    fake.iceConnectionState = 'connected';
    signalOn(channel, { type: 'refresh-ready', id: prepared.id });
    await vi.waitFor(() => expect(fake.createOffer).toHaveBeenCalledWith({ iceRestart: true }));
  });

  it('asks the sender to renew when the receiver notices expiry', async () => {
    visible();
    const { channel } = await connectReceiver(Date.now() + 60_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(
      channel.send.mock.calls.some(([message]) => (message as WireSignal).type === 'refresh-request'),
    ).toBe(true));
  });

  it('applies a renewal prepared by the sender', async () => {
    const { channel, fake } = await connectReceiver();
    signalOn(channel, { type: 'refresh-prepare', id: '1'.repeat(32) });
    await vi.waitFor(() => expect(fake.setConfiguration).toHaveBeenCalled());
    expect(channel.send).toHaveBeenCalledWith({ type: 'refresh-ready', id: '1'.repeat(32) });

    signalOn(channel, {
      type: 'offer', sdp: { type: 'offer', sdp: 'renewed' }, generation: '1'.repeat(32),
    });
    await vi.waitFor(() => expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'answer', generation: '1'.repeat(32),
    })));
  });

  it('rejects a second renewal preparation', async () => {
    const { channel, events } = await connectReceiver();
    signalOn(channel, { type: 'refresh-prepare', id: '1'.repeat(32) });
    await vi.waitFor(() => expect(channel.send).toHaveBeenCalledWith({ type: 'refresh-ready', id: '1'.repeat(32) }));
    signalOn(channel, { type: 'refresh-prepare', id: '2'.repeat(32) });
    await vi.waitFor(() => expect(events.onError).toHaveBeenCalled());
  });

  it('defers renewal until the transfer is connected', async () => {
    visible();
    const { channel, dc } = await negotiatedSender(Date.now() + 60_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(channel.send.mock.calls.some(([message]) => (message as WireSignal).type === 'refresh-prepare')).toBe(false);

    dc.emit(JSON.stringify({ v: 2, kind: 'hello' }));
    await vi.waitFor(() => expect(channel.send.mock.calls.some(([message]) => (message as WireSignal).type === 'refresh-prepare')).toBe(true));
  });

  it('retries credential fetching while connected, then renews', async () => {
    visible();
    const { channel } = await negotiatedSender(Date.now() + 60_000);
    state.ice.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      iceServers: [{ urls: 'stun:test' }], expiresAt: Date.now() + 3_600_000, degraded: false,
    });

    vi.useFakeTimers();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(channel.send.mock.calls.some(([message]) => (message as WireSignal).type === 'refresh-prepare')).toBe(true);
  });

  it('fails the session when renewal cannot fetch credentials', async () => {
    visible();
    const { events } = await negotiatedSender(Date.now() + 60_000);
    state.ice.mockRejectedValue(new Error('offline'));

    vi.useFakeTimers();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events.onError).toHaveBeenCalledWith('Relay renewal failed. Start a new session.');
  });

  it('times out an unanswered negotiation', async () => {
    vi.useFakeTimers();
    const { events, channel } = await connectSender();
    signalOn(channel, { type: 'ready' });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(events.onError).toHaveBeenCalledWith('Connection negotiation timed out');
  });

  it('fails when credentials cannot be loaded during bootstrap', async () => {
    state.ice.mockRejectedValue(new Error('offline'));
    const { peer } = manager();
    await expect(peer.initialize()).rejects.toThrow('offline');
  });

  it('warns when only STUN is available', async () => {
    const { events } = await sender();
    expect(events.onConnectionWarning).toHaveBeenCalledWith('Relay unavailable: some networks may not connect.');

    state.ice.mockResolvedValue({
      iceServers: [{ urls: 'turns:relay', username: 'u', credential: 'c' }],
      expiresAt: null,
      degraded: false,
    });
    const healthy = manager();
    await healthy.peer.initialize();
    expect(healthy.events.onConnectionWarning).toHaveBeenCalledWith(null);
  });
});
