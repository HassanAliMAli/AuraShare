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

  it('enters and cancels receive mode without losing status', () => {
    const receiving = reduce(makeState({ status: 'error' }), { type: 'START_RECEIVE' });
    expect(receiving.isReceiving).toBe(true);
    expect(receiving.status).toBe('idle');

    const cancelled = appReducer(receiving, { type: 'CANCEL_RECEIVE' });
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
    expect([...state.downloadedFiles]).toEqual([]);
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
});
