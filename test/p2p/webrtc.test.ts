import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P2PManager } from '@/lib/webrtc';
import type { SignalingCallbacks, WireSignal } from '@/lib/signaling';
import {
  FakeDataChannel,
  FakePeerConnection,
  installPeerConnection,
  makeEvents,
} from './fakes';

const hoisted = vi.hoisted(() => ({
  channels: [] as Array<{
    callbacks: SignalingCallbacks;
    open: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }>,
  fetchIceServers: vi.fn(),
  mintRoom: vi.fn(),
}));

vi.mock('@/lib/signaling', () => {
  class SignalingChannel {
    callbacks: SignalingCallbacks;
    open = vi.fn(async () => undefined);
    send = vi.fn();
    close = vi.fn();

    constructor(callbacks: SignalingCallbacks) {
      this.callbacks = callbacks;
      hoisted.channels.push(this);
    }
  }

  return {
    SignalingChannel,
    fetchIceServers: hoisted.fetchIceServers,
    mintRoom: hoisted.mintRoom,
  };
});

function lastChannel(): (typeof hoisted.channels)[number] {
  const channel = hoisted.channels.at(-1);
  if (!channel) throw new Error('SignalingChannel was not constructed');
  return channel;
}

function lastPeerConnection(): FakePeerConnection {
  const connection = FakePeerConnection.instances.at(-1);
  if (!connection) throw new Error('RTCPeerConnection was not constructed');
  return connection;
}

function signal(message: WireSignal): void {
  lastChannel().callbacks.onMessage(message);
}

function sentMessages(): Array<Record<string, unknown>> {
  return lastChannel()
    .send.mock.calls.map((call) => call[0] as Record<string, unknown>);
}

async function initializeSender(events: ReturnType<typeof makeEvents>) {
  hoisted.mintRoom.mockResolvedValue('ABC123');
  hoisted.fetchIceServers.mockResolvedValue([{ urls: 'stun:test' }]);
  const manager = new P2PManager(events);
  const roomId = await manager.initialize();
  return { manager, roomId };
}

async function joinReceiver(events: ReturnType<typeof makeEvents>) {
  hoisted.fetchIceServers.mockResolvedValue([{ urls: 'stun:test' }]);
  const manager = new P2PManager(events);
  await manager.join('ABC123');
  return manager;
}

