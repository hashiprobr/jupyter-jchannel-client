import crypto from 'crypto';
import http from 'http';

import { Client } from '../client';

jest.mock('../channel', () => {
    return {
        Channel: jest.fn().mockImplementation(() => {
            return {
                handleCall: (name, ...args) => {
                    if (name === 'error') {
                        throw new Error();
                    }
                    return args;
                },
            };
        }),
    };
});

const FUTURE_KEY = 0;
const CHANNEL_KEY = 1;

let c, s;

function start() {
    return new Client('ws://localhost:8889');
}

async function send(bodyType, payload) {
    const body = {
        future: FUTURE_KEY,
        channel: CHANNEL_KEY,
        payload,
    };
    await c._send(bodyType, body);
}

async function open(payload = '() => { }') {
    await send('open', payload);
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
                s.body = null;

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
                                    case 'closed':
                                    case 'result':
                                    case 'exception':
                                        s.body = body;
                                        if (typeof s.body.payload === 'undefined') {
                                            break;
                                        }
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
    await expect(c._send('heart')).rejects.toThrow(Error);
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

test('receives unexpected message type', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    c = start();
    await c.connection;
    await c._send('bytes');
    await c.disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenNthCalledWith(1, expect.any(Error));
    expect(error).toHaveBeenNthCalledWith(2, expect.any(String));
});

test('receives empty message', async () => {
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

test('receives empty body', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    c = start();
    await c.connection;
    await c._send('open');
    await c.disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenNthCalledWith(1, expect.any(Error));
    expect(error).toHaveBeenNthCalledWith(2, expect.any(String));
});

test('opens', async () => {
    await s.start();
    c = start();
    await c.connection;
    await open('() => 0');
    await c.disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe(0);
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not open with invalid code', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    c = start();
    await c.connection;
    await open('() =>');
    await c.disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.any(Error));
});

test('does not open with non-function code', async () => {
    await s.start();
    c = start();
    await c.connection;
    await open('0');
    await c.disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not open with non-string code', async () => {
    await s.start();
    c = start();
    await c.connection;
    await open(0);
    await c.disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('echoes', async () => {
    await s.start();
    c = start();
    await c.connection;
    await open();
    await send('echo', 1);
    await c.disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe(1);
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not echo', async () => {
    const warn = jest.spyOn(console, 'warn');
    await s.start();
    c = start();
    await c.connection;
    await send('echo', 1);
    await c.disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('closed');
    expect(s.body.payload).toBeNull();
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.any(String));
});

test('calls', async () => {
    await s.start();
    c = start();
    await c.connection;
    await open();
    await send('call', { name: 'name', args: [0, 1] });
    await c.disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toStrictEqual([0, 1]);
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not call', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    c = start();
    await c.connection;
    await open();
    await send('call', { name: 'error', args: [0, 1] });
    await c.disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.any(Error));
});

test('receives unexpected body type', async () => {
    await s.start();
    c = start();
    await c.connection;
    await open();
    await send('type', null);
    await c.disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});
