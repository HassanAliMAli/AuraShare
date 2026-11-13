import { describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import config from '../../playwright.config';
import {
  classify,
  E2E_SERVERS,
  findListener,
  isBlocking,
  REPO_ROOT,
  VITE_PORT,
  WORKER_PORT,
  type E2EServer,
  type Finding,
  type Listener,
  type Verdict,
} from './e2e-preflight.ts';

/**
 * The pre-flight guard decides whether the suite may reuse a server that is
 * already listening. A wrong answer here is worse than no check: the suite
 * would run against a codebase that is not the one on disk, and pass.
 */

const vite: E2EServer = E2E_SERVERS[0] as E2EServer;
const worker: E2EServer = E2E_SERVERS[1] as E2EServer;

const known = (overrides: Partial<Listener> & { pid: number }): Listener =>
  ({
    kind: 'known',
    cmdline: 'node vite --config frontend/vite.config.ts',
    cwd: REPO_ROOT,
    ...overrides,
  }) as Listener;

describe('e2e/e2e-preflight — classify', () => {
  it('accepts a free port', () => {
    expect(classify(vite, { kind: 'none' }, REPO_ROOT)).toBe('absent');
  });

  it('accepts the expected server running from this working tree', () => {
    expect(classify(vite, known({ pid: 1 }), REPO_ROOT)).toBe('ok');
  });

  it('rejects a server running from another checkout', () => {
    const listener = known({ pid: 1, cwd: '/somewhere/else/AuraShare' });
    expect(classify(vite, listener, REPO_ROOT)).toBe('foreign-tree');
  });

  it('rejects a process that is not the expected server', () => {
    const listener = known({ pid: 1, cmdline: 'python3 -m http.server 5173' });
    expect(classify(vite, listener, REPO_ROOT)).toBe('wrong-server');
  });

  it('rejects `vite preview`, which serves the last build instead of the source', () => {
    const listener = known({
      pid: 1,
      cmdline: 'node /repo/node_modules/.bin/vite preview --config frontend/vite.config.ts',
    });
    expect(classify(vite, listener, REPO_ROOT)).toBe('wrong-server');
  });

  it('accepts `workerd`, which is what actually holds the Wrangler socket', () => {
    const listener = known({
      pid: 1,
      cmdline: '/repo/node_modules/@cloudflare/workerd-linux-64/bin/workerd serve --socket-addr=entry=127.0.0.1:8787',
    });
    expect(classify(worker, listener, REPO_ROOT)).toBe('ok');
  });

  it('cannot vouch for a listener it could not identify', () => {
    expect(classify(vite, { kind: 'unknown' }, REPO_ROOT)).toBe('unknown');
  });

  it('blocks on a port held by a process it cannot read', () => {
    // Another user's socket: something is definitely there, and the suite
    // would talk to whatever it is.
    expect(classify(vite, { kind: 'occupied' }, REPO_ROOT)).toBe('occupied');
  });

  it('cannot vouch for a listener whose working directory it could not read', () => {
    const listener = known({ pid: 1, cwd: null });
    expect(classify(vite, listener, REPO_ROOT)).toBe('unknown');
  });
});

describe('e2e/e2e-preflight — findListener', () => {
  it('finds the process holding a port', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const listener = findListener(port);

      expect(listener.kind).toBe('known');
      if (listener.kind !== 'known') return;
      expect(listener.pid).toBe(process.pid);
      expect(listener.cwd).toBe(REPO_ROOT);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('reports a free port as free', () => {
    // Port 1 is never bound in this test environment.
    expect(findListener(1).kind).toBe('none');
  });
});

describe('e2e/e2e-preflight — what stops the run', () => {
  const finding = (verdict: Verdict): Finding => ({
    server: vite,
    listener: { kind: 'known', pid: 1, cmdline: 'vite', cwd: REPO_ROOT },
    verdict,
    message: '',
  });

  it('stops on a server that is the wrong one or the wrong tree', () => {
    expect(isBlocking(finding('wrong-server'))).toBe(true);
    expect(isBlocking(finding('foreign-tree'))).toBe(true);
    expect(isBlocking(finding('occupied'))).toBe(true);
  });

  it('continues when the port is free, right, or merely unknown', () => {
    expect(isBlocking(finding('absent'))).toBe(false);
    expect(isBlocking(finding('ok'))).toBe(false);
    expect(isBlocking(finding('unknown'))).toBe(false);
  });
});

describe('e2e/e2e-preflight — the suite and the guard agree on the ports', () => {  it('covers every port the Playwright config starts a server on', () => {
    const servers = (config.webServer ?? []) as {
      port?: number;
      url?: string;
    }[];

    const configPorts = servers
      .map((server) => server.port ?? Number(new URL(server.url as string).port))
      .sort((a, b) => a - b);

    expect(E2E_SERVERS.map((server) => server.port).sort((a, b) => a - b)).toEqual(
      configPorts,
    );
  });

  it('knows the two ports the suite hard-codes elsewhere', () => {
    expect(VITE_PORT).toBe(5173);
    expect(WORKER_PORT).toBe(8787);
  });
});
