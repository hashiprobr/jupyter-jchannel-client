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
const STREAM_KEY = 789;

let event, future, s;

function mockChannel(client, key) {
    const channel = {
        close() {
            delete client._channels[key];
        },

        _handle(name, args) {
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

async function send(c, bodyType, input = null, stream = null) {
    await c._send(bodyType, CHANNEL_KEY, input, stream);
}

async function open(c, code = '() => true') {
    await send(c, 'open', code);
}

beforeEach(() => {
    future = {
        setResult: jest.fn(),
        setException: jest.fn(),
    };

    event = new Promise((resolve) => {
        future.setResult.mockImplementation(() => {
            resolve();
        });
    });

    s = http.createServer();

    s.beating = false;
    s.body = null;
    s.status = null;
    s.gotten = null;
    s.posted = null;

    s.session = new Promise((resolve) => {
        const encoder = new TextEncoder();

        s.on('upgrade', (request, socket) => {
            function encode(bodyType, payload, streamKey) {
                const body = {
                    future: FUTURE_KEY,
                    channel: CHANNEL_KEY,
                    payload,
                };

                body.stream = streamKey;

                body.type = bodyType;

                const data = JSON.stringify(body);

                return encoder.encode(data);
            }

            function write(byte, bytes) {
                socket.write(new Uint8Array([byte, bytes.length, ...bytes]));
            }

            const key = request.headers['sec-websocket-key'];
            const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
            const accept = crypto.createHash('sha1')
                .update(`${key}${magic}`)
                .digest('base64');

            let running = true;

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
                        if (running) {
                            write(0b10001000, bytes);
                        }
                        socket.destroy();
                        resolve();
                        break;
                    }

                    if (code === 0xA) {
                        s.beating = true;
                    } else {
                        const data = bytes.toString();

                        const body = JSON.parse(data);

                        const bodyType = body.type;

                        switch (bodyType) {
                            case 'get-result':
                                write(0b10000001, encode('result', null, STREAM_KEY));
                                break;
                            case 'closed':
                            case 'exception':
                            case 'result':
                                s.body = body;
                            case 'socket-close':
                                socket.write(new Uint8Array([0b10001000, 0]));
                                running = false;
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
                                write(0b10000001, encode('exception', 'message', null));
                                break;
                            case 'mock-result':
                                write(0b10000001, encode('result', 'true', null));
                                break;
                            default:
                                write(0b10000001, encode(bodyType, body.payload, null));
                        }
                    }

                    chunk = chunk.subarray(end);
                }
            });

            s.on('request', (request, response) => {
                response.writeHead(200);
                response.end();
            });

            socket.write([
                'HTTP/1.1 101 Switching Protocols',
                'Connection: Upgrade',
                'Upgrade: WebSocket',
                `Sec-WebSocket-Accept: ${accept}`,
                '\r\n',
            ].join('\r\n'));
        });
    });

    s.start = () => {
        return new Promise((resolve) => {
            s.on('listening', () => {
                resolve();
            });

            s.listen(8889, 'localhost');
        });
    };

    s.stop = () => {
        return new Promise((resolve) => {
            s.on('close', () => {
                resolve();
            });

            s.session.then(() => {
                s.close();
            });
        });
    };
});

afterEach(() => {
    jest.restoreAllMocks();
});

test('does not connect and does not send', async () => {
    const error = jest.spyOn(console, 'error');
    const c = client();
    await expect(c._connection).rejects.toThrow(StateError);
    await expect(send(c, 'closed')).rejects.toThrow(StateError);
    await c._disconnection;
    expect(c._registry.clear).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenNthCalledWith(1, expect.any(String), expect.any(Event));
});

test('connects, errors, and does not send', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    const c = client();
    const socket = await c._connection;
    socket.dispatchEvent(new Event('error'));
    socket.close();
    await expect(send(c, 'closed')).rejects.toThrow(StateError);
    await c._disconnection;
    await s.stop();
    expect(c._registry.clear).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenNthCalledWith(1, expect.any(String), expect.any(Event));
});

test('connects, pings, and disconnects', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await send(c, 'socket-heart');
    await send(c, 'socket-close');
    await c._disconnection;
    await s.stop();
    expect(c._registry.clear).toHaveBeenCalledTimes(1);
    expect(s.beating).toBe(true);
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
    expect(error.message).toBe('message');
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
    expect(output).toBe(true);
});

test('opens twice', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await open(c);
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('true');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('opens async', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c, 'async () => true');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('true');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('opens undef', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c, '() => { }');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('null');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not open error', async () => {
    const error = jest.spyOn(console, 'error');
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
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
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
    await open(c, 'true');
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
    await open(c, true);
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('closes twice', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'close');
    await send(c, 'close');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('null');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
    expect(CHANNEL_KEY in c._channels).toBe(false);
});

test('echoes', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'echo', 3);
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('3');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not echo', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await send(c, 'echo', 3);
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
    await send(c, 'call', { name: 'name', args: [1, 2] });
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('[1,2]');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('calls async', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'call', { name: 'async', args: [1, 2] });
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('[1,2]');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('calls undef', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'call', { name: 'undef', args: [1, 2] });
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('null');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does not call error', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'call', { name: 'error', args: [1, 2] });
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

test('does not call with empty input', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'call', {});
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

test('does not call with non-string name', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'call', { name: true, args: [1, 2] });
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.any(String), expect.any(TypeError));
});

test('does not call with non-array args', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    const c = client();
    await c._connection;
    await open(c);
    await send(c, 'call', { name: 'name', args: true });
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('exception');
    expect(typeof s.body.payload).toBe('string');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.any(String), expect.any(TypeError));
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

test('does result get', async () => {
    await s.start();
    const c = client();
    await c._connection;
    await send(c, 'get-result');

    await event;

    const [args] = future.setResult.mock.calls;
    const [chunks] = args;

    for await (const chunk of chunks) {
        console.log(chunk);
    }

    await send(c, 'socket-close');
    await c._disconnection;
    await s.stop();
});
