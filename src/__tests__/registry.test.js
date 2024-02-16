import loop from '../loop';

import { jest } from '@jest/globals';
import { Registry } from '../registry';

let r;

function createFuture() {
    return new Promise(() => { });
}

beforeEach(() => {
    const spy = jest.spyOn(loop, 'createFuture');
    spy.mockImplementation(createFuture);
    r = new Registry();
});

afterEach(() => {
    jest.restoreAllMocks();
});

test('stores and retrieves twice', () => {
    const future0 = loop.createFuture();
    const key0 = r.store(future0);
    expect(r.retrieve(key0)).toBe(future0);
    expect(r.retrieve(key0)).toBeUndefined();
    const future1 = loop.createFuture();
    const key1 = r.store(future1);
    expect(r.retrieve(key1)).toBe(future1);
    expect(r.retrieve(key1)).toBeUndefined();
});

test('stores and retrieves queue', () => {
    const future0 = loop.createFuture();
    const key0 = r.store(future0);
    const future1 = loop.createFuture();
    const key1 = r.store(future1);
    expect(r.retrieve(key0)).toBe(future0);
    expect(r.retrieve(key0)).toBeUndefined();
    expect(r.retrieve(key1)).toBe(future1);
    expect(r.retrieve(key1)).toBeUndefined();
});

test('stores and retrieves stack', () => {
    const future0 = loop.createFuture();
    const key0 = r.store(future0);
    const future1 = loop.createFuture();
    const key1 = r.store(future1);
    expect(r.retrieve(key1)).toBe(future1);
    expect(r.retrieve(key1)).toBeUndefined();
    expect(r.retrieve(key0)).toBe(future0);
    expect(r.retrieve(key0)).toBeUndefined();
});
