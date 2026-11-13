/**
 * Guard against the end-to-end suite talking to the wrong servers.
 *
 * ## The problem
 *
 * `playwright.config.ts` reuses a server that is already listening
 * (`reuseExistingServer: !process.env.CI`). That is what makes `npm run
 * test:e2e` a one-liner — you do not have to start Vite and Wrangler first.
 *
 * It is also how the suite ends up testing something other than the code in
 * the working tree:
 *
 *  - A server left over from another checkout — another branch, another
 *    worktree — keeps serving *that* tree's code. The suite then passes or
 *    fails against code nobody is looking at.
 *  - `vite preview` serves the built `dist/` folder, not the source. It
 *    looks like a healthy server on `:5173`, and it is a perfectly good
 *    server — of the last build.
 *  - Any unrelated process squatting on the port is reused just the same.
 *
 * None of these announce themselves. The suite simply runs, and the result
 * is about a codebase that is not the one on disk.
 *
 * ## The check
 *
 * For each port the suite uses, find the process holding it and read two
 * things: the command line and the working directory.
 *
 *  - The working directory says *which tree* the server is serving. It must
 *    be this repository.
 *  - The command line says *what kind* of server it is. A `vite preview` on
 *    the right port is still wrong.
 *
 * A server that passes both is safe to reuse: Vite and Wrangler both watch
 * the filesystem, so they pick up a change as soon as it is saved.
 *
 * ## Running it
 *
 * ```bash
 * node --experimental-strip-types test/e2e/e2e-preflight.ts          # check
 * node --experimental-strip-types test/e2e/e2e-preflight.ts --kill   # stop ours
 * ```
 *
 * The check also runs automatically as Playwright's `globalSetup`, so
 * `npx playwright test` is covered too.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The extension is explicit: this module is also run directly by Node
// (`node --experimental-strip-types`), and Node's ESM resolver needs it.
import { STUN_PORT } from './stun-server.ts';

/** The port the Vite dev server listens on. */
export const VITE_PORT = 5173;

/** The port the Wrangler dev worker listens on. */
export const WORKER_PORT = 8787;

/** One server the end-to-end suite needs. */
export type E2EServer = {
  port: number;
  /** What the suite expects to find there. */
  label: string;
  /** At least one of these must appear in the listener's command line. */
  expectAny: string[];
  /** None of these may appear in the listener's command line. */
  reject: string[];
};

/**
 * The servers the suite talks to.
 *
 * The command-line patterns are matched against the *listener*, which is
 * not always the process you started: `wrangler dev` spawns `workerd`, and
 * `workerd` is what actually holds the socket.
 */
export const E2E_SERVERS: E2EServer[] = [
  {
    port: VITE_PORT,
    label: 'the Vite dev server',
    expectAny: ['vite'],
    // `vite preview` serves the built `dist/` folder — a stale build that
    // looks exactly like a working dev server.
    reject: ['preview'],
  },
  {
    port: WORKER_PORT,
    label: 'the Wrangler dev worker',
    expectAny: ['wrangler', 'workerd'],
    reject: [],
  },
  {
    port: STUN_PORT,
    label: "the suite's STUN server",
    expectAny: ['stun-server'],
    reject: [],
  },
];

/** Who is holding a port. */
export type Listener =
  /** Verified free. */
  | { kind: 'none' }
  /** Something is definitely listening, but its owner cannot be read. */
  | { kind: 'occupied' }
  /** There is no way to tell whether anything is listening. */
  | { kind: 'unknown' }
  | { kind: 'known'; pid: number; cmdline: string; cwd: string | null };

/** What the check concluded about a port. */
export type Verdict =
  /** Nothing is listening — the suite will start its own server. */
  | 'absent'
  /** The right server, serving this working tree. Safe to reuse. */
  | 'ok'
  /** Something is listening, but it is not the server the suite expects. */
  | 'wrong-server'
  /** The right kind of server, but it is serving a different tree. */
  | 'foreign-tree'
  /** Something is listening and the check could not identify it. */
  | 'occupied'
  /** There is no way to tell whether something is listening. */
  | 'unknown';

/**
 * The repository root.
 *
 * Found by walking up from this file until a `package.json` appears, rather
 * than by resolving a relative URL against `import.meta.url`: under Vitest
 * the module is served by Vite, and a relative URL resolved against
 * `import.meta.url` comes back pointing at the dev server rather than at the
 * file on disk.
 */
