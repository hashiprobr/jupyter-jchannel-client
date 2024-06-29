import { StateError } from '../types';
import { Channel } from '../channel';

const KEY = 123;

let client, c;

beforeEach(() => {
    client = {
        _channels: {},

        async _send(bodyType, key, input, producer) {  // eslint-disable-line require-await
            return Promise.resolve([bodyType, key, input, producer]);
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

test('does not set non-object handler', () => {
    expect(() => {
        c.handler = true;
    }).toThrow(TypeError);
});

test('does not set null handler', () => {
    expect(() => {
        c.handler = null;
    }).toThrow(Error);
});

test('handles call with result', () => {
    c.handler = {
        name(a, b) {
            return a + b;
        },
    };
    expect(c._handleCall('name', [1, 2])).toBe(3);
});

test('handles call with exception', () => {
    c.handler = {
        name() {
            throw Error();
        },
    };
    expect(() => c._handleCall('name', [1, 2])).toThrow(Error);
});

test('does not handle call without handler', () => {
    expect(() => c._handleCall('name', [1, 2])).toThrow(Error);
});

test('does not handle call without handler method', () => {
    c.handler = {};
    expect(() => c._handleCall('name', [1, 2])).toThrow(Error);
});

test('echoes', async () => {
    const output = ['echo', KEY, [1, 2], null];
    await expect(c.echo(1, 2)).resolves.toStrictEqual(output);
});

test('calls', async () => {
    const output = ['call', KEY, { name: 'name', args: [1, 2] }, null];
    await expect(c.call('name', 1, 2)).resolves.toStrictEqual(output);
});

test('closes, does not call, and does not close', async () => {
    c.close();
    expect(KEY in client._channels).toBe(false);
    await expect(c.call('name', 1, 2)).rejects.toThrow(StateError);
    expect(() => c.close()).toThrow(StateError);
});
