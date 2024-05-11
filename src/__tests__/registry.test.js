import loop from '../loop';

import { Registry } from '../registry';

jest.mock('../loop');

let r;

function createFuture() {
    return new Promise(() => { });
}

beforeAll(() => {
    loop.createFuture.mockImplementation(createFuture);
});

beforeEach(() => {
    r = new Registry();
});

afterAll(() => {
    jest.resetAllMocks();
});

test('stores and retrieves twice', () => {
    const future0 = loop.createFuture();
    const key0 = r.store(future0);
    expect(r.retrieve(key0)).toBe(future0);
    expect(() => r.retrieve(key0)).toThrow(Error);
    const future1 = loop.createFuture();
    const key1 = r.store(future1);
    expect(r.retrieve(key1)).toBe(future1);
    expect(() => r.retrieve(key1)).toThrow(Error);
});

test('stores and retrieves queue', () => {
    const future0 = loop.createFuture();
    const key0 = r.store(future0);
    const future1 = loop.createFuture();
    const key1 = r.store(future1);
    expect(r.retrieve(key0)).toBe(future0);
    expect(() => r.retrieve(key0)).toThrow(Error);
    expect(r.retrieve(key1)).toBe(future1);
    expect(() => r.retrieve(key1)).toThrow(Error);
});

test('stores and retrieves stack', () => {
    const future0 = loop.createFuture();
    const key0 = r.store(future0);
    const future1 = loop.createFuture();
    const key1 = r.store(future1);
    expect(r.retrieve(key1)).toBe(future1);
    expect(() => r.retrieve(key1)).toThrow(Error);
    expect(r.retrieve(key0)).toBe(future0);
    expect(() => r.retrieve(key0)).toThrow(Error);
});

test('stores and clears', () => {
    const future0 = loop.createFuture();
    const key0 = r.store(future0);
    const future1 = loop.createFuture();
    const key1 = r.store(future1);
    r.clear();
    expect(() => r.retrieve(key1)).toThrow(Error);
    expect(() => r.retrieve(key0)).toThrow(Error);
});
