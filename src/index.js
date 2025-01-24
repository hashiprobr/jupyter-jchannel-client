/*
 * Copyright (c) 2024 Marcelo Hashimoto
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import { Channel } from './channel';
import { Client } from './client';

export class Index {
    #clients;

    constructor() {
        this.#clients = {};
    }

    start(url, mms) {
        const next = this.#start(url, mms, this.#clients[url]);
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

    async #start(url, mms, prev) {
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

        return new Client(url, mms);
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

export { Channel };
