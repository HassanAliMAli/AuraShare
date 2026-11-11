import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoaderView } from '@/components/features/LoaderView';
import { ReceiveCodeForm, SharingView } from '@/components/features/SharingView';
import { AppContext, type AppState } from '@/stores/appStore';
import { makeActions, makeState, renderWithStore } from '../shared/fixtures';

function ControlledReceiveForm({
  initial = {},
  join = vi.fn(),
  reset = vi.fn(),
}: {
  initial?: Partial<AppState>;
  join?: (code: string) => void;
  reset?: () => void;
}) {
  const [state, setState] = useState(() => makeState(initial));
  const actions = makeActions({
    setJoinCode: (code) => setState((current) => ({ ...current, joinCode: code })),
    join,
    reset,
  });

  return (
    <AppContext value={{ state, actions }}>
      <ReceiveCodeForm />
    </AppContext>
  );
}

describe('features/share-flow — ReceiveCodeForm', () => {
  it('uppercases input, enables at six characters, and submits the code', async () => {
    const user = userEvent.setup();
    const join = vi.fn();
    render(<ControlledReceiveForm join={join} />);

    const input = screen.getByLabelText('6-digit cosmic code');
    const submit = screen.getByRole('button', { name: 'Establish Link' });
    expect(submit).toBeDisabled();

    await user.type(input, 'abc123');
    expect(input).toHaveValue('ABC123');
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(join).toHaveBeenCalledWith('ABC123');
  });

  it('submits with the Enter key', async () => {
    const user = userEvent.setup();
    const join = vi.fn();
    render(<ControlledReceiveForm join={join} initial={{ joinCode: 'ZXCV12' }} />);

    await user.type(screen.getByLabelText('6-digit cosmic code'), '{enter}');
    expect(join).toHaveBeenCalledWith('ZXCV12');
  });

  it('keeps submission disabled for five characters', () => {
    render(<ControlledReceiveForm initial={{ joinCode: 'ABCDE' }} />);
    expect(screen.getByRole('button', { name: 'Establish Link' })).toBeDisabled();
  });

  it('cancels the connection', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<ControlledReceiveForm initial={{ joinCode: 'ABC123' }} reset={reset} />);

    await user.click(screen.getByRole('button', { name: 'Cancel Connection' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('features/share-flow — SharingView', () => {
  it('shows the transmission code and waiting state', () => {
    renderWithStore(<SharingView />, {
      state: { roomId: 'ABC123', receiverReady: false },
    });

    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText(/waiting for cosmic alignment/i)).toBeInTheDocument();
    expect(screen.queryByText(/receiver connected/i)).not.toBeInTheDocument();
  });

  it('shows the connected state and sent files with acknowledgement', () => {
    const { container } = renderWithStore(<SharingView />, {
      state: {
        roomId: 'ABC123',
        receiverReady: true,
        sentFiles: [
          { name: 'done.txt', size: 10, type: 'text/plain' },
          { name: 'pending.txt', size: 20, type: 'text/plain' },
        ],
        acknowledgedFiles: new Set([0]),
      },
    });

    expect(screen.getByText(/receiver connected/i)).toBeInTheDocument();
    expect(screen.getByText('done.txt')).toBeInTheDocument();
    expect(screen.getByText('pending.txt')).toBeInTheDocument();

    const rows = container.querySelectorAll('.space-y-2 > div');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('.text-transfer')).not.toBeNull();
    expect(rows[1]?.querySelector('.text-transfer')).toBeNull();
  });

  it('ends the session on request', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    renderWithStore(<SharingView />, {
      state: { roomId: 'ABC123' },
      actions: { reset },
    });

    await user.click(screen.getByRole('button', { name: 'End Session' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('features/share-flow — LoaderView', () => {
  it('announces the label and optional hint politely', () => {
    renderWithStore(<LoaderView label="Establishing Link" hint="Reaching across the cosmos" />);

    expect(screen.getByText('Establishing Link')).toBeInTheDocument();
    expect(screen.getByText('Reaching across the cosmos')).toBeInTheDocument();
    expect(screen.getByText('Establishing Link').closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('renders without a hint', () => {
    renderWithStore(<LoaderView label="Working" />);
    expect(screen.getByText('Working')).toBeInTheDocument();
  });
});
