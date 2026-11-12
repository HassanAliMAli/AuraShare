/**
 * A minimal STUN server for the end-to-end suite.
 *
 * ## Why this exists
 *
 * The peer-to-peer tests drive two browsers against each other on the same
 * machine, so their ICE candidates have to be able to reach each other.
 * WebKit obfuscates every host candidate with an mDNS name (`<uuid>.local`)
 * and offers no way to turn that off in a release build — `window.internals`
 * is not there. The only other candidate it gathers is a server-reflexive one
 * pointing at the machine's *public* address, and reaching that address from
 * the same machine means the NAT has to hairpin. A cloud NAT does not.
 *
 * On a GitHub runner that leaves the peer connection with no usable candidate
 * pair, and the test fails with `ICE negotiation failed` — intermittently,
 * depending on whether mDNS happened to resolve.
 *
 * A STUN server that runs on the same host fixes it: the binding request
 * comes from the host's own private address, so the reflexive candidate it
 * returns *is* that address, and the two peers reach each other directly.
 * No mDNS, no hairpinning, and no dependency on the public internet either.
 *
 * The suite also used to lean on `stun.l.google.com` being reachable from the
 * runner. This server removes that dependency as well.
 *
 * ## What it implements
 *
 * Just enough of RFC 5389 to answer a Binding Request with an
 * XOR-MAPPED-ADDRESS attribute. The port is shared with a throwaway TCP
 * listener so Playwright's `webServer` readiness probe — which dials TCP —
 * can tell the server is up.
 */

import { createSocket } from 'node:dgram';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';

/** The fixed port the suite and the server agree on. */
export const STUN_PORT = 13478;

/** RFC 5389 magic cookie. */
const MAGIC_COOKIE = 0x2112a442;

/** Binding Request. Indications (0x0011) and responses are ignored. */
const BINDING_REQUEST = 0x0001;

/** The XOR-MAPPED-ADDRESS attribute type. */
const XOR_MAPPED_ADDRESS = 0x0020;

/**
 * The host's own non-loopback IPv4 address.
 *
 * This is the address a binding request leaves from, and therefore the one
 * the reflexive candidate is built from — it is routable between the two
 * peers because they are on the same host.
 */
export function localIPv4(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return '127.0.0.1';
}

/** Build a Binding response carrying the peer's XOR-MAPPED-ADDRESS. */
function bindingResponse(request: Buffer, address: string, port: number): Buffer {
  const octets = address.split('.').map(Number);

  const xorAddress = Buffer.from([
    (octets[0] ?? 0) ^ ((MAGIC_COOKIE >>> 24) & 0xff),
    (octets[1] ?? 0) ^ ((MAGIC_COOKIE >>> 16) & 0xff),
    (octets[2] ?? 0) ^ ((MAGIC_COOKIE >>> 8) & 0xff),
    (octets[3] ?? 0) ^ (MAGIC_COOKIE & 0xff),
  ]);

  const attribute = Buffer.alloc(12);
  attribute.writeUInt16BE(XOR_MAPPED_ADDRESS, 0);
  attribute.writeUInt16BE(8, 2); // attribute length
  // The family is a 16-bit field: 0x0001 is IPv4, 0x0002 is IPv6. It is
  // not a one-byte value followed by a reserved byte — a browser that reads
  // 0x0100 here rejects the whole response.
  attribute.writeUInt16BE(0x0001, 4);
  attribute.writeUInt16BE(port ^ (MAGIC_COOKIE >>> 16), 6);
  xorAddress.copy(attribute, 8);

  const header = Buffer.alloc(20);
  header.writeUInt16BE(0x0101, 0); // Binding Success Response
  header.writeUInt16BE(attribute.length, 2);
  header.writeUInt32BE(MAGIC_COOKIE, 4);
  request.copy(header, 8, 8, 20); // the transaction ID

  return Buffer.concat([header, attribute]);
}

/**
 * Start the STUN server.
 *
 * The UDP socket carries STUN; a TCP listener on the same port exists only
 * so Playwright's readiness probe can connect to something.
 */
export function startStunServer(
  port: number = STUN_PORT,
): { ready: Promise<void>; boundPort: () => number; close: () => void } {
  const udp = createSocket('udp4');
  const probe = createServer((socket) => socket.destroy());

  udp.on('message', (message, remote) => {
    // A STUN message is at least 20 bytes and has the two top bits clear.
    if (message.length < 20) return;
    if ((message.readUInt16BE(0) & 0xc0) !== 0) return;
    if (message.readUInt16BE(0) !== BINDING_REQUEST) return;
    if (message.readUInt32BE(4) !== MAGIC_COOKIE) return;

    udp.send(bindingResponse(message, remote.address, remote.port), remote.port, remote.address);
  });

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    udp.close();
    probe.close();
  };

  const ready = Promise.all([
    new Promise<void>((resolve, reject) => {
      udp.once('error', reject);
      udp.bind(port, '0.0.0.0', () => {
        udp.removeListener('error', reject);
        resolve();
      });
    }),
    new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(port, '0.0.0.0', () => {
        probe.removeListener('error', reject);
        resolve();
      });
    }),
  ]).then(() => undefined);

  return { ready, boundPort: () => udp.address().port, close };
}

/** The ICE server list the end-to-end suite points the browsers at. */
export function localIceServers(): { iceServers: { urls: string }[] } {
  return { iceServers: [{ urls: `stun:${localIPv4()}:${STUN_PORT}` }] };
}

// Started as a script by Playwright's `webServer`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = startStunServer();
  await server.ready;
  console.log(`STUN server listening on 0.0.0.0:${STUN_PORT} (host ${localIPv4()})`);
}
