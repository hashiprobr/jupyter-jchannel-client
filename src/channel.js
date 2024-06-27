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
        if (typeof value !== 'object') {
            throw new TypeError('Handler must be an object');
        }
        if (value === null) {
            throw new Error('Handler cannot be null');
        }
        this.#handler = value;
    }

    _handleCall(name, args) {
        const method = this.#method(name);

        return method(...args);
    }

    #method(name) {
        if (this.#handler === null) {
            throw new Error('Channel does not have handler');
        }

        const method = this.#handler[name];

        if (typeof method !== 'function') {
            throw new Error(`Handler does not have method ${name}`);
        }

        return method;
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
        return await this.#send('echo', args, null, null);
    }

    /**
     * Makes a call to the server.
     *
     * @param {string} name The name of a server handler method.
     * @param {any} args The arguments of the call.
     * @returns {any} The return value of the method.
     */
    async call(name, ...args) {
        return await this.#send('call', { name, args }, null, null);
    }

    async #send(bodyType, input, producer, consumer) {
        if (this.#client === null) {
            throw new StateError('Channel is closed');
        }

        const future = await this.#client._send(bodyType, this.#key, input, producer, consumer);

        return await future;
    }
}
