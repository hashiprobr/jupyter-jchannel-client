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

const FUTURE_KEY = 12;
const CHANNEL_KEY = 34;
const STREAM_KEY = 56;
const QUEUE_KEY = 78;

const CONTENT_LENGTH = 1024;

let encoder;
let future;
let event;
let s;

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
            if (name === 'octet') {
                async function* generate() {
                    for await (const chunk of args[0].byLimit()) {
                        yield chunk;
                    }
                }
                return generate();
            }
            if (name === 'plain') {
                return this._consume(args);
            }
            if (name === 'async') {
                return this._resolve(args);
            }
            return args;
        },

        async _consume(args) {
            let arg = 0;
            for await (const chunk of args[0].bySeparator()) {
                arg += chunk.length;
            }
            args[0] = arg;
            return args;
        },

        async _resolve(args) {  // eslint-disable-line require-await
            return args;
        },
    };

    client._channels[key] = channel;

    return channel;
}

class AbstractConnection {
    constructor(socket) {
        this.running = true;
        this.socket = socket;
    }

    close() {
        this.running = false;
        this.socket.write(new Uint8Array([0b10001000, 0]));
    }

    write(byte, bytes) {
        this.socket.write(new Uint8Array([byte, bytes.length, ...bytes]));
    }

    prepare(headers) {
        const key = headers['sec-websocket-key'];
        const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
        const accept = crypto.createHash('sha1')
            .update(`${key}${magic}`)
            .digest('base64');

        this.socket.on('data', (chunk) => {
            while (chunk.length > 0) {
                const code = chunk[0] & 0b00001111;
                let length = chunk[1] & 0b01111111;

                let start;
                let bytes;

                if (length < 126) {
                    start = 2;
                } else {
                    if (length < 127) {
                        bytes = chunk.subarray(2, 4);
                    } else {
                        bytes = chunk.subarray(2, 10);
                    }

                    length = 0;

                    for (const byte of bytes) {
                        length = length << 8 | byte;
                    }

                    start = 2 + bytes.length;
                }

                const middle = start + 4;
                const end = middle + length;

                const mask = chunk.subarray(start, middle);
                bytes = chunk.subarray(middle, end);

                for (let i = 0; i < bytes.length; i++) {
                    bytes[i] ^= mask[i % 4];
                }

                if (code === 0x8) {
                    if (this.running) {
                        this.write(0b10001000, bytes);
                    }
                    this.socket.destroy();
                    this.postDestroy();
                    break;
                }

                this.onFrame(bytes, code);

                chunk = chunk.subarray(end);
            }
        });

        this.socket.write([
            'HTTP/1.1 101 Switching Protocols',
            'Connection: Upgrade',
            'Upgrade: WebSocket',
            `Sec-WebSocket-Accept: ${accept}`,
            '\r\n',
        ].join('\r\n'));

        this.postPrepare();
    }
}

class Connection extends AbstractConnection {
    constructor(socket, postDestroy) {
        super(socket);
        this.postDestroy = postDestroy;
    }

