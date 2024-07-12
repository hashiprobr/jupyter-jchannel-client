import { StateError } from '../types';
import { Channel } from '../channel';

const KEY = 123;

let client, c;

beforeEach(() => {
    client = {
        _channels: {},

        async _send(bodyType, key, input, stream) {  // eslint-disable-line require-await
            return Promise.resolve([bodyType, key, input, stream]);
        },
    };

    c = new Channel(client, KEY);
});

afterEach(() => {
    jest.resetAllMocks();
});

test('instantiates', () => {
    expect(client._channels[KEY]).toBe(c);
    expect(c.handler).toBeNull();
});

test('handles with result', () => {
    c.handler = {
        name(a, b) {
            return a + b;
        },
    };
    expect(c._handle('name', [1, 2])).toBe(3);
});

test('handles with exception', () => {
    c.handler = {
        name() {
            throw new Error();
        },
    };
    expect(() => c._handle('name', [1, 2])).toThrow(Error);
});

test('does not handle without handler', () => {
    expect(() => c._handle('name', [1, 2])).toThrow(Error);
});

test('does not handle with non-object handler', () => {
    c.handler = true;
    expect(() => c._handle('name', [1, 2])).toThrow(Error);
});

test('does not handle without handler method', () => {
    c.handler = {};
    expect(() => c._handle('name', [1, 2])).toThrow(Error);
});

test('echoes', async () => {
    const output = ['echo', KEY, [1, 2], undefined];
    await expect(c.echo(1, 2)).resolves.toStrictEqual(output);
});

test('pipes', async () => {
    const stream = {};
    const output = ['pipe', KEY, null, stream];
    await expect(c.pipe(stream)).resolves.toStrictEqual(output);
});

test('calls', async () => {
    const output = ['call', KEY, { name: 'name', args: [1, 2] }, undefined];
    await expect(c.call('name', 1, 2)).resolves.toStrictEqual(output);
});

test('calls with stream', async () => {
    const stream = {};
    const output = ['call', KEY, { name: 'name', args: [1, 2] }, stream];
    await expect(c.callWithStream('name', stream, 1, 2)).resolves.toStrictEqual(output);
});

test('closes, does not call, and does not close', async () => {
    c.close();
    expect(KEY in client._channels).toBe(false);
    await expect(c.call('name', 1, 2)).rejects.toThrow(StateError);
    expect(() => c.close()).toThrow(StateError);
});
