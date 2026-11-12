import { expect, test } from '@playwright/test';
import { localIceServers } from './stun-server';

/**
 * The suite's own ICE path.
 *
 * The peer-to-peer tests depend on the two peers being able to reach each
 * other over the machine's private address, which is what the local STUN
 * server provides. This test guards that dependency directly: if the STUN
 * response were malformed, the browser would throw it away, the reflexive
 * candidate would never appear, and the peer-to-peer tests would fail with
 * "ICE negotiation failed" and nothing to explain why.
 */

test.describe('ICE', () => {
  test('the browser turns the local STUN response into a reflexive candidate', async ({
    page,
  }) => {
    await page.goto('/');

    const candidates = await page.evaluate(async (iceServers) => {
      const pc = new RTCPeerConnection({ iceServers });
      const found: string[] = [];
      pc.onicecandidate = (event) => {
        if (event.candidate) found.push(event.candidate.candidate);
      };
      pc.createDataChannel('probe');
      await pc.setLocalDescription(await pc.createOffer());
      // Give the binding request time to come back.
      await new Promise((resolve) => setTimeout(resolve, 4000));
      pc.close();
      return found;
    }, localIceServers().iceServers);

    const reflexive = candidates.filter((candidate) => candidate.includes('typ srflx'));

    expect(
      reflexive.length,
      `no server-reflexive candidate was gathered from:\n${candidates.join('\n')}`,
    ).toBeGreaterThan(0);

    // It must be the host's own private address: that is the address the two
    // peers of a session can reach each other on.
    const reflexiveAddress = reflexive[0]?.match(/ (\d+\.\d+\.\d+\.\d+) /)?.[1];
    expect(reflexiveAddress).toBeDefined();
    expect(reflexiveAddress).not.toBe('127.0.0.1');
  });
});
