import { Client } from '../client';
import { Index } from '../index';

jest.mock('../client', () => {
    return {
        Client: jest.fn(),
    };
});

const URL = 'ws://s';

let i;

function createClient(readyState) {
    return {
        connection: new Promise((resolve, reject) => {
            if (readyState === null) {
                reject(new Error());
            } else {
                resolve({ readyState });
            }
        }),
    };
}

function createConstructor(client) {
    return (url) => {
        expect(url).toBe(URL);
        return client;
    };
}

beforeEach(() => {
    i = new Index();
});

afterEach(() => {
    jest.restoreAllMocks();
});

test('starts and does not restart', async () => {
    const client = createClient(WebSocket.OPEN);
    Client.mockImplementation(createConstructor(client));
    await expect(i.start(URL)).resolves.toBe(client);
    await expect(i.start(URL)).resolves.toBe(client);
});

test('starts and restarts', async () => {
    const client0 = createClient(WebSocket.CLOSED);
    Client.mockImplementation(createConstructor(client0));
    await expect(i.start(URL)).resolves.toBe(client0);
    const client1 = createClient(WebSocket.OPEN);
    Client.mockImplementation(createConstructor(client1));
    await expect(i.start(URL)).resolves.toBe(client1);
});

test('does not start and starts', async () => {
    const warn = jest.spyOn(console, 'warn');
    const client0 = createClient(null);
    Client.mockImplementation(createConstructor(client0));
    await expect(i.start(URL)).resolves.toBe(client0);
    const client1 = createClient(WebSocket.OPEN);
    Client.mockImplementation(createConstructor(client1));
    await expect(i.start(URL)).resolves.toBe(client1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.any(String));
});