describe('p2p/webrtc — P2PManager setup', () => {
  beforeEach(() => {
    hoisted.channels.length = 0;
    hoisted.fetchIceServers.mockReset();
    hoisted.mintRoom.mockReset();
    installPeerConnection();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mints a room, creates the data channel, and opens sender signaling', async () => {
    const events = makeEvents();
    const { roomId } = await initializeSender(events);

    expect(roomId).toBe('ABC123');
    expect(hoisted.fetchIceServers).toHaveBeenCalledTimes(1);
    expect(hoisted.mintRoom).toHaveBeenCalledTimes(1);

    const pc = lastPeerConnection();
    expect(pc.config).toEqual({ iceServers: [{ urls: 'stun:test' }] });
    expect(pc.createDataChannel).toHaveBeenCalledWith('files', { ordered: true });
    expect(lastChannel().open).toHaveBeenCalledWith('ABC123', 'sender');
  });

  it('joins a room as receiver without creating a local data channel', async () => {
    const events = makeEvents();
    await joinReceiver(events);

    const pc = lastPeerConnection();
    expect(pc.createDataChannel).not.toHaveBeenCalled();
    expect(lastChannel().open).toHaveBeenCalledWith('ABC123', 'receiver');
  });

  it('sends an offer when the receiver says hello', async () => {
    const events = makeEvents();
    await initializeSender(events);
    const pc = lastPeerConnection();

    signal({ type: 'hello', role: 'receiver' });

    await vi.waitFor(() => {
      expect(sentMessages()).toContainEqual({
        type: 'offer',
        sdp: { type: 'offer', sdp: 'offer-sdp' },
      });
    });
    expect(pc.createOffer).toHaveBeenCalledTimes(1);
    expect(pc.setLocalDescription).toHaveBeenCalledWith({
      type: 'offer',
      sdp: 'offer-sdp',
    });
  });

  it('sends only one offer when peer-present repeats', async () => {
    const events = makeEvents();
    await initializeSender(events);

    signal({ type: 'peer-present' });
    signal({ type: 'peer-present' });

    await vi.waitFor(() => {
      expect(lastPeerConnection().createOffer).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      sentMessages().filter((message) => message.type === 'offer'),
    ).toHaveLength(1);
  });

  it('answers an offer as receiver', async () => {
    const events = makeEvents();
    await joinReceiver(events);
    const pc = lastPeerConnection();

    signal({ type: 'offer', sdp: { type: 'offer', sdp: 'remote-offer' } });

    await vi.waitFor(() => {
      expect(sentMessages()).toContainEqual({
        type: 'answer',
        sdp: { type: 'answer', sdp: 'answer-sdp' },
      });
    });
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({
      type: 'offer',
      sdp: 'remote-offer',
    });
    expect(pc.setLocalDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'answer-sdp',
    });
  });

  it('applies an answer as sender', async () => {
    const events = makeEvents();
    await initializeSender(events);
    const pc = lastPeerConnection();

    signal({ type: 'answer', sdp: { type: 'answer', sdp: 'remote-answer' } });

    await vi.waitFor(() => {
      expect(pc.setRemoteDescription).toHaveBeenCalledWith({
        type: 'answer',
        sdp: 'remote-answer',
      });
    });
  });

  it('adds remote ICE candidates and warns on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const events = makeEvents();
    await initializeSender(events);
    const pc = lastPeerConnection();

    // A candidate can only be applied once the remote description is in
    // place — see the test below for what happens before that.
    await pc.setRemoteDescription({ type: 'answer', sdp: 'answer-sdp' });

    signal({ type: 'ice', candidate: { candidate: 'one' } });
    expect(pc.addIceCandidate).toHaveBeenCalledWith({ candidate: 'one' });

    pc.addIceCandidate.mockRejectedValueOnce(new Error('bad candidate'));
    signal({ type: 'ice', candidate: { candidate: 'two' } });

    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
  });

  it('holds a candidate that arrives before the remote description', async () => {
    const events = makeEvents();
    await initializeSender(events);
    const pc = lastPeerConnection();

    // The relay does not order the frames: a candidate can beat the SDP.
    // Applying it now would throw and the candidate would be lost.
    signal({ type: 'ice', candidate: { candidate: 'early' } });
    expect(pc.addIceCandidate).not.toHaveBeenCalled();

    // The description lands, and the held candidate goes with it.
    signal({ type: 'answer', sdp: { type: 'answer', sdp: 'answer-sdp' } });

    await vi.waitFor(() =>
      expect(pc.addIceCandidate).toHaveBeenCalledWith({ candidate: 'early' }),
    );
  });

  it('reports peer departure as a disconnect', async () => {
    const events = makeEvents();
    await initializeSender(events);

    signal({ type: 'peer-left' });

    expect(events.onDisconnected).toHaveBeenCalledTimes(1);
  });

  it('forwards local ICE candidates', async () => {
    const events = makeEvents();
    await initializeSender(events);
    const pc = lastPeerConnection();

    pc.onicecandidate?.({
      candidate: { toJSON: () => ({ candidate: 'local' }) },
    } as unknown as RTCPeerConnectionIceEvent);

    expect(sentMessages()).toContainEqual({
      type: 'ice',
      candidate: { candidate: 'local' },
    });
  });

  it('reports a failed ICE state as an error, and a closed one as a disconnect', async () => {
    const events = makeEvents();
    await initializeSender(events);
    const pc = lastPeerConnection();

    pc.iceConnectionState = 'failed';
    pc.oniceconnectionstatechange?.();
    expect(events.onError).toHaveBeenCalledWith('ICE negotiation failed');
    expect(events.onDisconnected).not.toHaveBeenCalled();

    // `disconnected` is transient — ICE can recover from it, and ending the
    // session on a blip would throw away a transfer that is still fine.
    // `failed` is the state that means the connection is gone for good.
    pc.iceConnectionState = 'disconnected';
    pc.oniceconnectionstatechange?.();
    expect(events.onDisconnected).not.toHaveBeenCalled();

    pc.iceConnectionState = 'closed';
    pc.oniceconnectionstatechange?.();
    expect(events.onDisconnected).toHaveBeenCalledTimes(1);
  });

  it('does not report a disconnect for a session closed on purpose', async () => {
    const events = makeEvents();
    const { manager } = await initializeSender(events);

    // Ending a session closes the data channel and the WebSocket, and both
    // report back when they close. That is not a failure.
    manager.close();
    lastPeerConnection().oniceconnectionstatechange?.();

    expect(events.onDisconnected).not.toHaveBeenCalled();
  });

  it('reports that nobody joined when the room expires first', async () => {
    const events = makeEvents();
    await initializeSender(events);

    signal({ type: 'room-expired' });

    // The code ran out before the other device turned up. Blaming the
    // other device for that would be wrong.
    expect(events.onRoomEnded).toHaveBeenCalledWith('no-peer');
    expect(events.onDisconnected).not.toHaveBeenCalled();
  });

  it('reports that the session ended when a peer had been there', async () => {
    const events = makeEvents();
    await initializeSender(events);

    signal({ type: 'peer-present' });
    signal({ type: 'room-expired' });

    expect(events.onRoomEnded).toHaveBeenCalledWith('ended');
  });

  it('does not report a disconnect when the room expires', async () => {
    const events = makeEvents();
    await initializeSender(events);

    signal({ type: 'room-expired' });
    // The socket closes right after the notice — that close is the room
    // ending, not the other device walking away.
    lastChannel().callbacks.onClose();

    expect(events.onDisconnected).not.toHaveBeenCalled();
    expect(events.onRoomEnded).toHaveBeenCalledTimes(1);
  });

  it('does not report a disconnect when the socket closes after a deliberate close', async () => {
    const events = makeEvents();
    const { manager } = await initializeSender(events);

    // "End session" closes the socket, and the browser reports that back
    // a moment later. That is the user finishing, not the peer leaving.
    manager.close();
    lastChannel().callbacks.onClose();

    expect(events.onDisconnected).not.toHaveBeenCalled();
  });

  it('attaches the receiver data channel and reports connection open', async () => {
    const events = makeEvents();
    await joinReceiver(events);
    const dc = new FakeDataChannel();

    lastPeerConnection().ondatachannel?.({
      channel: dc.asRTCDataChannel(),
    } as RTCDataChannelEvent);
    dc.open();

    expect(events.onConnected).toHaveBeenCalledTimes(1);
    expect(events.onReceiverConnected).not.toHaveBeenCalled();
  });

  it('reports sender data channel open as receiver-ready', async () => {
    const events = makeEvents();
    await initializeSender(events);
    const dc = lastPeerConnection().lastChannel!;

    dc.open();

    expect(events.onReceiverConnected).toHaveBeenCalledTimes(1);
    expect(events.onConnected).not.toHaveBeenCalled();
  });

  it('reports data channel close and errors', async () => {
    const events = makeEvents();
    await initializeSender(events);
    const dc = lastPeerConnection().lastChannel!;

    dc.fail();
    expect(events.onError).toHaveBeenCalledWith('Data channel error');

    dc.close();
    expect(events.onDisconnected).toHaveBeenCalledTimes(1);
  });

  it('delegates the sender API to the transfer session', async () => {
    const events = makeEvents();
    const { manager } = await initializeSender(events);
    const dc = lastPeerConnection().lastChannel!;
    dc.sent = [];
    const file = new File(['abc'], 'a.txt', { type: 'text/plain' });

    manager.sendMeta([file]);
    manager.sendText('hello');
    manager.requestFile(2);

    const messages = dc.sent.map((entry) => JSON.parse(entry as string) as Record<string, unknown>);
    expect(messages[0]).toMatchObject({ kind: 'file-descriptors' });
    expect(messages[1]).toEqual({ kind: 'text', text: 'hello' });
    expect(messages[2]).toEqual({ kind: 'file-request', index: 2 });
  });

  it('closes the data channel, peer connection, and signaling on teardown', async () => {
    const events = makeEvents();
    const { manager } = await initializeSender(events);
    const pc = lastPeerConnection();
    const dc = pc.lastChannel!;
    const closeSpy = vi.spyOn(dc, 'close');

    manager.close();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(pc.close).toHaveBeenCalledTimes(1);
    expect(lastChannel().close).toHaveBeenCalledTimes(1);
  });
});

describe('p2p/webrtc — hostile signaling input', () => {
  beforeEach(() => {
    hoisted.channels.length = 0;
    hoisted.fetchIceServers.mockReset();
    hoisted.mintRoom.mockReset();
    installPeerConnection();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('surfaces an error instead of crashing when the offer cannot be applied', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const events = makeEvents();
    await joinReceiver(events);
    const pc = lastPeerConnection();
    pc.setRemoteDescription.mockRejectedValueOnce(new Error('bad sdp'));

    signal({ type: 'offer', sdp: { type: 'offer', sdp: 'remote-offer' } });

    await vi.waitFor(() => {
      expect(events.onError).toHaveBeenCalledWith('Could not establish the connection');
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('surfaces an error when the answer cannot be applied', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const events = makeEvents();
    await initializeSender(events);
    const pc = lastPeerConnection();
    pc.setRemoteDescription.mockRejectedValueOnce(new Error('bad sdp'));

    signal({ type: 'answer', sdp: { type: 'answer', sdp: 'remote-answer' } });

    await vi.waitFor(() => {
      expect(events.onError).toHaveBeenCalledWith('Could not establish the connection');
    });
    expect(errorSpy).toHaveBeenCalled();
  });
});
