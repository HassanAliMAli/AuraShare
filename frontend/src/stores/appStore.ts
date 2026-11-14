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
  /** Inline feedback for the code field — set when a code is rejected. */
  joinCodeError: string | null;
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
  failedFileIndex: number | null;
  transferError: string | null;
  connectionWarning: string | null;
  textAcknowledged: boolean;
};

export const initialState: AppState = {
  status: 'idle',
  transferProgress: 0,
  joinCode: '',
  isReceiving: false,
  shareMode: 'text',
  receivedText: null,
  errorMessage: null,
  joinCodeError: null,
  roomId: null,
  receivedFiles: [],
  downloadedFiles: new Set(),
  selectedFiles: new Set(),
  downloadQueue: [],
  downloadingFileIndex: null,
  acknowledgedFiles: new Set(),
  sentFiles: [],
  receiverReady: false,
  failedFileIndex: null,
  transferError: null,
  connectionWarning: null,
  textAcknowledged: false,
};

export type AppAction =
  | { type: 'SET_STATUS'; status: AppStatus }
  | { type: 'SET_PROGRESS'; progress: number }
  | { type: 'SET_JOIN_CODE'; code: string }
  | { type: 'SET_SHARE_MODE'; mode: ShareMode }
  | { type: 'START_RECEIVE' }
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
  | { type: 'SET_JOIN_CODE_ERROR'; message: string | null }
  | { type: 'TRANSFER_FAILED'; index: number; message: string }
  | { type: 'RETRY_TRANSFER' }
  | { type: 'SKIP_TRANSFER' }
  | { type: 'TEXT_ACKNOWLEDGED' }
  | { type: 'TEXT_RETRY' }
  | { type: 'CONNECTION_WARNING'; message: string | null }
  | { type: 'RESET' };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'CONNECTION_WARNING': return { ...state, connectionWarning: action.message };
    case 'TEXT_ACKNOWLEDGED': return { ...state, textAcknowledged: true, transferError: null };
    case 'TEXT_RETRY': return { ...state, textAcknowledged: false, transferError: null };
    case 'TRANSFER_FAILED':
      return {
        ...state, transferError: action.message, failedFileIndex: action.index >= 0 ? action.index : null,
        downloadingFileIndex: null, transferProgress: 0,
        ...(state.isReceiving && action.index < 0 ? { status: 'error' as const, errorMessage: action.message } : {}),
      };
    case 'RETRY_TRANSFER':
      if (state.failedFileIndex === null || state.downloadingFileIndex !== null) return state;
      return { ...state, downloadingFileIndex: state.failedFileIndex, failedFileIndex: null, transferError: null, transferProgress: 0 };
    case 'SKIP_TRANSFER': {
      if (state.failedFileIndex === null) return state;
      const queue = state.downloadQueue.filter((index) => index !== state.failedFileIndex);
      const selected = new Set(state.selectedFiles); selected.delete(state.failedFileIndex);
      return { ...state, downloadQueue: queue, selectedFiles: selected,
        downloadingFileIndex: queue[0] ?? null, failedFileIndex: null, transferError: null, transferProgress: 0 };
    }
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'SET_PROGRESS':
      return { ...state, transferProgress: action.progress };
    case 'SET_JOIN_CODE':
      return { ...state, joinCode: action.code, joinCodeError: null };
    case 'SET_SHARE_MODE':
      return { ...state, shareMode: action.mode };
    case 'START_RECEIVE':
      return { ...state, isReceiving: true, status: 'idle', joinCodeError: null };
    case 'SET_ROOM':
      return { ...state, roomId: action.roomId };
    case 'SET_RECEIVER_READY':
      return { ...state, receiverReady: true };
    case 'SET_SENT_FILES':
      return { ...state, sentFiles: action.files };
    case 'RECEIVE_DESCRIPTORS':
      return { ...state, receivedFiles: action.files, status: 'connected' };
    case 'TOGGLE_SELECT': {
      if (state.downloadingFileIndex !== null || state.downloadedFiles.has(action.index)) return state;
      const next = new Set(state.selectedFiles);
      if (action.selected) next.add(action.index);
      else next.delete(action.index);
      return { ...state, selectedFiles: next };
    }
    case 'DOWNLOAD_START': {
      if (state.downloadingFileIndex !== null || state.failedFileIndex !== null) return state;
      const indices = [...new Set(action.indices)].filter((index) => !state.downloadedFiles.has(index));
      const first = indices[0];
      return {
        ...state,
        downloadQueue: indices,
        downloadingFileIndex: first === undefined ? null : first,
        transferProgress: 0,
      };
    }
    case 'FILE_COMPLETE': {
      if (state.downloadingFileIndex !== action.index) return state;
      const downloaded = new Set(state.downloadedFiles);
      downloaded.add(action.index);
      const selected = new Set(state.selectedFiles);
      selected.delete(action.index);
      const queue = state.downloadQueue.filter((i) => i !== action.index);
      const next = queue[0] ?? null;
      return {
        ...state,
        downloadedFiles: downloaded,
        selectedFiles: selected,
        downloadQueue: queue,
        downloadingFileIndex: next,
        transferProgress: 0,
      };
    }
    case 'FILE_ACKNOWLEDGED': {
      const next = new Set(state.acknowledgedFiles);
      next.add(action.index);
      return { ...state, acknowledgedFiles: next, ...(state.failedFileIndex === action.index ? { failedFileIndex: null, transferError: null } : {}) };
    }
    case 'RECEIVE_TEXT':
      return { ...state, receivedText: action.text, status: 'success' };
    case 'SET_ERROR':
      return { ...state, errorMessage: action.message, status: 'error' };
    case 'SET_JOIN_CODE_ERROR':
      return { ...state, joinCodeError: action.message };
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
  startShare: (files?: File[], text?: string) => void;
  startReceive: () => void;
  setShareMode: (mode: ShareMode) => void;
  setJoinCode: (code: string) => void;
  join: (code: string) => void;
  downloadSelected: () => void;
  retryTransfer: () => void;
  skipTransfer: () => void;
  cancelTransfer: () => void;
  retryText: () => void;
  toggleFileSelected: (index: number, selected: boolean) => void;
  copyText: (text: string) => Promise<boolean>;
  reset: () => void;
};

type AppContextValue = { state: AppState; actions: AppActions };

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppStore(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppStore must be used within <AppProvider>');
  return ctx;
}
