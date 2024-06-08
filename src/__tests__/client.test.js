import crypto from 'crypto';
import http from 'http';

import { KernelError, StateError } from '../types';
import { Registry } from '../registry';
import { Channel } from '../channel';
import { Client } from '../client';

jest.mock('../loop');

jest.mock('../registry', () => {
    return {
        Registry: jest.fn(),
    };
});

jest.mock('../channel', () => {
    return {
        Channel: jest.fn(),
    };
});

const FUTURE_KEY = 123;
const CHANNEL_KEY = 456;

let s, future;

function mockChannel(client, key) {
    const channel = {
        close() {
            delete client._channels[key];
        },

        _handleCall(name, args) {
            if (name === 'error') {
                throw new Error();
            }
            if (name === 'undef') {
                return;
            }
            if (name === 'async') {
                return this._resolve(args);
            }
            return args;
        },

        async _resolve(args) {  // eslint-disable-line require-await
            return args;
        },
    };

    client._channels[key] = channel;

    return channel;
}

function client() {
    const registry = {
        store: jest.fn(),
        retrieve: jest.fn(),
        clear: jest.fn(),
    };

    Registry.mockReturnValue(registry);

    registry.store.mockReturnValue(FUTURE_KEY);
    registry.retrieve.mockReturnValue(future);

    Channel.mockImplementation(mockChannel);

    return new Client('http://localhost:8889');
}

async function send(c, bodyType, input = null) {
    await c._send(bodyType, input, CHANNEL_KEY);
}

async function open(c, code = '() => { }') {
    await send(c, 'open', code);
}

beforeEach(() => {
    const encoder = new TextEncoder();

    function encode(bodyType, payload) {
        const body = {
            future: FUTURE_KEY,
            channel: CHANNEL_KEY,
            payload,
        };

        body.type = bodyType;

        const data = JSON.stringify(body);

        return encoder.encode(data);
    }

    s = http.createServer();

    s.start = () => {
        return new Promise((resolve) => {
            s.on('listening', () => {
                resolve();
            });

            s.on('upgrade', (request, socket) => {
                function write(bytes) {
                    socket.write(new Uint8Array([0b10000001, bytes.length, ...bytes]));
                }

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
                            const bytes = chunk.subarray(6, end);

                            for (let i = 0; i < bytes.length; i++) {
                                bytes[i] ^= mask[i % 4];
                            }

                            if (code === 0x8) {
                                if (open) {
                                    write(bytes);
                                }
                                socket.destroy();
                                resolve();
                                break;
                            }

                            if (code === 0xA) {
                                s.heartbeat = true;
                            } else {
                                const data = bytes.toString();

                                const body = JSON.parse(data);

                                switch (body.type) {
                                    case 'closed':
                                    case 'exception':
                                    case 'result':
                                        s.body = body;
                                    case 'socket-close':
                                        socket.write(new Uint8Array([0b10001000, 0]));
                                        open = false;
                                        break;
                                    case 'socket-heart':
                                        socket.write(new Uint8Array([0b10001001, 0]));
                                        break;
                                    case 'socket-bytes':
                                        socket.write(new Uint8Array([0b10000010, 0]));
                                        break;
                                    case 'empty-message':
                                        socket.write(new Uint8Array([0b10000001, 0]));
                                        break;
                                    case 'empty-body':
                                        socket.write(new Uint8Array([0b10000001, 2, 123, 125]));
                                        break;
                                    case 'mock-exception':
                                        write(encode('exception', ''));
                                        break;
                                    case 'mock-result':
                                        write(encode('result', '0'));
                                        break;
                                    default:
                                        write(bytes);
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

    future = {
        setResult: jest.fn(),
        setException: jest.fn(),
    };
});

afterEach(() => {
    jest.restoreAllMocks();
});

test('does not connect and does not send', async () => {
    const c = client();
    await expect(c._connection).rejects.toThrow(Error);
    await c._disconnection;
    await expect(send(c, '')).rejects.toThrow(Error);
    expect(c._registry.clear).toHaveBeenCalledTimes(1);
});

test('connects, disconnects, and does not send', async () => {
    await s.start();
    const c = client();
    await expect(c._connection).resolves.toBeInstanceOf(WebSocket);
    await send(c, 'socket-close');
    await c._disconnection;
    await expect(send(c, '')).rejects.toThrow(StateError);
    await s.stop();
    expect(c._registry.clear).toHaveBeenCalledTimes(1);
});

test('connects, pongs, and disconnects', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await send(c, 'socket-heart');
    await send(c, 'socket-close');
    await c._disconnection;
    await s.stop();
    expect(s.heartbeat).toBe(true);
    expect(c._registry.clear).toHaveBeenCalledTimes(1);
});

test('receives unexpected message type', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    const c = client();
    await c._connection;
    await send(c, 'socket-bytes');
    await c._disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenNthCalledWith(1, expect.any(String), expect.any(TypeError));
});

test('receives empty message', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    const c = client();
    await c._connection;
    await send(c, 'empty-message');
    await c._disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenNthCalledWith(1, expect.any(String), expect.any(SyntaxError));
});

test('receives empty body', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    const c = client();
    await c._connection;
    await send(c, 'empty-body');
    await c._disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenNthCalledWith(1, expect.any(String), expect.any(Error));
});

test('receives exception', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await send(c, 'mock-exception');
    await send(c, 'socket-close');
    await c._disconnection;
    await s.stop();
    const [args] = future.setException.mock.calls;
    const [error] = args;
    expect(error).toBeInstanceOf(KernelError);
    expect(typeof error.message).toBe('string');
});

test('receives result', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await send(c, 'mock-result');
    await send(c, 'socket-close');
    await c._disconnection;
    await s.stop();
    const [args] = future.setResult.mock.calls;
    const [output] = args;
    expect(output).toBe(0);
});

test('opens', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c, '() => 0');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('0');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('opens async', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c, 'async () => 0');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('0');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('opens undef', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('null');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not open twice', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await open(c);
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('null');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not open error', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c, '() => { throw new Error(); }');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not open with invalid code', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    const c = client();
    await c._connection;
    await open(c, '() =>');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.any(String), expect.any(SyntaxError));
});

test('does not open with non-function code', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c, '0');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not open with non-string code', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c, 0);
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('closes', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'close');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('null');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not close', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await send(c, 'close');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('null');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('echoes', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'echo', 1);
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('1');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not echo', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await send(c, 'echo', 1);
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('closed');
    expect(s.body.payload).toBeNull();
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('calls', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'call', { name: 'name', args: [2, 3] });
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('[2,3]');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('calls async', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'call', { name: 'async', args: [2, 3] });
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('[2,3]');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('calls undef', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'call', { name: 'undef', args: [2, 3] });
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('null');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('calls error', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'call', { name: 'error', args: [2, 3] });
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
});

test('receives unexpected body type', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'type');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});
