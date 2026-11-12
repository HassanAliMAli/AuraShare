import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/stores/AppProvider';
import { useAppStore } from '@/stores/appStore';
import { createFile } from '../shared/fixtures';

type FakeManager = {
  events: {
    onConnected: () => void;
    onDisconnected: () => void;
    onReceiverConnected?: () => void;
    onError: (message: string) => void;
    onProgress: (progress: number) => void;
    onTransferComplete: () => void;
    onFileComplete?: (index: number, file: File) => void;
    onFileAcknowledged?: (index: number) => void;
    onFileDescriptorsReceived?: (files: { name: string; size: number; type: string }[]) => void;
    onTextReceived?: (text: string) => void;
  };
  initialize: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  sendMeta: ReturnType<typeof vi.fn>;
  sendText: ReturnType<typeof vi.fn>;
  requestFile: ReturnType<typeof vi.fn>;
};

const hoisted = vi.hoisted(() => ({
  managers: [] as FakeManager[],
  initializeRejects: false,
}));

vi.mock('@/lib/webrtc', () => {
  class P2PManager {
    events: FakeManager['events'];
    initialize = vi.fn(async () => {
      if (hoisted.initializeRejects) throw new Error('offline');
      return 'ABC123';
    });
    join = vi.fn(async () => undefined);
    close = vi.fn();
    sendMeta = vi.fn();
    sendText = vi.fn();
    requestFile = vi.fn();

    constructor(events: FakeManager['events']) {
      this.events = events;
      hoisted.managers.push(this as unknown as FakeManager);
    }
  }

  return { P2PManager };
});

const SHARED_FILE = createFile('shared.txt', 12);

function Probe() {
  const { state, actions } = useAppStore();

  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="room">{state.roomId ?? 'none'}</span>
      <span data-testid="progress">{state.transferProgress}</span>
      <span data-testid="join-code">{state.joinCode}</span>
      <span data-testid="receiver-ready">{String(state.receiverReady)}</span>
      <span data-testid="sent-files">{state.sentFiles.map((file) => file.name).join(',')}</span>
      <span data-testid="received-files">
        {state.receivedFiles.map((file) => file.name).join(',')}
      </span>
      <span data-testid="downloaded">{[...state.downloadedFiles].join(',')}</span>
      <span data-testid="acknowledged">{[...state.acknowledgedFiles].join(',')}</span>
      <span data-testid="selected">{[...state.selectedFiles].join(',')}</span>
      <span data-testid="received-text">{state.receivedText ?? 'none'}</span>
      <span data-testid="error">{state.errorMessage ?? 'none'}</span>
      <span data-testid="join-code-error">{state.joinCodeError ?? 'none'}</span>

      <button type="button" onClick={() => actions.startShare([SHARED_FILE], 'hello peer')}>
        share
      </button>
      <button type="button" onClick={() => actions.startShare(undefined, 'text only')}>
        share text
      </button>
      <button type="button" onClick={() => actions.join('abc123')}>
        join
      </button>
      <button type="button" onClick={() => actions.join('bad')}>
        join invalid
      </button>
      <button type="button" onClick={actions.startReceive}>
        receive
      </button>
      <button type="button" onClick={actions.downloadSelected}>
        download
      </button>
      {state.receivedFiles.map((file, index) => (
        <input
          key={file.name}
          type="checkbox"
          aria-label={`select ${file.name}`}
          checked={state.selectedFiles.has(index)}
          onChange={(event) => actions.toggleFileSelected(index, event.target.checked)}
        />
      ))}
      <button type="button" onClick={() => actions.copyText('copied text')}>
        copy
      </button>
      <button type="button" onClick={actions.reset}>
        reset
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
}

function lastManager(): FakeManager {
  const manager = hoisted.managers.at(-1);
  if (!manager) throw new Error('P2PManager was not constructed');
  return manager;
}

