import crypto from 'crypto';
import http from 'http';

import { jest } from '@jest/globals';
import { Client } from '../client';

let c, s;

function start() {
    return new Client('ws://localhost:8889');
}

beforeEach(() => {
    s = http.createServer();

    s.heartbeat = false;

    s.start = () => {
        return new Promise((resolve) => {
            s.on('listening', () => {
                resolve();
            });

            s.on('upgrade', (request, socket) => {
                const key = request.headers['sec-websocket-key'];
                const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
                const accept = crypto.createHash('sha1')
                    .update(`${key}${magic}`)
                    .digest('base64');

                socket.write([
                    'HTTP/1.1 101 Switching Protocols',
                    'Connection: Upgrade',
                    'Upgrade: WebSocket',
                    `Sec-WebSocket-Accept: ${accept}`,
                    '\r\n',
                ].join('\r\n'));

                s.disconnection = new Promise((resolve) => {
                    socket.on('data', (chunk) => {
                        while (chunk.length > 0) {
                            if (chunk[0] === 0b10001000) {
                                socket.destroy();
                                resolve();
                                break;
                            }

                            const end = 6 + chunk[1] - 0b10000000;

                            if (chunk[0] === 0b10001010) {
                                s.heartbeat = true;
                            } else {
                                const mask = chunk.subarray(2, 6);
                                const payload = chunk.subarray(6, end);

                                for (let i = 0; i < payload.length; i++) {
                                    payload[i] ^= mask[i % 4];
                                }

                                const data = payload.toString();
                                const body = JSON.parse(data);

                                switch (body.type) {
                                    case 'heart':
                                        socket.write(new Uint8Array([0b10001001, 0b00000000]));
                                        break;
                                    case 'close':
                                        socket.write(new Uint8Array([0b10001000, 0b00000000]));
                                        break;
                                    case 'bytes':
                                        socket.write(new Uint8Array([0b10000010, 0b00000000]));
                                        break;
                                    case 'empty':
                                        socket.write(new Uint8Array([0b10000001, 0b00000000]));
                                        break;
                                    default:
                                        socket.write(new Uint8Array([0b10000001, payload.length, ...payload]));
                                }
                            }

                            chunk = chunk.subarray(end);
                        }
                    });
                });
            });

            s.listen(8889, 'localhost');
        });
    };

    s.stop = () => {
        return new Promise((resolve) => {
            s.on('close', () => {
                resolve();
            });

            s.disconnection.then(() => {
                s.close();
            });
        });
    };
});

afterEach(() => {
    jest.restoreAllMocks();
});

test('does not connect and does not send', async () => {
    c = start();
    await expect(c.connection).rejects.toThrow(Error);
    await expect(c._send('')).rejects.toThrow(Error);
    await c.disconnection;
});

test('connects, pongs, and disconnects', async () => {
    await s.start();
    c = start();
    await expect(c.connection).resolves.toBeInstanceOf(WebSocket);
    await c._send('heart');
    await c._send('close');
    await c.disconnection;
    await s.stop();
    expect(s.heartbeat).toBe(true);
});

test('closes due to an error', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    c = start();
    await c.connection;
    await c._send('debug');
    await c._send('close');
    await c.disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledWith(expect.any(String));
});

test('receives unexpected body type', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    c = start();
    await c.connection;
    await c._send('error');
    await c._send('close');
    await c.disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledWith(expect.any(String));
});

test('receives unexpected message type', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    c = start();
    await c.connection;
    await c._send('bytes');
    await c._send('close');
    await c.disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledWith(expect.any(String));
});

test('catches unexpected exception', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    c = start();
    await c.connection;
    await c._send('empty');
    await c._send('close');
    await c.disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledWith(expect.any(Error));
});
