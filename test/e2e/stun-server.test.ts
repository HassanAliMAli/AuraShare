import { afterEach, describe, expect, it } from 'vitest';
import { createSocket } from 'node:dgram';
import { startStunServer } from './stun-server';

/**
 * The suite's STUN server has to be exactly right: a wrong XOR-MAPPED-ADDRESS
 * would leave the peer-to-peer tests failing with "ICE negotiation failed"
 * and nothing to explain why.
 */

const MAGIC_COOKIE = 0x2112a442;

function bindingRequest(transactionId: Buffer): Buffer {
  const message = Buffer.alloc(20);
  message.writeUInt16BE(0x0001, 0); // Binding Request
  message.writeUInt16BE(0, 2); // no attributes
  message.writeUInt32BE(MAGIC_COOKIE, 4);
  transactionId.copy(message, 8);
  return message;
}

/** Send a Binding Request and wait for the response. */
function ask(port: number, transactionId: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    socket.on('message', (message) => {
      socket.close();
      resolve(message);
    });
    socket.on('error', (error) => {
      socket.close();
      reject(error);
    });
    socket.send(bindingRequest(transactionId), port, '127.0.0.1');
  });
}

/** Decode the XOR-MAPPED-ADDRESS attribute of a response. */
function decodeXorMappedAddress(response: Buffer): { address: string; port: number } {
  const attribute = response.subarray(20);
  expect(attribute.readUInt16BE(0)).toBe(0x0020); // XOR-MAPPED-ADDRESS
  expect(attribute.readUInt16BE(2)).toBe(8);
  // The family is a 16-bit field — 0x0001 is IPv4. Reading one byte here
  // and treating the next as padding gives 0x0100, which is not a family at
  // all, and the browser throws the whole response away.
  expect(attribute.readUInt16BE(4)).toBe(0x0001);

  // The attribute is: type(2) length(2) family(2) X-Port(2) X-Address(4).
  const port = attribute.readUInt16BE(6) ^ (MAGIC_COOKIE >>> 16);
  const address = [8, 9, 10, 11]
    .map((index, octet) => attribute.readUInt8(index) ^ ((MAGIC_COOKIE >>> (24 - octet * 8)) & 0xff))
    .join('.');

  return { address, port };
}

describe('e2e/stun-server', () => {
  const servers: { close: () => void }[] = [];

  afterEach(() => {
    for (const server of servers) server.close();
    servers.length = 0;
  });

  it('answers a Binding Request with a Binding Success Response', async () => {
    const server = startStunServer(0);
    servers.push(server);
    await server.ready;

    const response = await ask(server.boundPort(), Buffer.alloc(12));

    expect(response.readUInt16BE(0)).toBe(0x0101);
    expect(response.readUInt16BE(2)).toBe(12); // one 12-byte attribute
    expect(response.readUInt32BE(4)).toBe(MAGIC_COOKIE);
  });

  it('echoes the transaction ID so the client can match the response', async () => {
    const server = startStunServer(0);
    servers.push(server);
    await server.ready;

    const transactionId = Buffer.from('0123456789abcdef01234567', 'hex');
    const response = await ask(server.boundPort(), transactionId);

    expect(response.subarray(8, 20).equals(transactionId)).toBe(true);
  });

  it('encodes the source address back to what it was', async () => {
    const server = startStunServer(0);
    servers.push(server);
    await server.ready;

    const response = await ask(server.boundPort(), Buffer.alloc(12));
    const decoded = decodeXorMappedAddress(response);

    // The request came from 127.0.0.1, so that is what comes back.
    expect(decoded.address).toBe('127.0.0.1');
    expect(decoded.port).toBeGreaterThan(0);
  });

  it('ignores a Binding Indication, which must not be answered', async () => {
    const server = startStunServer(0);
    servers.push(server);
    await server.ready;

    const indication = bindingRequest(Buffer.alloc(12));
    indication.writeUInt16BE(0x0011, 0);

    const answered = await new Promise<boolean>((resolve) => {
      const socket = createSocket('udp4');
      socket.on('message', () => {
        socket.close();
        resolve(true);
      });
      socket.send(indication, server.boundPort(), '127.0.0.1');
      setTimeout(() => {
        socket.close();
        resolve(false);
      }, 300);
    });

    expect(answered).toBe(false);
  });
});
