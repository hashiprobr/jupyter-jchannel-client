export class Channel {
    constructor(client, key) {
        client.channels[key] = this;

        this.client = client;
        this.key = key;
        this.handler = null;
    }

    setHandler(handler) {
        if (typeof handler !== 'object') {
            throw new TypeError('Handler must be an object');
        }
        if (handler === null) {
            throw new Error('Handler cannot be null');
        }
        this.handler = handler;
    }

    handleCall(name, args) {
        if (this.handler === null) {
            throw new Error('Channel does not have handler');
        }

        const method = this.handler[name];

        if (typeof method !== 'function') {
            throw new Error(`Handler does not have method ${name}`);
        }

        return method(...args);
    }

    async echo(...args) {
        return await this.#send('echo', args);
    }

    async call(name, ...args) {
        return await this.#send('call', { name, args });
    }

    async #send(bodyType, input) {
        const future = await this.client._send(bodyType, input, this.key);

        return await future;
    }
}
