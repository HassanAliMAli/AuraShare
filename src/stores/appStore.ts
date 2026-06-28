import { createContext, useContext } from 'react';
import type { AppStatus, FileDescriptor, ShareMode } from '../types';

/**
 * Central application state. Replaces the 16 scattered useState calls and the
 * duplicate `downloadTrack` ref / `downloadTotal` state in the old App.
 */
export type AppState = {
  status: AppStatus;
  transferProgress: number;
  joinCode: string;
  isReceiving: boolean;
  shareMode: ShareMode;
  receivedText: string | null;
  errorMessage: string | null;
  roomId: string | null;
  receivedFiles: FileDescriptor[];
  downloadedFiles: Set<number>;
  selectedFiles: Set<number>;
  /** Ordered queue of file indices the user requested in the current batch. */
  downloadQueue: number[];
  downloadingFileIndex: number | null;
  acknowledgedFiles: Set<number>;
  sentFiles: FileDescriptor[];
  receiverReady: boolean;
};

export const initialState: AppState = {
  status: 'idle',
  transferProgress: 0,
  joinCode: '',
  isReceiving: false,
  shareMode: 'text',
  receivedText: null,
  errorMessage: null,
  roomId: null,
  receivedFiles: [],
  downloadedFiles: new Set(),
  selectedFiles: new Set(),
  downloadQueue: [],
  downloadingFileIndex: null,
  acknowledgedFiles: new Set(),
  sentFiles: [],
  receiverReady: false,
};

export type AppAction =
  | { type: 'SET_STATUS'; status: AppStatus }
  | { type: 'SET_PROGRESS'; progress: number }
  | { type: 'SET_JOIN_CODE'; code: string }
  | { type: 'SET_SHARE_MODE'; mode: ShareMode }
  | { type: 'START_RECEIVE' }
  | { type: 'CANCEL_RECEIVE' }
  | { type: 'SET_ROOM'; roomId: string }
  | { type: 'SET_RECEIVER_READY' }
  | { type: 'SET_SENT_FILES'; files: FileDescriptor[] }
  | { type: 'RECEIVE_DESCRIPTORS'; files: FileDescriptor[] }
  | { type: 'TOGGLE_SELECT'; index: number; selected: boolean }
  | { type: 'DOWNLOAD_START'; indices: number[] }
  | { type: 'FILE_COMPLETE'; index: number }
  | { type: 'FILE_ACKNOWLEDGED'; index: number }
  | { type: 'RECEIVE_TEXT'; text: string }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'RESET' };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'SET_PROGRESS':
      return { ...state, transferProgress: action.progress };
    case 'SET_JOIN_CODE':
      return { ...state, joinCode: action.code };
    case 'SET_SHARE_MODE':
      return { ...state, shareMode: action.mode };
    case 'START_RECEIVE':
      return { ...state, isReceiving: true, status: 'idle' };
    case 'CANCEL_RECEIVE':
      return { ...state, isReceiving: false };
    case 'SET_ROOM':
      return { ...state, roomId: action.roomId };
    case 'SET_RECEIVER_READY':
      return { ...state, receiverReady: true };
    case 'SET_SENT_FILES':
      return { ...state, sentFiles: action.files };
    case 'RECEIVE_DESCRIPTORS':
      return { ...state, receivedFiles: action.files, status: 'connected' };
    case 'TOGGLE_SELECT': {
      const next = new Set(state.selectedFiles);
      if (action.selected) next.add(action.index);
      else next.delete(action.index);
      return { ...state, selectedFiles: next };
    }
    case 'DOWNLOAD_START': {
      const first = action.indices[0];
      return {
        ...state,
        downloadQueue: [...action.indices],
        downloadingFileIndex: first === undefined ? null : first,
        downloadedFiles: new Set(),
        transferProgress: 0,
      };
    }
    case 'FILE_COMPLETE': {
      const downloaded = new Set(state.downloadedFiles);
      downloaded.add(action.index);
      const queue = state.downloadQueue.filter((i) => i !== action.index);
      const next = queue[0] ?? null;
      const batchDone = queue.length === 0;
      return {
        ...state,
        downloadedFiles: downloaded,
        downloadQueue: queue,
        downloadingFileIndex: next,
        transferProgress: batchDone ? 0 : state.transferProgress,
      };
    }
    case 'FILE_ACKNOWLEDGED': {
      const next = new Set(state.acknowledgedFiles);
      next.add(action.index);
      return { ...state, acknowledgedFiles: next };
    }
    case 'RECEIVE_TEXT':
      return { ...state, receivedText: action.text, status: 'success' };
    case 'SET_ERROR':
      return { ...state, errorMessage: action.message, status: 'error' };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

/**
 * Actions exposed to views. The provider wires these to the P2P manager
 * side-effects; the reducer stays pure.
 */
export type AppActions = {
  startShare: (files?: FileList, text?: string) => void;
  startReceive: () => void;
  cancelReceive: () => void;
  setShareMode: (mode: ShareMode) => void;
  setJoinCode: (code: string) => void;
  join: (code: string) => void;
  downloadSelected: () => void;
  toggleFileSelected: (index: number, selected: boolean) => void;
  copyText: (text: string) => void;
  reset: () => void;
};

type AppContextValue = { state: AppState; actions: AppActions };

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppStore(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppStore must be used within <AppProvider>');
  return ctx;
}
