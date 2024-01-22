import { jest } from '@jest/globals';
import loop from '../loop';
import { Registry } from '../registry';

let registry;

beforeEach(() => {
    jest.spyOn(loop, 'createFuture').mockImplementation(() => ({}));
    registry = new Registry();
});

test('stores and retrieves serial', () => {
    const future0 = loop.createFuture();
    const key0 = registry.store(future0);
    expect(registry.retrieve(key0)).toBe(future0);
    expect(registry.retrieve(key0)).toBeUndefined();
    const future1 = loop.createFuture();
    const key1 = registry.store(future1);
    expect(registry.retrieve(key1)).toBe(future1);
    expect(registry.retrieve(key1)).toBeUndefined();
});

test('stores and retrieves parallel', () => {
    const future0 = loop.createFuture();
    const key0 = registry.store(future0);
    const future1 = loop.createFuture();
    const key1 = registry.store(future1);
    expect(registry.retrieve(key0)).toBe(future0);
    expect(registry.retrieve(key0)).toBeUndefined();
    expect(registry.retrieve(key1)).toBe(future1);
    expect(registry.retrieve(key1)).toBeUndefined();
});

test('stores and retrieves reversed', () => {
    const future0 = loop.createFuture();
    const key0 = registry.store(future0);
    const future1 = loop.createFuture();
    const key1 = registry.store(future1);
    expect(registry.retrieve(key1)).toBe(future1);
    expect(registry.retrieve(key1)).toBeUndefined();
    expect(registry.retrieve(key0)).toBe(future0);
    expect(registry.retrieve(key0)).toBeUndefined();
});
