import { useReducer, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { P2PManager } from '../lib/webrtc';
import { MAX_TEXT_BYTES } from '../lib/protocol';
import { sanitizeFilename } from '../lib/validation';
import { isRoomCode, normalizeRoomCode, ROOM_CODE_HINT } from '../lib/roomCode';
import { AppContext, appReducer, initialState } from './appStore';
import type { AppActions } from './appStore';

const CONNECT_TIMEOUT_MS = 30_000;

/**
 * How long a received file's object URL stays alive.
 *
 * The URL is where the browser reads the file from, and the browser may
 * still be reading it long after the click: a large file on a slow link
 * takes minutes to arrive. Revoking the URL while the download is running
 * kills it, so the URL is kept for a minute and then released.
 */
const OBJECT_URL_TTL_MS = 60_000;

/**
 * Owns the reducer + P2P manager lifecycle and exposes state + actions via
 * context. Shared callbacks handle the sender and receiver lifecycle.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const managerRef = useRef<P2PManager | null>(null);
  const pendingFilesRef = useRef<File[] | null>(null);
  const pendingTextRef = useRef<string | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestedIndexRef = useRef<number | null>(null);

  // Single source of truth for the download queue: when `downloadingFileIndex`
  // changes to a non-null value, request that file from the peer. Deduped
  // against StrictMode double-invocation via a ref guard.
  useEffect(() => {
    if (state.downloadingFileIndex === null) {
      lastRequestedIndexRef.current = null;
      return;
    }
    if (lastRequestedIndexRef.current === state.downloadingFileIndex) return;
    lastRequestedIndexRef.current = state.downloadingFileIndex;
    managerRef.current?.requestFile(state.downloadingFileIndex);
  }, [state.downloadingFileIndex]);

  // Tear down the peer connection on unmount.
  useEffect(() => {
    return () => {
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      managerRef.current?.close();
      managerRef.current = null;
    };
  }, []);

  function clearConnectTimeout(): void {
    if (connectTimeoutRef.current !== null) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = null;
  }

  function closeSession(): void {
    clearConnectTimeout();
    const previous = managerRef.current;
    managerRef.current = null;
    previous?.close();
    pendingFilesRef.current = null;
    pendingTextRef.current = null;
    lastRequestedIndexRef.current = null;
  }

  /** Share the lifecycle handlers; ignore callbacks from a replaced session. */
  function createManager(role: 'sender' | 'receiver'): P2PManager {
    const current = () => managerRef.current === mgr;
    const fail = (message: string) => {
      if (!current()) return;
      clearConnectTimeout();
      managerRef.current = null;
      mgr.close();
      dispatch({ type: 'SET_ERROR', message });
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
        dispatch({
          type: 'SET_SENT_FILES',
          files: files.map((file) => ({ name: file.name, size: file.size, type: file.type })),
        });
        mgr.sendMeta(files);
        if (pendingTextRef.current) mgr.sendText(pendingTextRef.current);
      },
      onDisconnected: () => fail('The other device disconnected'),
      onRoomEnded: (reason) => fail(
        reason !== 'no-peer'
          ? 'The session ended'
          : role === 'sender'
            ? 'No one joined — the session ended'
            : 'The sending device never joined — the session ended',
      ),
      onFileAcknowledged: (index) => {
        if (current()) dispatch({ type: 'FILE_ACKNOWLEDGED', index });
      },
      onFileDescriptorsReceived: (files) => {
        if (current() && role === 'receiver') dispatch({ type: 'RECEIVE_DESCRIPTORS', files });
      },
      onFileComplete: (index, file) => {
        if (!current() || role !== 'receiver') return;
        dispatch({ type: 'FILE_COMPLETE', index });
        autoSaveFile(file);
      },
      onTextReceived: (text) => {
        if (current() && role === 'receiver') dispatch({ type: 'RECEIVE_TEXT', text });
      },
      onTransferFailed: (index, message) => {
        if (current()) dispatch({ type: 'TRANSFER_FAILED', index, message });
      },
      onTextAcknowledged: () => {
        if (current()) dispatch({ type: 'TEXT_ACKNOWLEDGED' });
      },
      onConnectionWarning: (message) => {
        if (current()) dispatch({ type: 'CONNECTION_WARNING', message });
      },
      onTransferComplete: () => {},
      onError: fail,
    });
    managerRef.current = mgr;
    return mgr;
  }

  const actions: AppActions = {
    startShare: (files, text) => {
      if (text !== undefined && new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
        dispatch({ type: 'SET_ERROR', message: 'Text exceeds the 1 MiB limit' }); return;
      }
      closeSession();
      dispatch({ type: 'RESET' });
      dispatch({ type: 'SET_STATUS', status: 'sharing' });
      pendingFilesRef.current = files ?? null;
      pendingTextRef.current = text ?? null;
      const mgr = createManager('sender');
      mgr.initialize().then((code) => {
        if (managerRef.current === mgr) dispatch({ type: 'SET_ROOM', roomId: code });
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
      const indices = Array.from(state.selectedFiles).filter((index) => !state.downloadedFiles.has(index));
      if (indices.length === 0) return;
      dispatch({ type: 'DOWNLOAD_START', indices });
    },

    retryTransfer: () => { lastRequestedIndexRef.current = null; dispatch({ type: 'RETRY_TRANSFER' }); },
    skipTransfer: () => dispatch({ type: 'SKIP_TRANSFER' }),
    cancelTransfer: () => managerRef.current?.cancelTransfer(),
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

/** Trigger a browser download for a received file and release the object URL. */
function autoSaveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(file.name);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_TTL_MS);
}