export const REPO_ROOT = (() => {
  let directory: string;
  try {
    directory = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    directory = process.cwd();
  }

  let current = directory;
  for (;;) {
    if (existsSync(path.join(current, 'package.json'))) {
      return realpathSync(current);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return realpathSync(process.cwd());
})();

/* ─── Finding the listener ─────────────────────────────────────────────── */

/**
 * The inode of every socket listening on `port`, read from `/proc`.
 *
 * Linux only. On other platforms this returns an empty list and the caller
 * falls back to `lsof`.
 */
function listeningSocketInodes(port: number): string[] {
  const inodes: string[] = [];

  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const line of text.split('\n').slice(1)) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 10) continue;
      // 0A is TCP_LISTEN.
      if (columns[3] !== '0A') continue;

      const localPort = Number.parseInt(columns[1]?.split(':')[1] ?? '', 16);
      if (localPort !== port) continue;

      const inode = columns[9];
      if (inode) inodes.push(inode);
    }
  }

  return inodes;
}

/** The process holding an open socket, found by its inode. */
function pidOwningInode(inode: string): number | null {
  const target = `socket:[${inode}]`;

  let entries: string[];
  try {
    entries = readdirSync('/proc');
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;

    let fds: string[];
    try {
      fds = readdirSync(`/proc/${entry}/fd`);
    } catch {
      continue;
    }

    for (const fd of fds) {
      try {
        if (readlinkSync(`/proc/${entry}/fd/${fd}`) === target) {
          return Number(entry);
        }
      } catch {
        // Another user's process — not ours to read.
      }
    }
  }

  return null;
}

