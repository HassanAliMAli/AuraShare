import { useReducer, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { P2PManager } from '../lib/webrtc';
import { MAX_TEXT_BYTES } from '../lib/protocol';
import { validateFileList } from '../lib/validation';
import { downloadBudget } from '../lib/download-budget';
import type { PreparedDownload } from '../lib/download-budget';
import { isRoomCode, normalizeRoomCode, ROOM_CODE_HINT } from '../lib/roomCode';
import { AppContext, appReducer, initialState } from './appStore';
import type { AppActions } from './appStore';

const CONNECT_TIMEOUT_MS = 30_000;

/**
 * Owns the reducer + P2P manager lifecycle and exposes state + actions via
 * context. Shared callbacks handle the sender and receiver lifecycle.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const requestWaitRef = useRef<AbortController | null>(null);
  const managerRef = useRef<P2PManager | null>(null);
  const pendingFilesRef = useRef<File[] | null>(null);
  const pendingTextRef = useRef<string | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestedIndexRef = useRef<number | null>(null);
  const preparedDownloadsRef = useRef(new Map<number, PreparedDownload>());

  // Single source of truth for the download queue: when `downloadingFileIndex`
  // changes to a non-null value, request that file from the peer. Deduped
  // against StrictMode double-invocation via a ref guard.
  useEffect(() => {
    if (state.downloadingFileIndex === null) {
      lastRequestedIndexRef.current = null;
      return;
    }
    const index = state.downloadingFileIndex;
    const manager = managerRef.current;
    const file = state.receivedFiles[index];
    if (!manager || !file || lastRequestedIndexRef.current === index) return;
    const wait = new AbortController();
    requestWaitRef.current = wait;
    const budget = downloadBudget;
    if (!budget.hasCapacity(file.size)) dispatch({ type: 'MEMORY_WAIT', waiting: true });
    void budget.waitForCapacity(file.size, wait.signal).then(() => {
      if (wait.signal.aborted || managerRef.current !== manager) return;
      requestWaitRef.current = null;
      lastRequestedIndexRef.current = index;
      dispatch({ type: 'MEMORY_WAIT', waiting: false });
      manager.requestFile(index);
    }).catch(() => {
      if (!wait.signal.aborted && managerRef.current === manager) {
        dispatch({ type: 'TRANSFER_FAILED', index, message: 'Not enough memory to receive this file' });
      }
    });
    return () => {
      wait.abort();
      if (requestWaitRef.current === wait) requestWaitRef.current = null;
    };
  }, [state.downloadingFileIndex, state.receivedFiles]);

  // Tear down the peer connection and any unsaved received files on unmount.
  useEffect(() => {
    const prepared = preparedDownloadsRef.current;
    return () => {
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      requestWaitRef.current?.abort();
      managerRef.current?.close();
      managerRef.current = null;
      for (const download of prepared.values()) downloadBudget.discard(download);
      prepared.clear();
    };
  }, []);

  function clearConnectTimeout(): void {
    if (connectTimeoutRef.current !== null) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = null;
  }

  function closeSession(): void {
    clearConnectTimeout();
    requestWaitRef.current?.abort();
    requestWaitRef.current = null;
    const previous = managerRef.current;
    managerRef.current = null;
    previous?.close();
    pendingFilesRef.current = null;
    pendingTextRef.current = null;
    lastRequestedIndexRef.current = null;
    // Ending the session gives up anything the user never saved.
    for (const download of preparedDownloadsRef.current.values()) downloadBudget.discard(download);
    preparedDownloadsRef.current.clear();
  }

  /**
   * Spend a prepared download from the user's gesture.
   *
   * The URL is dropped from the map after the click so a second save cannot
   * silently reuse a URL that is already on its release timer.
   */
  function saveDownload(index: number): void {
    const prepared = preparedDownloadsRef.current.get(index);
    if (!prepared) {
      dispatch({
        type: 'TRANSFER_FAILED',
        index,
        message: 'This file is no longer held in memory. Select and receive it again.',
      });
      return;
    }
    try {
      downloadBudget.save(prepared);
      preparedDownloadsRef.current.delete(index);
      dispatch({ type: 'FILE_SAVED', index });
    } catch {
      preparedDownloadsRef.current.delete(index);
      dispatch({
        type: 'TRANSFER_FAILED',
        index,
        message: 'Could not start the save. Select and receive the file again.',
      });
    }
  }

  /** Share the lifecycle handlers; ignore callbacks from a replaced session. */
  function createManager(role: 'sender' | 'receiver'): P2PManager {
    const current = () => managerRef.current === mgr;
    // Delivery accounting for this one session. The reducer copy cannot be
    // read from these callbacks — they are created once, so it would be stale.
    const delivered = { text: false, expectedFiles: 0, files: new Set<number>() };
    const settled = () =>
      delivered.text ||
      (delivered.expectedFiles > 0 && delivered.files.size >= delivered.expectedFiles);
    const end = () => {
      clearConnectTimeout();
      requestWaitRef.current?.abort();
      requestWaitRef.current = null;
      managerRef.current = null;
      mgr.close();
    };
    const fail = (message: string) => {
      if (!current()) return;
      end();
      dispatch({ type: 'SET_ERROR', message });
    };
    /**
     * A session that delivered its content and then ended is not a failure.
     * The peer leaving must not replace what the user has already received
     * with an error screen.
     */
    const leave = (message: string) => {
      if (!current()) return;
      const wasSettled = settled();
      end();
      dispatch(wasSettled
        ? { type: 'SESSION_NOTICE', message: 'Session ended — the other device left' }
        : { type: 'SET_ERROR', message });
    };
    const mgr = new P2PManager({
      onProgress: (progress) => {
        if (current()) dispatch({ type: 'SET_PROGRESS', progress });
      },
      onConnected: () => {
        if (current()) clearConnectTimeout();
      },
      onReceiverConnected: () => {
        if (!current() || role !== 'sender') return;
        dispatch({ type: 'SET_RECEIVER_READY' });
        const files = pendingFilesRef.current ?? [];
        delivered.expectedFiles = files.length;
        dispatch({
          type: 'SET_SENT_FILES',
          files: files.map((file) => ({ name: file.name, size: file.size, type: file.type })),
        });
        mgr.sendMeta(files);
        if (pendingTextRef.current) mgr.sendText(pendingTextRef.current);
      },
      onDisconnected: () => leave('The other device disconnected'),
      onRoomEnded: (reason) => {
        // Nobody ever joined: this is a real failure, not a finished session.
        if (reason === 'no-peer') {
          fail(role === 'sender'
            ? 'No one joined — the session ended'
            : 'The sending device never joined — the session ended');
          return;
        }
        leave('The session ended');
      },
      onFileAcknowledged: (index) => {
        if (!current()) return;
        delivered.files.add(index);
        dispatch({ type: 'FILE_ACKNOWLEDGED', index });
      },
      onFileDescriptorsReceived: (files) => {
        if (!current() || role !== 'receiver') return;
        delivered.expectedFiles = files.length;
        dispatch({ type: 'RECEIVE_DESCRIPTORS', files });
      },
      onFileComplete: (index, file) => {
        if (!current() || role !== 'receiver') return;
        delivered.files.add(index);
        try {
          // Hold the bytes, but do not click: a save must come from the
          // receiver's own gesture or the browser may drop it silently.
          const previous = preparedDownloadsRef.current.get(index);
          if (previous) downloadBudget.discard(previous);
          preparedDownloadsRef.current.set(index, downloadBudget.prepare(file));
          dispatch({ type: 'FILE_COMPLETE', index });
        } catch {
          dispatch({
            type: 'TRANSFER_FAILED',
            index,
            message: 'Could not hold this file in memory. Save the received files, then retry this one.',
          });
        }
      },
      onTextReceived: (text) => {
        if (!current() || role !== 'receiver') return;
        delivered.text = true;
        dispatch({ type: 'RECEIVE_TEXT', text });
      },
      onTransferFailed: (index, message) => {
        if (current()) dispatch({ type: 'TRANSFER_FAILED', index, message });
      },
      onTextAcknowledged: () => {
        if (!current()) return;
        delivered.text = true;
        dispatch({ type: 'TEXT_ACKNOWLEDGED' });
      },
      onConnectionWarning: (message) => {
        if (current()) dispatch({ type: 'CONNECTION_WARNING', message });
      },
      onError: fail,
    });
    managerRef.current = mgr;
    return mgr;
  }

  const actions: AppActions = {
    startShare: (files, text) => {
      if (files) {
        const selection = validateFileList(files);
        if (!files.length || selection.errors.length) {
          dispatch({ type: 'SET_ERROR', message: selection.errors[0]?.error.message ?? 'Select at least one file' });
          return;
        }
      }
      if (text !== undefined && new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
        dispatch({ type: 'SET_ERROR', message: 'Text exceeds the 1 MiB limit' }); return;
      }
      closeSession();
      dispatch({ type: 'RESET' });
      dispatch({ type: 'SET_STATUS', status: 'sharing' });
      pendingFilesRef.current = files ?? null;
      pendingTextRef.current = text ?? null;
      const mgr = createManager('sender');
      void mgr.initialize((code) => {
        // The code exists before the socket and credentials do; show it now.
        if (managerRef.current === mgr) {
          dispatch({ type: 'SET_ROOM', roomId: code, createdAt: Date.now() });
        }
      }).catch(() => {
        if (managerRef.current !== mgr) return;
        managerRef.current = null;
        mgr.close();
        dispatch({ type: 'SET_ERROR', message: 'Could not open a room' });
      });
    },

    startReceive: () => {
      closeSession();
      dispatch({ type: 'RESET' });
      dispatch({ type: 'START_RECEIVE' });
    },

    setShareMode: (mode) => dispatch({ type: 'SET_SHARE_MODE', mode }),
    setJoinCode: (code) => dispatch({ type: 'SET_JOIN_CODE', code }),

    join: (code) => {
      const normalized = normalizeRoomCode(code);
      if (!isRoomCode(normalized)) {
        // Never swallow this: a rejected code used to look like a dead button.
        dispatch({ type: 'SET_JOIN_CODE_ERROR', message: ROOM_CODE_HINT });
        return;
      }
      closeSession();
      dispatch({ type: 'RESET' });
      dispatch({ type: 'START_RECEIVE' });
      dispatch({ type: 'SET_JOIN_CODE', code: normalized });
      dispatch({ type: 'SET_JOIN_CODE_ERROR', message: null });
      dispatch({ type: 'SET_STATUS', status: 'connecting' });
      const mgr = createManager('receiver');

      connectTimeoutRef.current = setTimeout(() => {
        if (managerRef.current !== mgr) return;
        connectTimeoutRef.current = null;
        managerRef.current = null;
        mgr.close();
        dispatch({ type: 'SET_ERROR', message: 'Room not found or peer never connected' });
      }, CONNECT_TIMEOUT_MS);

      mgr.join(normalized).catch(() => {
        if (managerRef.current !== mgr) return;
        clearConnectTimeout();
        managerRef.current = null;
        mgr.close();
        dispatch({
          type: 'SET_ERROR',
          message: 'Could not join the room — check the code, it may be wrong or expired',
        });
      });
    },

    downloadSelected: () => {
      if (state.downloadingFileIndex !== null || state.failedFileIndex !== null) return;
      const indices = Array.from(state.selectedFiles)
        .filter((index) => !state.downloadedFiles.has(index) && !state.readyFiles.has(index));
      if (indices.length === 0) return;
      dispatch({ type: 'DOWNLOAD_START', indices });
    },

    saveFile: (index) => saveDownload(index),
    saveAll: () => {
      for (const index of Array.from(state.readyFiles).sort((a, b) => a - b)) {
        saveDownload(index);
      }
    },

    retryTransfer: () => { lastRequestedIndexRef.current = null; dispatch({ type: 'RETRY_TRANSFER' }); },
    skipTransfer: () => dispatch({ type: 'SKIP_TRANSFER' }),
    cancelTransfer: () => {
      if (requestWaitRef.current && state.downloadingFileIndex !== null) {
        requestWaitRef.current.abort();
        requestWaitRef.current = null;
        dispatch({ type: 'TRANSFER_FAILED', index: state.downloadingFileIndex, message: 'Transfer cancelled' });
      } else managerRef.current?.cancelTransfer();
    },
    retryText: () => {
      if (!pendingTextRef.current || !state.transferError) return;
      dispatch({ type: 'TEXT_RETRY' }); managerRef.current?.sendText(pendingTextRef.current);
    },

    toggleFileSelected: (index, selected) =>
      dispatch({ type: 'TOGGLE_SELECT', index, selected }),

    copyText: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // A silent failure is worse than none: the user would walk away
        // believing they have the text on their clipboard.
        console.error('Failed to copy to clipboard:', err);
        return false;
      }
    },

    reset: () => {
      closeSession();
      dispatch({ type: 'RESET' });
    },
  };

  return (
    <AppContext value={{ state, actions }}>
      {children}
    </AppContext>
  );
}
