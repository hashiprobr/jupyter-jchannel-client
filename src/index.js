import { Client } from './client';

export class Index {
    #clients;

    constructor() {
        this.#clients = {};
    }

    start(url) {
        const next = this.#start(url, this.#clients[url]);
        this.#clients[url] = next;
        return next;
    }

    stop(url) {
        const none = this.#stop(this.#clients[url]);
        this._unload(url);
        return none;
    }

    _unload(url) {
        delete this.#clients[url];
    }

    async #start(url, prev) {
        if (prev) {
            const client = await prev;

            try {
                const socket = await client._connection;

                if (socket.readyState === WebSocket.OPEN) {
                    return client;
                }

                console.warn('Client has disconnected: trying to reconnect...');
            } catch (error) {
                console.warn('Client not connected: trying to connect...');
            }
        }

        return new Client(url);
    }

    async #stop(prev) {
        if (prev) {
            const client = await prev;

            try {
                const socket = await client._connection;

                if (socket.readyState === WebSocket.OPEN) {
                    socket.close();

                    return;
                }

                console.warn('Client already disconnected');
            } catch (error) {
                console.warn('Client never connected');
            }
        }
    }
}

export default new Index();
