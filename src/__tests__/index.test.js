import { Client } from '../client';
import { Index } from '../index';

jest.mock('../client', () => {
    return {
        Client: jest.fn(),
    };
});

const URL = 'ws://a';

let i;

function createClient(readyState) {
    return {
        connection: new Promise((resolve, reject) => {
            if (readyState) {
                resolve({ readyState });
            } else {
                reject(new Error());
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

test('starts once and does not restart', async () => {
    const client = createClient(WebSocket.OPEN);
    Client.mockImplementation(createConstructor(client));
    await expect(i.start(URL)).resolves.toBe(client);
    await expect(i.start(URL)).resolves.toBe(client);
});

test('starts twice', async () => {
    const client0 = createClient(WebSocket.CLOSED);
    Client.mockImplementation(createConstructor(client0));
    await expect(i.start(URL)).resolves.toBe(client0);
    const client1 = createClient(WebSocket.OPEN);
    Client.mockImplementation(createConstructor(client1));
    await expect(i.start(URL)).resolves.toBe(client1);
});

test('starts and restarts', async () => {
    const warn = jest.spyOn(console, 'warn');
    const client0 = createClient();
    Client.mockImplementation(createConstructor(client0));
    await expect(i.start(URL)).resolves.toBe(client0);
    const client1 = createClient(WebSocket.OPEN);
    Client.mockImplementation(createConstructor(client1));
    await expect(i.start(URL)).resolves.toBe(client1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.any(String));
});
