export type FileDescriptor = {
  name: string;
  size: number;
  type: string;
};

export type AppStatus = 'idle' | 'sharing' | 'connected' | 'downloading' | 'success' | 'error' | 'connecting';

export type ShareMode = 'text' | 'files';

export interface TransferFile {
  index: number;
  descriptor: FileDescriptor;
  selected: boolean;
  downloaded: boolean;
  downloading: boolean;
}