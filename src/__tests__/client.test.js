import crypto from 'crypto';
import http from 'http';

import { Client } from '../client';

let c, s;

function start() {
    return new Client('ws://localhost:8889');
}

beforeEach(() => {
    s = http.createServer();

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

                s.heartbeat = false;

                s.disconnection = new Promise((resolve) => {
                    let open = true;

                    socket.on('data', (chunk) => {
                        while (chunk.length > 0) {
                            const code = chunk[0] & 0b00001111;
                            const end = 6 + chunk[1] & 0b01111111;

                            const mask = chunk.subarray(2, 6);
                            const payload = chunk.subarray(6, end);

                            for (let i = 0; i < payload.length; i++) {
                                payload[i] ^= mask[i % 4];
                            }

                            if (code === 0x8) {
                                if (open) {
                                    socket.write(new Uint8Array([0b10001000, payload.length, ...payload]));
                                }
                                socket.destroy();
                                resolve();
                                break;
                            }

                            if (code === 0xA) {
                                s.heartbeat = true;
                            } else {
                                const data = payload.toString();
                                const body = JSON.parse(data);

                                switch (body.type) {
                                    case 'close':
                                        socket.write(new Uint8Array([0b10001000, 0]));
                                        open = false;
                                        break;
                                    case 'heart':
                                        socket.write(new Uint8Array([0b10001001, 0]));
                                        break;
                                    case 'bytes':
                                        socket.write(new Uint8Array([0b10000010, 0]));
                                        break;
                                    case 'empty':
                                        socket.write(new Uint8Array([0b10000001, 0]));
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

test('receives unexpected body type', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    c = start();
    await c.connection;
    await c._send('error');
    await c._send('close');
    await c.disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledTimes(1);
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
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.any(String));
});

test('catches unexpected exception', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    c = start();
    await c.connection;
    await c._send('empty');
    await c.disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenNthCalledWith(1, expect.any(Error));
    expect(error).toHaveBeenNthCalledWith(2, expect.any(String));
});
