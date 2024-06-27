import loop from './loop';

import { KernelError, StateError } from './types';
import { Registry } from './registry';
import { Channel } from './channel';

export class Client {
    constructor(url) {
        const socket = new WebSocket(`ws${url.slice(4)}/socket`);

        socket.addEventListener('message', async (event) => {
            try {
                const messageType = typeof event.data;

                if (messageType !== 'string') {
                    throw new TypeError(`Unexpected message type ${messageType}`);
                }

                const body = JSON.parse(event.data);

                const futureKey = this.#get(body, 'future');
                const channelKey = this.#get(body, 'channel');
                let payload = this.#pop(body, 'payload');
                let bodyType = this.#pop(body, 'type');

                let future;
                let channel;
                let input;
                let output;

                switch (bodyType) {
                    case 'exception':
                        future = this._registry.retrieve(futureKey);
                        future.setException(new KernelError(payload));
                        break;
                    case 'result':
                        output = JSON.parse(payload);

                        future = this._registry.retrieve(futureKey);
                        future.setResult(output);
                        break;
                    default:
                        input = JSON.parse(payload);

                        channel = this._channels[channelKey];

                        switch (bodyType) {
                            case 'open':
                                if (channel) {
                                    payload = channel._payload;
                                    bodyType = 'result';
                                } else {
                                    if (typeof input === 'string') {
                                        try {
                                            const method = window.eval(input);

                                            if (typeof method === 'function') {
                                                channel = new Channel(this, channelKey);

                                                output = method(channel);
                                                if (output instanceof Promise) {
                                                    output = await output;
                                                }

                                                payload = JSON.stringify(output);
                                                if (typeof payload === 'undefined') {
                                                    payload = 'null';
                                                }

                                                channel._payload = payload;
                                                bodyType = 'result';
                                            } else {
                                                payload = 'Code must represent a function';
                                                bodyType = 'exception';
                                            }
                                        } catch (error) {
                                            console.error('Channel opening exception', error);

                                            payload = String(error);
                                            bodyType = 'exception';
                                        }
                                    } else {
                                        payload = 'Code must be a string';
                                        bodyType = 'exception';
                                    }
                                }
                                break;
                            case 'close':
                                if (channel) {
                                    channel.close();
                                }
                                payload = 'null';
                                bodyType = 'result';
                                break;
                            default: {
                                if (channel) {
                                    try {
                                        switch (bodyType) {
                                            case 'echo':
                                                bodyType = 'result';
                                                break;
                                            case 'call':
                                                output = channel._handleCall(input.name, input.args);
                                                if (output instanceof Promise) {
                                                    output = await output;
                                                }

                                                payload = JSON.stringify(output);
                                                if (typeof payload === 'undefined') {
                                                    payload = 'null';
                                                }

                                                bodyType = 'result';
                                                break;
                                            default:
                                                payload = `Unexpected body type ${bodyType}`;
                                                bodyType = 'exception';
                                        }
                                    } catch (error) {
                                        console.error('Channel request exception', error);

                                        payload = String(error);
                                        bodyType = 'exception';
                                    }
                                } else {
                                    payload = null;
                                    bodyType = 'closed';
                                }
                            }
                        }

                        body.payload = payload;

                        this.#accept(socket, bodyType, body);
                }
            } catch (error) {
                console.error('Socket message exception', error);

                socket.close();
            }
        });

        this._connection = new Promise((resolve, reject) => {
            let closed = true;

            socket.addEventListener('open', () => {
                closed = false;

                resolve(socket);
            });

            socket.addEventListener('error', (event) => {
                console.error('Socket error event', event);

                if (closed) {
                    reject(new StateError('Client not connected'));
                }
            });
        });

        this._disconnection = new Promise((resolve) => {
            socket.addEventListener('close', () => {
                this._registry.clear();

                resolve();
            });
        });

        this._registry = new Registry();
        this._channels = {};
    }

    async _send(bodyType, channelKey, input, producer, consumer) {
        const socket = await this._connection;

        if (socket.readyState !== WebSocket.OPEN) {
            throw new StateError('Client has disconnected');
        }

        const payload = JSON.stringify(input);

        const future = loop.createFuture();

        const body = {
            future: this._registry.store(future),
            channel: channelKey,
            payload,
        };

        this.#accept(socket, bodyType, body);

        return future;
    }

    #accept(socket, bodyType, body) {
        body.type = bodyType;

        const data = JSON.stringify(body);

        socket.send(data);
    }

    #pop(body, name) {
        const value = this.#get(body, name);
        delete body[name];
        return value;
    }

    #get(body, name) {
        if (!(name in body)) {
            throw new Error(`Body must have ${name}`);
        }
        return body[name];
    }
}
