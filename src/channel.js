import { StateError } from './types';

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

    close() {
        delete this.#client._channels[this.#key];

        this.#client = null;
    }

    set handler(handler) {
        if (typeof handler !== 'object') {
            throw new TypeError('Handler must be an object');
        }
        if (handler === null) {
            throw new Error('Handler cannot be null');
        }
        this.#handler = handler;
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

    async echo(...args) {
        return await this.#send('echo', args);
    }

    async call(name, ...args) {
        return await this.#send('call', { name, args });
    }

    async #send(bodyType, input) {
        if (this.#client === null) {
            throw new StateError('Channel is closed');
        }

        const future = await this.#client._send(bodyType, input, this.#key);

        return await future;
    }
}
