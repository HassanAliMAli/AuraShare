import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReceiverFileList } from '@/components/features/ReceiverFileList';
import { ErrorView, SuccessView } from '@/components/features/SuccessView';
import { renderWithStore } from '../shared/fixtures';

const FILES = [
  { name: 'photo.png', size: 1024, type: 'image/png' },
  { name: 'notes.txt', size: 512, type: 'text/plain' },
];

describe('features/receiver — ReceiverFileList', () => {
  it('shows the count and total size', () => {
    renderWithStore(<ReceiverFileList />, {
      state: { receivedFiles: FILES, status: 'connected' },
    });

    expect(screen.getByText('2 files ready')).toBeInTheDocument();
    expect(screen.getByText('1.5 KB total')).toBeInTheDocument();
    expect(screen.getByText('photo.png')).toBeInTheDocument();
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
  });

  it('handles a single file and a zero-file list', () => {
    const { unmount } = renderWithStore(<ReceiverFileList />, {
      state: { receivedFiles: [FILES[0]!], status: 'connected' },
    });
    expect(screen.getByText('1 file ready')).toBeInTheDocument();
    unmount();

    renderWithStore(<ReceiverFileList />, {
      state: { receivedFiles: [], status: 'connected' },
    });
    expect(screen.getByText('0 files ready')).toBeInTheDocument();
    expect(screen.getByText('0 B total')).toBeInTheDocument();
  });

  it('toggles selection and starts the download batch', async () => {
    const user = userEvent.setup();
    const toggleFileSelected = vi.fn();
    const downloadSelected = vi.fn();
    renderWithStore(<ReceiverFileList />, {
      state: { receivedFiles: FILES, selectedFiles: new Set([0]), status: 'connected' },
      actions: { toggleFileSelected, downloadSelected },
    });

    const first = screen.getByRole('checkbox', { name: 'Select photo.png' });
    expect(first).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select notes.txt' })).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Select notes.txt' }));
    expect(toggleFileSelected).toHaveBeenCalledWith(1, true);

    await user.click(screen.getByRole('button', { name: 'Download (1)' }));
    expect(downloadSelected).toHaveBeenCalledTimes(1);
  });

  it('disables downloaded files and hides their checkboxes from selection', async () => {
    const user = userEvent.setup();
    const toggleFileSelected = vi.fn();
    renderWithStore(<ReceiverFileList />, {
      state: {
        receivedFiles: FILES,
        downloadedFiles: new Set([0]),
        status: 'connected',
      },
      actions: { toggleFileSelected },
    });

    const first = screen.getByRole('checkbox', { name: 'Select photo.png' });
    expect(first).toBeDisabled();
    expect(within(first.closest('div') as HTMLElement).getByText('photo.png')).toBeInTheDocument();

    await user.click(first);
    expect(toggleFileSelected).not.toHaveBeenCalled();
  });

  it('shows per-file progress with an accessible progressbar', () => {
    renderWithStore(<ReceiverFileList />, {
      state: {
        receivedFiles: FILES,
        downloadingFileIndex: 1,
        transferProgress: 42,
        status: 'connected',
      },
    });

    const progressbar = screen.getByRole('progressbar', { name: 'Downloading notes.txt' });
    expect(progressbar).toHaveAttribute('aria-valuenow', '42');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });

  it('ends the session', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    renderWithStore(<ReceiverFileList />, {
      state: { receivedFiles: FILES, status: 'connected' },
      actions: { reset },
    });

    await user.click(screen.getByRole('button', { name: 'End session' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('features/receiver — SuccessView', () => {
  it('shows received text and copies it', async () => {
    const user = userEvent.setup();
    const copyText = vi.fn();
    renderWithStore(<SuccessView />, {
      state: { receivedText: 'hello from the other side', status: 'success' },
      actions: { copyText },
    });

    expect(screen.getByText('hello from the other side')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy received text to clipboard' }));
    expect(copyText).toHaveBeenCalledWith('hello from the other side');
  });

  it('shows the generic success badge when no text was received', () => {
    renderWithStore(<SuccessView />, { state: { receivedText: null, status: 'success' } });

    expect(screen.getByText('Transfer complete')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy received text to clipboard' }),
    ).not.toBeInTheDocument();
  });

  it('starts a new cycle', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    renderWithStore(<SuccessView />, {
      state: { status: 'success' },
      actions: { reset },
    });

    await user.click(screen.getByRole('button', { name: 'Start another transfer' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('features/receiver — ErrorView', () => {
  it('shows the error message and retries', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    renderWithStore(<ErrorView />, {
      state: { errorMessage: 'The peer disconnected', status: 'error' },
      actions: { reset },
    });

    expect(screen.getByText('The peer disconnected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic message', () => {
    renderWithStore(<ErrorView />, {
      state: { errorMessage: null, status: 'error' },
    });
    expect(screen.getByText('Link failed')).toBeInTheDocument();
  });
});
