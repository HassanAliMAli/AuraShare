import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuraDropzone } from '@/components/AuraDropzone';
import { AuraTextarea } from '@/components/AuraTextarea';
import { ShareInputView } from '@/components/features/ShareInputView';
import { ShareModeTabs } from '@/components/features/ShareModeTabs';
import { createFile, renderWithStore } from '../shared/fixtures';

describe('features/share-input — AuraDropzone', () => {
  it('passes valid files from the hidden input to the caller', async () => {
    const user = userEvent.setup();
    const onFileDrop = vi.fn();
    const { container } = renderWithStore(<AuraDropzone onFileDrop={onFileDrop} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createFile('photo.png', 64, 'image/png');

    await user.upload(input, file);

    expect(onFileDrop).toHaveBeenCalledWith([file]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects an empty file and reports it without calling the caller', async () => {
    const user = userEvent.setup();
    const onFileDrop = vi.fn();
    const { container } = renderWithStore(<AuraDropzone onFileDrop={onFileDrop} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, createFile('empty.txt', 0));

    expect(onFileDrop).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('empty.txt: File is empty');
  });

  it('accepts the valid files from a mixed selection and reports the rest', async () => {
    const user = userEvent.setup();
    const onFileDrop = vi.fn();
    const { container } = renderWithStore(<AuraDropzone onFileDrop={onFileDrop} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const good = createFile('good.txt', 10);
    const bad = createFile('font.woff2', 10, 'font/woff2');

    await user.upload(input, [good, bad]);

    expect(onFileDrop).toHaveBeenCalledWith([good]);
    expect(screen.getByRole('alert')).toHaveTextContent('font.woff2');
  });

  it('accepts a drag-and-drop selection', () => {
    const onFileDrop = vi.fn();
    renderWithStore(<AuraDropzone onFileDrop={onFileDrop} />);
    const dropzone = screen.getByRole('button', { name: /drop files to share/i });
    const file = createFile('dropped.txt', 32);

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(onFileDrop).toHaveBeenCalledWith([file]);
  });

  it('ignores an empty drop', () => {
    const onFileDrop = vi.fn();
    renderWithStore(<AuraDropzone onFileDrop={onFileDrop} />);
    const dropzone = screen.getByRole('button', { name: /drop files to share/i });

    fireEvent.drop(dropzone, { dataTransfer: { files: [] } });

    expect(onFileDrop).not.toHaveBeenCalled();
  });

  it('opens the file picker from the keyboard', () => {
    renderWithStore(<AuraDropzone onFileDrop={vi.fn()} />);
    const dropzone = screen.getByRole('button', { name: /drop files to share/i });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);

    fireEvent.keyDown(dropzone, { key: 'Enter' });

    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('features/share-input — AuraTextarea', () => {
  it('disables sharing for empty or whitespace-only text', async () => {
    const user = userEvent.setup();
    const onTextShare = vi.fn();
    renderWithStore(<AuraTextarea onTextShare={onTextShare} />);
    const textarea = screen.getByLabelText('Text to share');
    const button = screen.getByRole('button', { name: 'Send text' });

    expect(button).toBeDisabled();
    await user.type(textarea, '   ');
    expect(button).toBeDisabled();
    expect(screen.getByText('3 characters')).toBeInTheDocument();
  });

  it('shares the entered text and updates the character counter', async () => {
    const user = userEvent.setup();
    const onTextShare = vi.fn();
    renderWithStore(<AuraTextarea onTextShare={onTextShare} />);

    await user.type(screen.getByLabelText('Text to share'), 'hello');
    expect(screen.getByText('5 characters')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send text' }));
    expect(onTextShare).toHaveBeenCalledWith('hello');
  });
});

describe('features/share-input — mode surfaces', () => {
  it('renders the dropzone in files mode', () => {
    renderWithStore(<ShareInputView />, { state: { shareMode: 'files' } });
    expect(screen.getByRole('button', { name: /drop files to share/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Text to share')).not.toBeInTheDocument();
  });

  it('renders the textarea in text mode', () => {
    renderWithStore(<ShareInputView />, { state: { shareMode: 'text' } });
    expect(screen.getByLabelText('Text to share')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /drop files to share/i })).not.toBeInTheDocument();
  });

  it('reports the selected mode to the store', async () => {
    const user = userEvent.setup();
    const setShareMode = vi.fn();
    renderWithStore(<ShareModeTabs />, { actions: { setShareMode } });

    await user.click(screen.getByRole('tab', { name: 'files' }));
    await user.click(screen.getByRole('tab', { name: 'text' }));

    expect(setShareMode).toHaveBeenNthCalledWith(1, 'files');
    expect(setShareMode).toHaveBeenNthCalledWith(2, 'text');
  });

  it('exposes the active mode to assistive technology', () => {
    renderWithStore(<ShareModeTabs />, { state: { shareMode: 'files' } });

    expect(screen.getByRole('tab', { name: 'files' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'text' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