    encode(bodyType, payload, streamKey) {
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

    handleGet(bodyType, payload) {
        async function* generate() {
            for (let i = 0; i < CONTENT_LENGTH; i++) {
                const b = encoder.encode(String(i));
                s.gotten.push(...b);
                yield b;
            }
        }

        s.stream = generate();

        this.write(0b10000001, this.encode(bodyType, payload, STREAM_KEY));
    }

    handleCall(name) {
        const payload = `{"name":"${name}","args":[1,2]}`;

        this.handleGet('call', payload);
    }

    onFrame(bytes, code) {
        if (code === 0xA) {
            s.beating = true;
            return;
        }

        const data = bytes.toString();

        const body = JSON.parse(data);

        const bodyType = body.type;

        switch (bodyType) {
            case 'get-invalid':
                this.write(0b10000001, this.encode('type', 'null', 0));
                break;
            case 'get-octet':
                this.handleCall('octet');
                break;
            case 'get-plain':
                this.handleCall('plain');
                break;
            case 'get-pipe':
                this.handleGet('pipe', 'null');
                break;
            case 'get-result':
                this.handleGet('result', null);
                break;
            case 'closed':
            case 'exception':
            case 'result':
                if (s.shield) {
                    s.shield--;
                    break;
                } else {
                    s.body = body;
                }
            case 'socket-close':
                this.close();
                break;
            case 'socket-heart':
                this.socket.write(new Uint8Array([0b10001001, 0]));
                break;
            case 'socket-bytes':
                this.socket.write(new Uint8Array([0b10000010, 0]));
                break;
            case 'empty-message':
                this.socket.write(new Uint8Array([0b10000001, 0]));
                break;
            case 'empty-body':
                this.socket.write(new Uint8Array([0b10000001, 2, 123, 125]));
                break;
            case 'mock-exception':
                this.write(0b10000001, this.encode('exception', 'message', null));
                break;
            case 'mock-result':
                this.write(0b10000001, this.encode('result', 'true', null));
                break;
            default:
                this.write(0b10000001, this.encode(bodyType, body.payload, null));
        }
    }

    postPrepare() {
        s.on('request', async (request, response) => {
            if (request.method === 'GET') {
                const streamKey = Number(request.headers['x-jchannel-stream']);

                if (streamKey === STREAM_KEY) {
                    for await (const chunk of s.stream) {
                        response.write(chunk);
                    }
                } else {
                    response.statusCode = 400;
                }
            } else {
                const data = request.headers['x-jchannel-data'];

                const body = JSON.parse(data);

                switch (body.type) {
                    case 'result':
                        // await new Promise((resolve) => {
                        //     request.on('data', (chunk) => {
                        //         s.posted.push(...chunk);
                        //     });
                        //
                        //     request.on('end', () => {
                        //         resolve();
                        //     });
                        // });

                        await new Promise((resolve) => {
                            request.on('data', () => { });
                            request.on('end', resolve);
                        });
                        response.write('200');
                        s.body = body;
                        this.close();
                        break;
                    case 'post-invalid':
                        // response.statusCode = 503;

                        response.write('503');
                        this.close();
                        break;
                    default:
                        response.statusCode = 400;
                }
            }

            response.end();
        });
    }
}

class StreamConnection extends AbstractConnection {  // pseudo-stream
    constructor(socket) {
        super(socket);
        this.postDestroy = () => { };
    }

    onFrame(bytes) {
        if (bytes.length) {
            s.posted.push(...bytes);
        } else {
            this.write(0b10000010, bytes);
        }
    }

