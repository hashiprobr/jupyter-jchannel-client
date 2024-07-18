/*
 * Copyright (c) 2024 Marcelo Hashimoto
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import { StateError } from './types';

/**
 * Represents a communication channel between a frontend client and a kernel
 * server.
 *
 * @hideconstructor
 */
export class Channel {
    #client;
    #key;
    #handler;

    constructor(client, key) {
        client._channels[key] = this;

        this.#client = client;
        this.#key = key;
        this.#handler = null;
    }

    /**
     * Closes this channel.
     *
     * Under normal circumstances, this method should not be called. It should
     * only be called for debugging or testing purposes.
     *
     * A closed channel cannot be used for anything. There is no reason to keep
     * references to it.
     *
     * @throws {StateError} If this channel is already closed.
     */
    close() {
        if (this.#client === null) {
            throw new StateError('Channel already closed');
        }

        delete this.#client._channels[this.#key];

        this.#client = null;
    }

    /**
     * The object that handles calls from the server.
     *
     * @type {object}
     */
    get handler() {
        return this.#handler;
    }

    set handler(value) {
        this.#handler = value;
    }

    _handle(name, args) {
        if (this.#handler === null) {
            throw new Error('Channel does not have handler');
        }

        if (typeof this.#handler !== 'object') {
            throw new TypeError('Handler must be an object');
        }

        const method = this.#handler[name];

        if (typeof method !== 'function') {
            throw new Error(`Handler does not have method ${name}`);
        }

        return method(...args);
    }

    /**
     * Sends arguments to the server and receives them back.
     *
     * Under normal circumstances, this method should not be called. It should
     * only be called for debugging or testing purposes.
     *
     * It is particularly useful to verify whether the arguments are robust to
     * JSON serialization and deserialization.
     *
     * @param {any} args The arguments.
     * @returns {Array} The same arguments as an array.
     */
    async echo(...args) {
        return await this.#send('echo', args);
    }

    /**
     * Sends a byte stream to the server and receives it back.
     *
     * Under normal circumstances, this method should not be called. It should
     * only be called for debugging or testing purposes.
     *
     * It is particularly useful to verify whether the bytes are robust to GET
     * and POST streaming.
     *
     * @param {object} stream An async iterable of Uint8Array instances.
     * @returns {MetaGenerator} The same bytes as a meta generator.
     */
    async pipe(stream) {
        return await this.#send('pipe', null, stream);
    }

    /**
     * Makes a call to the server.
     *
     * @param {string} name The name of a server handler method.
     * @param {any} args The arguments of the call.
     * @returns {any} The return value of the method.
     */
    async call(name, ...args) {
        return await this.#send('call', { name, args }, undefined);
    }

    /**
     * Makes a call to the server with a byte stream as its first argument. The
     * method receives it as a
     * {@link https://jupyter-jchannel.readthedocs.io/en/latest/jchannel.types.html#jchannel.types.MetaGenerator|server MetaGenerator}.
     *
     * @param {string} name The name of a server handler method.
     * @param {object} stream The first argument of the call, an async iterable
     * of Uint8Array instances.
     * @param {any} args The other arguments of the call.
     * @returns {any} The return value of the method.
     */
    async callWithStream(name, stream, ...args) {
        return await this.#send('call', { name, args }, stream);
    }

    async #send(bodyType, input, stream) {
        if (this.#client === null) {
            throw new StateError('Channel is closed');
        }

        const future = await this.#client._send(bodyType, this.#key, input, stream);

        return await future;
    }
}
