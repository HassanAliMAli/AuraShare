import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import {
  AppContext,
  initialState,
  type AppActions,
  type AppState,
} from '@/stores/appStore';
import { getRoute, navigate } from '@/lib/router';

/** Build a complete AppState with every Set cloned so tests cannot leak state. */
export function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    ...initialState,
    downloadedFiles: new Set(overrides.downloadedFiles ?? []),
    selectedFiles: new Set(overrides.selectedFiles ?? []),
    acknowledgedFiles: new Set(overrides.acknowledgedFiles ?? []),
    receivedFiles: overrides.receivedFiles ?? [],
    sentFiles: overrides.sentFiles ?? [],
    downloadQueue: overrides.downloadQueue ?? [],
    ...overrides,
  };
}

/** Build a complete AppActions object; every action is a spy unless overridden. */
export function makeActions(overrides: Partial<AppActions> = {}): AppActions {
  const noop = (): void => {};
  return {
    startShare: vi.fn(noop),
    startReceive: vi.fn(noop),
    cancelReceive: vi.fn(noop),
    setShareMode: vi.fn(noop),
    setJoinCode: vi.fn(noop),
    join: vi.fn(noop),
    downloadSelected: vi.fn(noop),
    toggleFileSelected: vi.fn(noop),
    copyText: vi.fn(async () => true),
    reset: vi.fn(noop),
    ...overrides,
  };
}

/** Render a component inside a synthetic app store (no P2P side effects). */
export function renderWithStore(
  ui: ReactElement,
  options: { state?: Partial<AppState>; actions?: Partial<AppActions> } = {},
) {
  const state = makeState(options.state);
  const actions = makeActions(options.actions);
  const result = render(<AppContext value={{ state, actions }}>{ui}</AppContext>);
  return { ...result, state, actions };
}

/**
 * Create a File without allocating its nominal size in memory. Validation
 * only reads `size`, so large-boundary cases can stay cheap.
 */
export function createFile(
  name: string,
  size: number,
  type = 'text/plain',
): File {
  const bytes = Math.min(size, 1024);
  const file = new File([new Uint8Array(bytes)], name, { type });
  if (size !== file.size) {
    Object.defineProperty(file, 'size', { value: size });
  }
  return file;
}

/** Put the module-level router back on a known path. */
export function resetRoute(path = '/'): void {
  if (getRoute() !== path) navigate(path);
}

/** Await all queued microtasks (promise chains inside the app). */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}