describe('stores/AppProvider — lifecycle and actions', () => {
  beforeEach(() => {
    hoisted.managers.length = 0;
    hoisted.initializeRejects = false;
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:test'),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates a manager and mints a room when sharing files', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'share' }));

    expect(screen.getByTestId('status')).toHaveTextContent('sharing');
    expect(hoisted.managers).toHaveLength(1);
    expect(lastManager().initialize).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('ABC123')).toBeInTheDocument();
    expect(screen.getByTestId('room')).toHaveTextContent('ABC123');
  });

  it('forwards files and text to the peer once the receiver connects', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'share' }));
    await screen.findByText('ABC123');
    const manager = lastManager();

    act(() => manager.events.onReceiverConnected?.());

    expect(screen.getByTestId('receiver-ready')).toHaveTextContent('true');
    expect(screen.getByTestId('sent-files')).toHaveTextContent('shared.txt');
    expect(manager.sendMeta).toHaveBeenCalledWith([SHARED_FILE]);
    expect(manager.sendText).toHaveBeenCalledWith('hello peer');
  });

  it('forwards text-only shares without a file list', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'share text' }));
    await screen.findByText('ABC123');
    const manager = lastManager();

    act(() => manager.events.onReceiverConnected?.());

    expect(screen.getByTestId('sent-files')).toHaveTextContent('');
    expect(manager.sendMeta).toHaveBeenCalledWith([]);
    expect(manager.sendText).toHaveBeenCalledWith('text only');
  });

  it('tracks progress, acknowledgements, and errors from the manager', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'share' }));
    await screen.findByText('ABC123');
    const manager = lastManager();

    act(() => {
      manager.events.onProgress(37);
      manager.events.onFileAcknowledged?.(0);
      manager.events.onError('Signaling tunnel failed');
    });

    expect(screen.getByTestId('progress')).toHaveTextContent('37');
    expect(screen.getByTestId('acknowledged')).toHaveTextContent('0');
    expect(screen.getByTestId('error')).toHaveTextContent('Signaling tunnel failed');
    expect(screen.getByTestId('status')).toHaveTextContent('error');
  });

  it('surfaces a friendly error when room minting fails', async () => {
    renderProvider();
    hoisted.initializeRejects = true;
    fireEvent.click(screen.getByRole('button', { name: 'share' }));

    expect(await screen.findByText('Could not open a room')).toBeInTheDocument();
    expect(screen.getByTestId('status')).toHaveTextContent('error');
  });

  it('rejects malformed join codes without creating a manager', () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'join invalid' }));

    expect(hoisted.managers).toHaveLength(0);
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });

  it('reports a malformed join code instead of swallowing it', () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'join invalid' }));

    expect(screen.getByTestId('join-code-error')).toHaveTextContent(
      'Codes use 0-9 and A-Z — no I, L, O or U.',
    );
    expect(hoisted.managers).toHaveLength(0);
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });

  it('clears the code error once a valid code is joined', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'join invalid' }));
    expect(screen.getByTestId('join-code-error')).not.toHaveTextContent('none');

    fireEvent.click(screen.getByRole('button', { name: 'join' }));

    expect(screen.getByTestId('join-code-error')).toHaveTextContent('none');
    expect(lastManager().join).toHaveBeenCalledWith('ABC123');
  });

  it('normalizes a valid join code and receives descriptors', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'join' }));

    expect(screen.getByTestId('status')).toHaveTextContent('connecting');
    expect(hoisted.managers).toHaveLength(1);
    expect(lastManager().join).toHaveBeenCalledWith('ABC123');

    act(() => {
      lastManager().events.onFileDescriptorsReceived?.([
        { name: 'one.txt', size: 10, type: 'text/plain' },
        { name: 'two.txt', size: 20, type: 'text/plain' },
      ]);
    });

    expect(screen.getByTestId('status')).toHaveTextContent('connected');
    expect(screen.getByTestId('received-files')).toHaveTextContent('one.txt,two.txt');
  });

  it('requests the selected file and auto-saves completed files', async () => {
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'join' }));
    act(() => {
      lastManager().events.onFileDescriptorsReceived?.([
        { name: 'report..pdf', size: 10, type: 'application/pdf' },
      ]);
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'select report..pdf' }));
    expect(screen.getByTestId('selected')).toHaveTextContent('0');

    fireEvent.click(screen.getByRole('button', { name: 'download' }));
    expect(lastManager().requestFile).toHaveBeenCalledWith(0);

    act(() => {
      lastManager().events.onFileComplete?.(
        0,
        createFile('report..pdf', 10, 'application/pdf'),
      );
    });

    expect(screen.getByTestId('downloaded')).toHaveTextContent('0');
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });

  it('receives text and moves to success', () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'join' }));
    act(() => lastManager().events.onTextReceived?.('the message'));

    expect(screen.getByTestId('received-text')).toHaveTextContent('the message');
    expect(screen.getByTestId('status')).toHaveTextContent('success');
  });

  it('writes copied text to the clipboard', () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'copy' }));
    expect(writeText).toHaveBeenCalledWith('copied text');
  });

  it('times out a join after 30 seconds', () => {
    vi.useFakeTimers();
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'join' }));
    expect(screen.getByTestId('status')).toHaveTextContent('connecting');

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByTestId('status')).toHaveTextContent('error');
    expect(screen.getByTestId('error')).toHaveTextContent(
      'Room not found or peer never connected',
    );
  });

  it('cancels the pending connect timeout when the session is reset', () => {
    vi.useFakeTimers();
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'join' }));
    fireEvent.click(screen.getByRole('button', { name: 'reset' }));
    expect(screen.getByTestId('status')).toHaveTextContent('idle');

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });

  it('closes the manager and clears the error on reset', async () => {
    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'share' }));
    await screen.findByText('ABC123');
    const manager = lastManager();
    act(() => manager.events.onError('Boom'));

    fireEvent.click(screen.getByRole('button', { name: 'reset' }));

    expect(manager.close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(screen.getByTestId('error')).toHaveTextContent('none');
  });

  it('closes the manager on unmount', () => {
    const { unmount } = renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'share' }));
    const manager = lastManager();

    unmount();
    expect(manager.close).toHaveBeenCalledTimes(1);
  });
});
