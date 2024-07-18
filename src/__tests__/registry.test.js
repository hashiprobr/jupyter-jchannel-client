/*
 * Copyright (c) 2024 Marcelo Hashimoto
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import loop from '../loop';

import { Registry } from '../registry';

jest.mock('../loop');

let r;

beforeEach(() => {
    loop.createFuture.mockImplementation(() => {
        return {
            cancel: jest.fn(),
        };
    });

    r = new Registry();
});

afterEach(() => {
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
    expect(future1.cancel).toHaveBeenCalledWith(expect.any(String));
    expect(() => r.retrieve(key0)).toThrow(Error);
    expect(future0.cancel).toHaveBeenCalledWith(expect.any(String));
});