    postPrepare() {
        this.write(0b10000001, encoder.encode(String(QUEUE_KEY)));
    }
}

function createClient() {
    const registry = {
        store: jest.fn(),
        retrieve: jest.fn(),
        clear: jest.fn(),
    };

    Registry.mockReturnValue(registry);

    registry.store.mockReturnValue(FUTURE_KEY);
    registry.retrieve.mockReturnValue(future);

    Channel.mockImplementation(mockChannel);

    return new Client('http://localhost:8889', 2048);
}

async function send(c, bodyType, input = null, stream = undefined) {
    await c._send(bodyType, CHANNEL_KEY, input, stream);
}

async function open(c, code = '() => true') {
    await send(c, 'open', code);
}

beforeEach(() => {
    encoder = new TextEncoder();

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
    s.shield = 0;
    s.stream = null;
    s.gotten = [];
    s.posted = [];

    s.session = new Promise((resolve) => {
        s.on('upgrade', (request, socket) => {
            // const connection = new Connection(socket, resolve);

            let connection;

            if (request.url === '/socket') {
                connection = new Connection(socket, resolve);
            } else {
                connection = new StreamConnection(socket);
            }

            connection.prepare(request.headers);
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

test('does not send with invalid stream', async () => {
    const c = createClient();
    await expect(c._connection).rejects.toThrow(StateError);
    await expect(send(c, 'closed', null, true)).rejects.toThrow(TypeError);
    await c._disconnection;
});

test('does not connect and does not send', async () => {
    const error = jest.spyOn(console, 'error');
    const c = createClient();
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
    const c = createClient();
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
    const c = createClient();
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
    const c = createClient();
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
    const c = createClient();
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
    const c = createClient();
    await c._connection;
    await send(c, 'empty-body');
    await c._disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenNthCalledWith(1, expect.any(String), expect.any(Error));
});

test('receives exception', async () => {
    await s.start();
    const c = createClient();
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
    const c = createClient();
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
    s.shield += 1;
    await s.start();
    const c = createClient();
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
    const c = createClient();
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
    const c = createClient();
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
    const c = createClient();
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
    const c = createClient();
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
    const c = createClient();
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
    const c = createClient();
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
    s.shield += 2;
    await s.start();
    const c = createClient();
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
    s.shield += 1;
    await s.start();
    const c = createClient();
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
    const c = createClient();
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
    s.shield += 1;
    await s.start();
    const c = createClient();
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
    s.shield += 1;
    await s.start();
    const c = createClient();
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
    s.shield += 1;
    await s.start();
    const c = createClient();
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
    s.shield += 1;
    await s.start();
    const c = createClient();
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
    s.shield += 1;
    await s.start();
    const c = createClient();
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
    s.shield += 1;
    await s.start();
    const c = createClient();
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
    s.shield += 1;
    await s.start();
    const c = createClient();
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
    s.shield += 1;
    await s.start();
    const c = createClient();
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
    const c = createClient();
    await c._connection;
    await send(c, 'get-result');

    await event;

    const [args] = future.setResult.mock.calls;
    const [chunks] = args;

    const content = await chunks.join();

    await send(c, 'socket-close');
    await c._disconnection;
    await s.stop();

    expect(content).toStrictEqual(new Uint8Array(s.gotten));
});

test('does pipe get', async () => {
    s.shield += 1;
    await s.start();
    const c = createClient();
    await c._connection;
    await open(c);
    await send(c, 'get-pipe');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('null');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);

    expect(s.posted).toStrictEqual(s.gotten);
});

test('does plain get', async () => {
    let arg = 0;

    for (let i = 0; i < CONTENT_LENGTH; i++) {
        arg += String(i).length;
    }

    s.shield += 1;
    await s.start();
    const c = createClient();
    await c._connection;
    await open(c);
    await send(c, 'get-plain');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe(`[${arg},1,2]`);
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
});

test('does octet get', async () => {
    s.shield += 1;
    await s.start();
    const c = createClient();
    await c._connection;
    await open(c);
    await send(c, 'get-octet');
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('null');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);

    expect(s.posted).toStrictEqual(s.gotten);
});

test('does not do invalid get', async () => {
    const error = jest.spyOn(console, 'error');
    await s.start();
    const c = createClient();
    await c._connection;
    await send(c, 'get-invalid');
    await c._disconnection;
    await s.stop();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
});

test('does partial post', async () => {
    async function* generatePartial() {
        yield encoder.encode('chunk');
        yield new Uint8Array();
        throw new Error();
    }

    const error = jest.spyOn(console, 'error');
    await s.start();
    const c = createClient();
    await c._connection;
    await send(c, 'result', null, generatePartial());
    await c._disconnection;
    await s.stop();
    expect(Object.keys(s.body)).toHaveLength(4);
    expect(s.body.type).toBe('result');
    expect(s.body.payload).toBe('null');
    expect(s.body.channel).toBe(CHANNEL_KEY);
    expect(s.body.future).toBe(FUTURE_KEY);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.any(String), expect.any(Error));

    expect(s.posted).toStrictEqual([99, 104, 117, 110, 107]);
});

test('does not do invalid post', async () => {
    async function* generate() {
        for (let i = 0; i < CONTENT_LENGTH; i++) {
            yield encoder.encode(String(i));
        }
    }

    await s.start();
    const c = createClient();
    await c._connection;
    await expect(() => send(c, 'post-shield', null, generate())).rejects.toThrow(Error);
    await expect(() => send(c, 'post-invalid', null, generate())).rejects.toThrow(Error);
    await c._disconnection;
    await s.stop();
});
