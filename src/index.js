import { Client } from './client';

export class Index {
    constructor() {
        this.clients = {};
    }

    start(url) {
        const next = this._start(url, this.clients[url]);

        this.clients[url] = next;

        return next;
    }

    async _start(url, prev) {
        if (prev) {
            const client = await prev;

            try {
                const socket = await client.connection;

                if (socket.readyState === WebSocket.OPEN) {
                    return client;
                }
            } catch (error) {
                console.warn('Unexpected client restart');
            }
        }

        return new Client(url);
    }
}

export default new Index();
