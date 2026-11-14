import { describe, expect, it } from 'vitest';
import {
  appReducer,
  initialState,
  type AppAction,
  type AppState,
} from '@/stores/appStore';
import { makeState } from '../shared/fixtures';

function reduce(state: AppState, ...actions: AppAction[]): AppState {
  return actions.reduce(appReducer, state);
}

describe('stores/appStore — reducer', () => {
  it('returns the initial state for the initial action', () => {
    expect(initialState.status).toBe('idle');
    expect(initialState.shareMode).toBe('text');
    expect(initialState.receivedFiles).toEqual([]);
    expect(initialState.downloadQueue).toEqual([]);
  });

  it('tracks status, progress, code, room, and share mode', () => {
    const state = reduce(
      makeState(),
      { type: 'SET_STATUS', status: 'connecting' },
      { type: 'SET_PROGRESS', progress: 42 },
      { type: 'SET_JOIN_CODE', code: 'ABC123' },
      { type: 'SET_ROOM', roomId: 'XYZ789' },
      { type: 'SET_SHARE_MODE', mode: 'files' },
    );

    expect(state.status).toBe('connecting');
    expect(state.transferProgress).toBe(42);
    expect(state.joinCode).toBe('ABC123');
    expect(state.roomId).toBe('XYZ789');
    expect(state.shareMode).toBe('files');
  });

  it('enters receive mode and returns to idle', () => {
    const receiving = reduce(makeState({ status: 'error' }), { type: 'START_RECEIVE' });
    expect(receiving.isReceiving).toBe(true);
    expect(receiving.status).toBe('idle');

    const cancelled = appReducer(receiving, { type: 'RESET' });
    expect(cancelled.isReceiving).toBe(false);
  });

  it('marks the receiver ready and stores sent descriptors', () => {
    const files = [{ name: 'a.txt', size: 1, type: 'text/plain' }];
    const state = reduce(
      makeState(),
      { type: 'SET_RECEIVER_READY' },
      { type: 'SET_SENT_FILES', files },
    );
    expect(state.receiverReady).toBe(true);
    expect(state.sentFiles).toEqual(files);
  });

  it('stores received descriptors and moves to connected', () => {
    const files = [{ name: 'a.txt', size: 10, type: 'text/plain' }];
    const state = appReducer(makeState(), { type: 'RECEIVE_DESCRIPTORS', files });
    expect(state.receivedFiles).toEqual(files);
    expect(state.status).toBe('connected');
  });

  it('toggles selection immutably', () => {
    const before = makeState({ selectedFiles: new Set([1]) });
    const added = appReducer(before, { type: 'TOGGLE_SELECT', index: 2, selected: true });
    const removed = appReducer(added, { type: 'TOGGLE_SELECT', index: 1, selected: false });

    expect([...added.selectedFiles]).toEqual([1, 2]);
    expect([...removed.selectedFiles]).toEqual([2]);
    expect([...before.selectedFiles]).toEqual([1]);
  });

  it('starts a download batch from the first index and resets progress', () => {
    const state = appReducer(
      makeState({ downloadedFiles: new Set([9]), transferProgress: 70 }),
      { type: 'DOWNLOAD_START', indices: [2, 4, 6] },
    );

    expect(state.downloadQueue).toEqual([2, 4, 6]);
    expect(state.downloadingFileIndex).toBe(2);
    expect([...state.downloadedFiles]).toEqual([9]);
    expect(state.transferProgress).toBe(0);
  });

  it('handles an empty download batch', () => {
    const state = appReducer(makeState(), { type: 'DOWNLOAD_START', indices: [] });
    expect(state.downloadingFileIndex).toBeNull();
    expect(state.downloadQueue).toEqual([]);
  });

  it('advances the queue as files complete and clears progress at batch end', () => {
    const started = appReducer(makeState(), { type: 'DOWNLOAD_START', indices: [0, 1] });

    const first = appReducer(started, { type: 'FILE_COMPLETE', index: 0 });
    expect([...first.downloadedFiles]).toEqual([0]);
    expect(first.downloadQueue).toEqual([1]);
    expect(first.downloadingFileIndex).toBe(1);
    expect(first.transferProgress).toBe(0);

    const last = appReducer(first, { type: 'FILE_COMPLETE', index: 1 });
    expect([...last.downloadedFiles]).toEqual([0, 1]);
    expect(last.downloadQueue).toEqual([]);
    expect(last.downloadingFileIndex).toBeNull();
    expect(last.transferProgress).toBe(0);
  });

  it('tracks acknowledgements', () => {
    const state = appReducer(makeState(), { type: 'FILE_ACKNOWLEDGED', index: 3 });
    expect([...state.acknowledgedFiles]).toEqual([3]);
  });

  it('stores received text and moves to success', () => {
    const state = appReducer(makeState(), { type: 'RECEIVE_TEXT', text: 'hello' });
    expect(state.receivedText).toBe('hello');
    expect(state.status).toBe('success');
  });

  it('stores errors and moves to error', () => {
    const state = appReducer(makeState(), { type: 'SET_ERROR', message: 'Boom' });
    expect(state.errorMessage).toBe('Boom');
    expect(state.status).toBe('error');
  });

  it('reports a rejected code inline without leaving the idle state', () => {
    const state = appReducer(makeState(), {
      type: 'SET_JOIN_CODE_ERROR',
      message: 'Codes use 0-9 and A-Z — no I, L, O or U.',
    });

    expect(state.joinCodeError).toBe('Codes use 0-9 and A-Z — no I, L, O or U.');
    expect(state.status).toBe('idle');
  });

  it('clears a stale code error as soon as the user types again', () => {
    const rejected = appReducer(makeState({ joinCodeError: 'bad code' }), {
      type: 'SET_JOIN_CODE_ERROR',
      message: 'bad code',
    });

    const retyped = appReducer(rejected, { type: 'SET_JOIN_CODE', code: 'AB12CD' });
    expect(retyped.joinCodeError).toBeNull();
    expect(retyped.joinCode).toBe('AB12CD');
  });

  it('clears the code error when receive mode is re-entered', () => {
    const rejected = appReducer(makeState({ joinCodeError: 'bad code' }), {
      type: 'SET_JOIN_CODE_ERROR',
      message: 'bad code',
    });

    expect(appReducer(rejected, { type: 'START_RECEIVE' }).joinCodeError).toBeNull();
  });

  it('resets every slice, including sets, to initial values', () => {
    const dirty = makeState({
      status: 'error',
      transferProgress: 80,
      joinCode: 'ABC123',
      isReceiving: true,
      shareMode: 'files',
      receivedText: 'x',
      errorMessage: 'x',
      roomId: 'ROOM',
      receivedFiles: [{ name: 'a', size: 1, type: 'text/plain' }],
      downloadedFiles: new Set([0]),
      selectedFiles: new Set([0]),
      acknowledgedFiles: new Set([0]),
      sentFiles: [{ name: 'b', size: 2, type: 'text/plain' }],
      receiverReady: true,
    });

    const state = appReducer(dirty, { type: 'RESET' });

    expect(state).toEqual(initialState);
    expect(state).not.toBe(initialState);
    expect(state.downloadedFiles).toBe(initialState.downloadedFiles);
  });

  it('returns the same object for an unknown action', () => {
    const state = makeState();
    expect(appReducer(state, { type: 'UNKNOWN' } as unknown as AppAction)).toBe(state);
  });

  it('stores and clears the relay warning', () => {
    const warned = appReducer(makeState(), { type: 'CONNECTION_WARNING', message: 'Relay unavailable' });
    expect(warned.connectionWarning).toBe('Relay unavailable');

    const cleared = appReducer(warned, { type: 'CONNECTION_WARNING', message: null });
    expect(cleared.connectionWarning).toBeNull();
  });

  it('tracks text acknowledgement and retries', () => {
    const failed = makeState({ transferError: 'boom' });
    const acknowledged = appReducer(failed, { type: 'TEXT_ACKNOWLEDGED' });

    expect(acknowledged.textAcknowledged).toBe(true);
    expect(acknowledged.transferError).toBeNull();

    const retried = appReducer(acknowledged, { type: 'TEXT_RETRY' });
    expect(retried.textAcknowledged).toBe(false);
    expect(retried.transferError).toBeNull();
  });

  it('records a failed file without leaving the transfer busy', () => {
    const state = appReducer(
      makeState({ downloadingFileIndex: 2, transferProgress: 40, downloadQueue: [2, 3] }),
      { type: 'TRANSFER_FAILED', index: 2, message: 'timed out' },
    );

    expect(state.failedFileIndex).toBe(2);
    expect(state.transferError).toBe('timed out');
    expect(state.downloadingFileIndex).toBeNull();
    expect(state.transferProgress).toBe(0);
    expect(state.status).toBe('idle');
  });

  it('moves a failed text transfer on the receiver to the error screen', () => {
    const state = appReducer(
      makeState({ isReceiving: true, status: 'connected' }),
      { type: 'TRANSFER_FAILED', index: -1, message: 'cancelled' },
    );

    expect(state.failedFileIndex).toBeNull();
    expect(state.status).toBe('error');
    expect(state.errorMessage).toBe('cancelled');
  });

  it('keeps a failed outgoing text on the share screen', () => {
    const state = appReducer(makeState({ status: 'sharing' }), {
      type: 'TRANSFER_FAILED', index: -1, message: 'cancelled',
    });

    expect(state.status).toBe('sharing');
    expect(state.transferError).toBe('cancelled');
  });

  it('retries a failed file only when the transfer is idle', () => {
    const idle = makeState({ downloadingFileIndex: 1 });
    expect(appReducer(idle, { type: 'RETRY_TRANSFER' })).toBe(idle);

    const failed = makeState({ failedFileIndex: 4, transferError: 'boom' });
    const retried = appReducer(failed, { type: 'RETRY_TRANSFER' });
    expect(retried.downloadingFileIndex).toBe(4);
    expect(retried.failedFileIndex).toBeNull();
    expect(retried.transferError).toBeNull();
    expect(retried.transferProgress).toBe(0);
  });

  it('skips a failed file and continues with the rest of the queue', () => {
    const untouched = makeState();
    expect(appReducer(untouched, { type: 'SKIP_TRANSFER' })).toBe(untouched);

    const state = appReducer(
      makeState({
        failedFileIndex: 1,
        transferError: 'boom',
        downloadQueue: [1, 2],
        selectedFiles: new Set([1, 2]),
      }),
      { type: 'SKIP_TRANSFER' },
    );

    expect(state.downloadQueue).toEqual([2]);
    expect(state.downloadingFileIndex).toBe(2);
    expect([...state.selectedFiles]).toEqual([2]);
    expect(state.failedFileIndex).toBeNull();
    expect(state.transferError).toBeNull();
  });

  it('does not change selection while a download is running or after it completed', () => {
    const downloading = makeState({ downloadingFileIndex: 0 });
    expect(appReducer(downloading, { type: 'TOGGLE_SELECT', index: 1, selected: true })).toBe(downloading);

    const downloaded = makeState({ downloadedFiles: new Set([1]) });
    expect(appReducer(downloaded, { type: 'TOGGLE_SELECT', index: 1, selected: true })).toBe(downloaded);
  });

  it('refuses a second batch while one is active or awaiting a retry', () => {
    const downloading = makeState({ downloadingFileIndex: 0 });
    expect(appReducer(downloading, { type: 'DOWNLOAD_START', indices: [1] })).toBe(downloading);

    const failed = makeState({ failedFileIndex: 1 });
    expect(appReducer(failed, { type: 'DOWNLOAD_START', indices: [2] })).toBe(failed);
  });

  it('deduplicates a batch and skips files already downloaded', () => {
    const state = appReducer(
      makeState({ downloadedFiles: new Set([1]) }),
      { type: 'DOWNLOAD_START', indices: [1, 2, 2, 3] },
    );

    expect(state.downloadQueue).toEqual([2, 3]);
    expect(state.downloadingFileIndex).toBe(2);
  });

  it('ignores completion for a file that is not downloading', () => {
    const state = makeState({ downloadingFileIndex: 1 });
    expect(appReducer(state, { type: 'FILE_COMPLETE', index: 2 })).toBe(state);
  });

  it('removes a completed file from the selection', () => {
    const state = appReducer(
      makeState({ downloadingFileIndex: 0, downloadQueue: [0], selectedFiles: new Set([0]) }),
      { type: 'FILE_COMPLETE', index: 0 },
    );

    expect([...state.selectedFiles]).toEqual([]);
  });

  it('clears a matching failure once the peer acknowledges the file', () => {
    const state = appReducer(
      makeState({ failedFileIndex: 2, transferError: 'boom' }),
      { type: 'FILE_ACKNOWLEDGED', index: 2 },
    );

    expect(state.failedFileIndex).toBeNull();
    expect(state.transferError).toBeNull();
  });
});
