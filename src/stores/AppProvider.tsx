import { useReducer, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { P2PManager } from '../lib/webrtc';
import { sanitizeFilename } from '../lib/validation';
import { AppContext, appReducer, initialState } from './appStore';
import type { AppActions } from './appStore';

/**
 * Owns the reducer + P2P manager lifecycle and exposes state + actions via
 * context. The single integration point; Phase 2 swaps the P2PManager internals
 * for raw WebRTC without changing this surface.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const managerRef = useRef<P2PManager | null>(null);
  const pendingFilesRef = useRef<File[] | null>(null);
  const pendingTextRef = useRef<string | null>(null);

  // Single source of truth for the download queue: when `downloadingFileIndex`
  // changes to a non-null value, request that file from the peer. Replaces the
  // fragile setTimeout chain and the duplicate downloadTrack ref.
  useEffect(() => {
    if (state.downloadingFileIndex === null) return;
    managerRef.current?.requestFile(state.downloadingFileIndex);
  }, [state.downloadingFileIndex]);

  // Tear down the peer connection on unmount.
  useEffect(() => {
    return () => {
      managerRef.current?.close();
      managerRef.current = null;
    };
  }, []);

  const actions: AppActions = {
    startShare: (files, text) => {
      dispatch({ type: 'SET_STATUS', status: 'sharing' });
      pendingFilesRef.current = files ?? null;
      pendingTextRef.current = text ?? null;
      managerRef.current?.close();

      const mgr = new P2PManager({
        onProgress: (p) => dispatch({ type: 'SET_PROGRESS', progress: p }),
        onConnected: () => {},
        onReceiverConnected: () => {
          dispatch({ type: 'SET_RECEIVER_READY' });
          const fileArr = pendingFilesRef.current ?? [];
          if (fileArr.length > 0) {
            dispatch({
              type: 'SET_SENT_FILES',
              files: fileArr.map((f) => ({ name: f.name, size: f.size, type: f.type })),
            });
          }
          mgr.sendMeta(fileArr);
          if (pendingTextRef.current) {
            mgr.sendText(pendingTextRef.current);
          }
        },
        onDisconnected: () => { /* wait for user to end session */ },
        onFileAcknowledged: (index) => dispatch({ type: 'FILE_ACKNOWLEDGED', index }),
        onTransferComplete: () => {},
        onError: (err) => {
          console.error('[P2P] Signaling error:', err);
          dispatch({ type: 'SET_ERROR', message: err });
        },
      });
      managerRef.current = mgr;

      mgr.initialize().then((code) => {
        dispatch({ type: 'SET_ROOM', roomId: code });
      }).catch(() => {
        dispatch({ type: 'SET_ERROR', message: 'Alignment Failed' });
      });
    },

    startReceive: () => dispatch({ type: 'START_RECEIVE' }),
    cancelReceive: () => dispatch({ type: 'CANCEL_RECEIVE' }),

    setShareMode: (mode) => dispatch({ type: 'SET_SHARE_MODE', mode }),
    setJoinCode: (code) => dispatch({ type: 'SET_JOIN_CODE', code }),

    join: (code) => {
      const normalized = code.toUpperCase().trim();
      if (normalized.length !== 6 || !/^[A-Z0-9]+$/.test(normalized)) return;
      dispatch({ type: 'SET_STATUS', status: 'connecting' });
      managerRef.current?.close();

      const mgr = new P2PManager({
        onProgress: (p) => dispatch({ type: 'SET_PROGRESS', progress: p }),
        onConnected: () => {},
        onDisconnected: () => { /* wait for user */ },
        onFileDescriptorsReceived: (files) => dispatch({ type: 'RECEIVE_DESCRIPTORS', files }),
        onFileComplete: (index, file) => {
          dispatch({ type: 'FILE_COMPLETE', index });
          autoSaveFile(file);
        },
        onTextReceived: (text) => dispatch({ type: 'RECEIVE_TEXT', text }),
        onTransferComplete: () => {},
        onError: (err) => dispatch({ type: 'SET_ERROR', message: err }),
      });
      managerRef.current = mgr;

      mgr.join(normalized).catch(() => {
        dispatch({ type: 'SET_ERROR', message: 'Cosmic Link Broken' });
      });
    },

    downloadSelected: () => {
      if (state.selectedFiles.size === 0) return;
      const indices = Array.from(state.selectedFiles);
      dispatch({ type: 'DOWNLOAD_START', indices });
    },

    toggleFileSelected: (index, selected) =>
      dispatch({ type: 'TOGGLE_SELECT', index, selected }),

    copyText: (text) => {
      navigator.clipboard.writeText(text).catch((err) => {
        console.error('Failed to copy to clipboard:', err);
      });
    },

    reset: () => {
      managerRef.current?.close();
      managerRef.current = null;
      pendingFilesRef.current = null;
      pendingTextRef.current = null;
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
