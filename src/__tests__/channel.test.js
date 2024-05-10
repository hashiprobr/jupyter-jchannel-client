import { Channel } from '../channel';

const KEY = 0;

let client, c;

beforeEach(() => {
    client = {
        channels: [],

        async _send(bodyType, input, key) {
            return Promise.resolve([bodyType, input, key]);
        },
    };

    c = new Channel(client, KEY);
});

afterEach(() => {
    jest.resetAllMocks();
});

test('instantiates', () => {
    expect(client.channels[KEY]).toBe(c);
    expect(c.client).toBe(client);
    expect(c.key).toBe(KEY);
    expect(c.handler).toBeNull();
});

test('sets handler', () => {
    const handler = {};
    c.setHandler(handler);
    expect(c.handler).toBe(handler);
});

test('does not set non-object handler', () => {
    expect(() => c.setHandler(0)).toThrow(TypeError);
});

test('does not set null handler', () => {
    expect(() => c.setHandler(null)).toThrow(Error);
});

test('handles call with result', () => {
    c.setHandler({
        name(a, b) {
            return a + b;
        },
    });
    expect(c.handleCall('name', [2, 3])).toBe(5);
});

test('handles call with exception', () => {
    c.setHandler({
        name(a, b) {
            throw Error();
        },
    });
    expect(() => c.handleCall('name', [2, 3])).toThrow(Error);
});

test('does not handle call without handler', () => {
    expect(() => c.handleCall('name', [2, 3])).toThrow(Error);
});

test('does not handle call without handler method', () => {
    c.setHandler({});
    expect(() => c.handleCall('name', [2, 3])).toThrow(Error);
});

test('echoes', async () => {
    const output = ['echo', [2, 3], KEY]
    await expect(c.echo(2, 3)).resolves.toStrictEqual(output);
});

test('calls', async () => {
    const output = ['call', { name: 'name', args: [2, 3] }, KEY]
    await expect(c.call('name', 2, 3)).resolves.toStrictEqual(output);
});
