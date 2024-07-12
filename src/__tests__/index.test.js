import { Client } from '../client';
import { Index } from '../index';

jest.mock('../client', () => {
    return {
        Client: jest.fn(),
    };
});

const URL = 'http://localhost:8889';
const MMS = 2048;

let i;

function mockClient(readyState) {
    const client = {
        _connection: new Promise((resolve, reject) => {
            if (readyState === null) {
                reject(new Error());
            } else {
                resolve({
                    readyState,
                    close: jest.fn(),
                });
            }
        }),
    };

    Client.mockImplementation((url) => {
        expect(url).toBe(URL);
        return client;
    });

    return client;
}

function start() {
    return i.start(URL, MMS);
}

function stop() {
    return i.stop(URL);
}

beforeEach(() => {
    i = new Index();
});

afterEach(() => {
    jest.restoreAllMocks();
});

test('stops, starts, connects, starts, and stops', async () => {
    await stop();
    const client = mockClient(WebSocket.OPEN);
    await expect(start()).resolves.toBe(client);
    await expect(start()).resolves.toBe(client);
    await stop();
    const socket = await client._connection;
    expect(socket.close).toHaveBeenCalledTimes(1);
});

test('starts, connects, disconnects, stops, starts, connects, and stops', async () => {
    const warn = jest.spyOn(console, 'warn');
    const client0 = mockClient(WebSocket.CLOSED);
    await expect(start()).resolves.toBe(client0);
    await stop();
    const client1 = mockClient(WebSocket.OPEN);
    await expect(start()).resolves.toBe(client1);
    await stop();
    const socket0 = await client0._connection;
    expect(socket0.close).toHaveBeenCalledTimes(0);
    const socket1 = await client1._connection;
    expect(socket1.close).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.any(String));
});

test('starts, connects, disconnects, starts, reconnects, and stops', async () => {
    const warn = jest.spyOn(console, 'warn');
    const client0 = mockClient(WebSocket.CLOSED);
    await expect(start()).resolves.toBe(client0);
    const client1 = mockClient(WebSocket.OPEN);
    await expect(start()).resolves.toBe(client1);
    await stop();
    const socket0 = await client0._connection;
    expect(socket0.close).toHaveBeenCalledTimes(0);
    const socket1 = await client1._connection;
    expect(socket1.close).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.any(String));
});

test('starts, does not connect, stops, starts, connects, and stops', async () => {
    const warn = jest.spyOn(console, 'warn');
    const client0 = mockClient(null);
    await expect(start()).resolves.toBe(client0);
    await stop();
    const client1 = mockClient(WebSocket.OPEN);
    await expect(start()).resolves.toBe(client1);
    await stop();
    await expect(client0._connection).rejects.toThrow(Error);
    const socket1 = await client1._connection;
    expect(socket1.close).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.any(String));
});

test('starts, does not connect, starts, connects, and stops', async () => {
    const warn = jest.spyOn(console, 'warn');
    const client0 = mockClient(null);
    await expect(start()).resolves.toBe(client0);
    const client1 = mockClient(WebSocket.OPEN);
    await expect(start()).resolves.toBe(client1);
    await stop();
    await expect(client0._connection).rejects.toThrow(Error);
    const socket1 = await client1._connection;
    expect(socket1.close).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.any(String));
});