/** Read a process's command line. */
function readCmdline(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      .split('\0')
      .filter(Boolean)
      .join(' ');
  } catch {
    // Not Linux, or the process is gone. Try `ps`.
  }

  try {
    return execFileSync('ps', ['-o', 'args=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** Read a process's working directory. */
function readCwd(pid: number): string | null {
  try {
    return realpathSync(readlinkSync(`/proc/${pid}/cwd`));
  } catch {
    // Not Linux, or the process belongs to another user. Try `lsof`.
  }

  try {
    const output = execFileSync(
      'lsof',
      ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const line = output.split('\n').find((entry) => entry.startsWith('n'));
    return line ? realpathSync(line.slice(1)) : null;
  } catch {
    return null;
  }
}

/** Read a process's command line and working directory. */
function describePid(pid: number): Listener {
  return {
    kind: 'known',
    pid,
    cmdline: readCmdline(pid),
    cwd: readCwd(pid),
  };
}

/** Find the listener on `port` through `lsof`, for platforms without `/proc`. */
function findListenerViaLsof(port: number): Listener {
  try {
    const output = execFileSync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const pid = Number(output.trim().split('\n')[0]);
    if (!pid) return { kind: 'none' };
    return describePid(pid);
  } catch (error) {
    // `lsof` exits 1 when it finds nothing, and cannot be started at all
    // when it is not installed. The first means the port is free; the second
    // means we simply cannot tell.
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') return { kind: 'unknown' };
    return { kind: 'none' };
  }
}

/** Find whatever is holding `port`. */
export function findListener(port: number): Listener {
  const inodes = listeningSocketInodes(port);

  if (inodes.length > 0) {
    for (const inode of inodes) {
      const pid = pidOwningInode(inode);
      if (pid !== null) return describePid(pid);
    }
    // A socket is listening but its owner cannot be read — it belongs to
    // another user. Something is definitely there.
    return { kind: 'occupied' };
  }

  // No `/proc` entry. Either the port is free or this is not Linux.
  if (process.platform === 'linux') return { kind: 'none' };

  return findListenerViaLsof(port);
}

/* ─── Deciding ─────────────────────────────────────────────────────────── */

/**
 * Decide whether a listener is safe to reuse.
 *
 * The rules, in order:
 *
 *  1. Nothing listening → the suite starts its own server. Fine.
 *  2. The command line is not the server the suite expects → **wrong**.
 *  3. The working directory is not this repository → **wrong tree**.
 *  4. Either could not be read → unknown; the run continues with a warning.
 */
export function classify(
  server: E2EServer,
  listener: Listener,
  repoRoot: string,
): Verdict {
  if (listener.kind === 'none') return 'absent';
  if (listener.kind === 'occupied') return 'occupied';
  if (listener.kind === 'unknown') return 'unknown';

  const cmdline = listener.cmdline.toLowerCase();

  if (cmdline) {
    const expected = server.expectAny.some((word) =>
      cmdline.includes(word.toLowerCase()),
    );
    if (!expected) return 'wrong-server';

    const rejected = server.reject.some((word) =>
      cmdline.includes(word.toLowerCase()),
    );
    if (rejected) return 'wrong-server';
  }

  if (!listener.cwd) return 'unknown';
  if (listener.cwd !== repoRoot) return 'foreign-tree';

  return 'ok';
}

/* ─── Reporting ────────────────────────────────────────────────────────── */

/** One port, and what the check found there. */
export type Finding = {
  server: E2EServer;
  listener: Listener;
  verdict: Verdict;
  message: string;
};

/** A finding that must stop the run. */
export function isBlocking(finding: Finding): boolean {
  return (
    finding.verdict === 'wrong-server' ||
    finding.verdict === 'foreign-tree' ||
    // Something is definitely listening and we cannot prove what it is.
    finding.verdict === 'occupied'
  );
}

/** Describe a listener in one line, for a message. */
function describeListener(listener: Listener): string {
  if (listener.kind === 'none') return 'nothing';
  if (listener.kind === 'occupied') return 'a process this check cannot read';
  if (listener.kind === 'unknown') return 'a process this check could not identify';
  const pid = `PID ${listener.pid}`;
  const command = listener.cmdline ? ` — "${listener.cmdline}"` : '';
  const where = listener.cwd ? `, working directory ${listener.cwd}` : '';
  return `${pid}${command}${where}`;
}

/** Inspect every port the suite uses. */
export function inspectServers(repoRoot: string = REPO_ROOT): Finding[] {
  return E2E_SERVERS.map((server) => {
    const listener = findListener(server.port);
    const verdict = classify(server, listener, repoRoot);

    let message: string;
    switch (verdict) {
      case 'absent':
        message = `:${server.port} is free — the suite will start ${server.label}.`;
        break;
      case 'ok':
        message = `:${server.port} is held by ${server.label} from this working tree (${describeListener(listener)}) — it serves this checkout.`;
        break;
      case 'wrong-server':
        message = `:${server.port} is held by ${describeListener(listener)}, which is not ${server.label}. The suite would talk to the wrong server.`;
        break;
      case 'foreign-tree':
        message = `:${server.port} is held by ${server.label} from a different working tree (${describeListener(listener)}). It would serve different code than this checkout.`;
        break;
      case 'unknown':
        message = `:${server.port} is held by ${describeListener(listener)}. Continuing, but the suite may be talking to the wrong server.`;
        break;
      case 'occupied':
        message = `:${server.port} is held by ${describeListener(listener)} — it belongs to another user, so this check cannot tell what it is. The suite would talk to whatever that is.`;
        break;
    }

    return { server, listener, verdict, message };
  });
}

/**
 * Stop the servers this working tree started.
 *
 * A server from another tree is left alone — it is not ours to kill, and it
 * is reported instead.
 */
export async function stopServers(repoRoot: string = REPO_ROOT): Promise<Finding[]> {
  const findings = inspectServers(repoRoot);

  for (const finding of findings) {
    const { listener } = finding;
    if (listener.kind !== 'known') continue;
    if (listener.cwd !== repoRoot) continue;

    try {
      process.kill(listener.pid, 'SIGTERM');
      const what = listener.cmdline ? `"${listener.cmdline}"` : `PID ${listener.pid}`;
      finding.message = `:${finding.server.port} — stopped ${what}.`;
    } catch (error) {
      finding.message = `:${finding.server.port} — could not stop PID ${listener.pid}: ${String(error)}`;
    }
  }

  // Give the sockets a moment to close before anything tries to bind them.
  await new Promise((resolve) => setTimeout(resolve, 500));

  return findings;
}

/* ─── CLI ───────────────────────────────────────────────────────────────── */

/** Run the check and report. Returns the exit code. */
export async function main(argv: string[]): Promise<number> {
  return argv.includes('--kill') ? runKill() : runCheck();
}

function runCheck(): number {
  const findings = inspectServers();
  const failures = findings.filter(isBlocking);

  for (const finding of findings) {
    const marker = isBlocking(finding) ? '✗' : finding.verdict === 'unknown' ? '!' : '✓';
    console.log(`${marker} ${finding.message}`);
  }

  if (failures.length > 0) {
    console.error(
      '\nThe suite would run against the wrong server. Stop it, or start it from this working tree:\n' +
        failures
          .map(
            (finding) =>
              `  kill ${finding.listener.kind === 'known' ? finding.listener.pid : '<pid>'}`,
          )
          .join('\n'),
    );
    return 1;
  }

  return 0;
}

async function runKill(): Promise<number> {
  const findings = await stopServers();

  for (const finding of findings) {
    console.log(`· ${finding.message}`);
  }

  return 0;
}

// Started as a script: run the check.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)));
}
