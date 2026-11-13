/**
 * Playwright global setup — refuse to run the suite against the wrong servers.
 *
 * Playwright starts its `webServer` entries *before* `globalSetup` runs, so
 * this check happens after the servers are up. That is deliberate: the point
 * is to catch a server that was already running before the suite started,
 * which is exactly the stale case.
 *
 * See `test/e2e/e2e-preflight.ts` for what is checked and why.
 */

import { inspectServers, isBlocking } from './e2e-preflight';

export default function globalSetup(): void {
  const findings = inspectServers();
  const failures = findings.filter(isBlocking);

  for (const finding of findings) {
    const marker = isBlocking(finding) ? '✗' : finding.verdict === 'unknown' ? '!' : '✓';
    console.log(`${marker} ${finding.message}`);
  }

  if (failures.length > 0) {
    throw new Error(
      'The end-to-end suite would run against the wrong server.\n' +
        failures
          .map((finding) => {
            const pid = finding.listener.kind === 'known' ? finding.listener.pid : '?';
            return `  :${finding.server.port} — ${finding.message}\n      stop it with: kill ${pid}`;
          })
          .join('\n') +
        '\n\nOr start the suite with fresh servers: npm run test:e2e:fresh',
    );
  }
}
