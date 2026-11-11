import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { getRoute } from '@/lib/router';
import { createFile, resetRoute } from '../shared/fixtures';

// The test setup stubs rAF (see src/test/setup.ts), which leaves
// AnimatePresence's "wait" exits stuck mid-animation. The app suite asserts
// routed views, not animation choreography, so render children immediately.
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

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
  joinRejects: false,
}));

vi.mock('@/lib/webrtc', () => {
  class P2PManager {
    events: FakeManager['events'];
    initialize = vi.fn(async () => 'ABC123');
    join = vi.fn(async () => {
      if (hoisted.joinRejects) throw new Error('join failed');
    });
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

function lastManager(): FakeManager {
  const manager = hoisted.managers.at(-1);
  if (!manager) throw new Error('P2PManager was not constructed');
  return manager;
}

async function renderAppAt(path: string) {
  resetRoute(path);
  const user = userEvent.setup();
  const rendered = render(<App />);
  return { ...rendered, user };
}

describe('app/app — routing shell', () => {
  beforeEach(() => {
    hoisted.managers.length = 0;
    hoisted.joinRejects = false;
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:test'),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('serves the landing page at /', async () => {
    await renderAppAt('/');
    expect(
      screen.getByRole('heading', { level: 1, name: /send files between your devices/i }),
    ).toBeInTheDocument();
  });

  it('falls back to the landing page for unknown routes', async () => {
    await renderAppAt('/not-a-route');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Send files between your devices',
    );
  });

  it('lazy-loads the app shell at /app', async () => {
    await renderAppAt('/app');
    expect(await screen.findByRole('button', { name: 'Receive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'files' })).toBeInTheDocument();
    expect(screen.getByLabelText('Text to share')).toBeInTheDocument();
  });

  it('switches between text and file input modes', async () => {
    const { user } = await renderAppAt('/app');
    await screen.findByLabelText('Text to share');

    await user.click(screen.getByRole('button', { name: 'files' }));
    expect(screen.getByRole('button', { name: /drop files to share/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Text to share')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'text' }));
    expect(screen.getByLabelText('Text to share')).toBeInTheDocument();
  });
});

describe('app/app — end-to-end text sharing flow', () => {
  beforeEach(() => {
    hoisted.managers.length = 0;
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:test'),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mints a room, shows the code, and sends text when the receiver connects', async () => {
    const { user } = await renderAppAt('/app');
    await screen.findByLabelText('Text to share');

    await user.type(screen.getByLabelText('Text to share'), 'hello peer');
    await user.click(screen.getByRole('button', { name: 'Share Aura' }));

    expect(await screen.findByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText(/waiting for cosmic alignment/i)).toBeInTheDocument();
    expect(lastManager().initialize).toHaveBeenCalledTimes(1);

    act(() => lastManager().events.onReceiverConnected?.());

    expect(screen.getByText(/receiver connected/i)).toBeInTheDocument();
    expect(lastManager().sendText).toHaveBeenCalledWith('hello peer');
  });

  it('receives descriptors, downloads a selected file, and shows received text', async () => {
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const { user } = await renderAppAt('/app');
    await screen.findByRole('button', { name: 'Receive' });

    await user.click(screen.getByRole('button', { name: 'Receive' }));
    const input = screen.getByLabelText('6-character cosmic code');
    await user.type(input, 'abc123');
    expect(input).toHaveValue('ABC123');

    await user.click(screen.getByRole('button', { name: 'Establish Link' }));
    expect(screen.getByText('Establishing Link')).toBeInTheDocument();
    expect(lastManager().join).toHaveBeenCalledWith('ABC123');

    act(() =>
      lastManager().events.onFileDescriptorsReceived?.([
        { name: 'photo.png', size: 1024, type: 'image/png' },
        { name: 'notes.txt', size: 512, type: 'text/plain' },
      ]),
    );

    expect(screen.getByText('2 files ready')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select photo.png' }));
    await user.click(screen.getByRole('button', { name: 'Download (1)' }));
    expect(lastManager().requestFile).toHaveBeenCalledWith(0);

    act(() =>
      lastManager().events.onFileComplete?.(
        0,
        createFile('photo.png', 1024, 'image/png'),
      ),
    );
    expect(anchorClick).toHaveBeenCalledTimes(1);

    act(() => lastManager().events.onTextReceived?.('the message'));

    expect(screen.getByText('"the message"')).toBeInTheDocument();
    expect(screen.getByText('Harmony Achieved')).toBeInTheDocument();
  });

  it('surfaces a join failure and recovers from the error view', async () => {
    hoisted.joinRejects = true;
    const { user } = await renderAppAt('/app');
    await screen.findByRole('button', { name: 'Receive' });

    await user.click(screen.getByRole('button', { name: 'Receive' }));
    await user.type(screen.getByLabelText('6-character cosmic code'), 'ABC123');
    await user.click(screen.getByRole('button', { name: 'Establish Link' }));

    expect(await screen.findByText('Cosmic Link Broken')).toBeInTheDocument();
    expect(screen.getByText('Cosmos Disrupted')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try Re-Alignment' }));
    expect(screen.getByRole('button', { name: 'files' })).toBeInTheDocument();
  });

  it('returns to the idle share screen from End Session', async () => {
    const { user } = await renderAppAt('/app');
    await screen.findByLabelText('Text to share');

    await user.type(screen.getByLabelText('Text to share'), 'bye');
    await user.click(screen.getByRole('button', { name: 'Share Aura' }));
    await screen.findByText('ABC123');

    await user.click(screen.getByRole('button', { name: 'End Session' }));
    expect(screen.getByLabelText('Text to share')).toBeInTheDocument();
    expect(getRoute()).toBe('/app');
  });
});
