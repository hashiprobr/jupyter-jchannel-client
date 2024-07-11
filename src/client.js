import loop from './loop';

import { MetaGenerator, KernelError, StateError } from './types';
import { Registry } from './registry';
import { Channel } from './channel';

export class Client {
    #url;

    constructor(url) {
        this.#url = url;

        const socket = new WebSocket(`ws${url.slice(4)}/socket`);

        socket.addEventListener('message', async (event) => {
            try {
                const messageType = typeof event.data;

                if (messageType !== 'string') {
                    throw new TypeError(`Unexpected socket message type ${messageType}`);
                }

                const body = JSON.parse(event.data);

                const futureKey = this.#get(body, 'future');
                const channelKey = this.#get(body, 'channel');
                const streamKey = this.#pop(body, 'stream');
                let payload = this.#pop(body, 'payload');
                let bodyType = this.#pop(body, 'type');

                let future;
                let channel;
                let input;
                let output;
                let chunks;
                let stream;
                let name;
                let args;

                if (streamKey !== null) {
                    chunks = await this.#doGet(streamKey);
                }

                switch (bodyType) {
                    case 'exception':
                        future = this._registry.retrieve(futureKey);
                        future.setException(new KernelError(payload));
                        break;
                    case 'result':
                        future = this._registry.retrieve(futureKey);

                        if (chunks) {
                            future.setResult(chunks);
                        } else {
                            output = JSON.parse(payload);

                            future.setResult(output);
                        }
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
                                            const method = self.eval(input);

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
                                                name = this.#pop(input, 'name');
                                                args = this.#pop(input, 'args');

                                                if (typeof name !== 'string') {
                                                    throw new TypeError('Name must be a string');
                                                }

                                                if (!(args instanceof Array)) {
                                                    throw new TypeError('Args must be a list');
                                                }

                                                if (chunks) {
                                                    args.push(chunks);
                                                }

                                                output = channel._handle(name, args);
                                                if (output instanceof Promise) {
                                                    output = await output;
                                                }

                                                if (output && this.#aiter(output)) {
                                                    stream = output;
                                                    payload = 'null';
                                                } else {
                                                    payload = JSON.stringify(output);
                                                    if (typeof payload === 'undefined') {
                                                        payload = 'null';
                                                    }
                                                }

                                                bodyType = 'result';
                                                break;
                                            case 'pipe':
                                                stream = chunks;
                                                payload = 'null';
                                                bodyType = 'result';
                                                break;
                                            default:
                                                payload = `Unexpected socket body type ${bodyType}`;
                                                bodyType = 'exception';
                                        }
                                    } catch (error) {
                                        console.error('Socket request exception', error);

                                        payload = String(error);
                                        bodyType = 'exception';
                                    }
                                } else {
                                    payload = null;
                                    bodyType = 'closed';
                                }
                            }
                        }

                        if (chunks && !stream) {
                            let result;
                            do {
                                result = await chunks.next();
                            } while (!result.done);
                        }

                        body.payload = payload;

                        await this.#accept(socket, bodyType, body, stream);
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

    async _send(bodyType, channelKey, input, stream) {
        if (stream) {
            if (!this.#aiter(stream)) {
                throw new TypeError('Stream must be an async iterable');
            }
        }

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

        await this.#accept(socket, bodyType, body, stream);

        return future;
    }

    async #accept(socket, bodyType, body, stream) {
        body.type = bodyType;

        const data = JSON.stringify(body);

        if (stream) {
            await this.#doPost(data, stream);
        } else {
            socket.send(data);
        }
    }

    async #doGet(streamKey) {
        const headers = { 'x-jchannel-stream': String(streamKey) };

        const response = await fetch(this.#url, { headers });
        const status = response.status;

        if (status !== 200) {
            throw new Error(`Unexpected get response status ${status}`);
        }

        return new MetaGenerator(response.body);
    }

    async #doUpload(socket, stream) {
        try {
            for await (const chunk of stream) {
                if (chunk.length) {
                    try {
                        socket.send(chunk);
                    } catch (error) {
                        /* istanbul ignore next */
                        return;
                    }
                }
            }
        } catch (error) {
            console.error('Post writing exception', error);
        }

        try {
            socket.send(new Uint8Array());
            await new Promise((resolve, reject) => {
                socket.addEventListener('message', resolve);
                socket.addEventListener('error', reject);
            });
        } catch (error) {
            /* istanbul ignore next */
            return;
        }

        socket.close();
    }

    async #doPost(data, stream) {
        const headers = { 'x-jchannel-data': data };

        // const body = new ReadableStream({
        //     type: 'bytes',
        //
        //     async pull(controller) {
        //         try {
        //             const result = await stream.next();
        //
        //             if (result.done) {
        //                 controller.close();
        //             } else {
        //                 controller.enqueue(result.value);
        //             }
        //         } catch (error) {
        //             console.error('Post writing exception', error);
        //
        //             controller.close();
        //         }
        //     },
        // });

        const socket = new WebSocket(`ws${this.#url.slice(4)}/upload`);

        const body = await new Promise((resolve) => {
            socket.addEventListener('message', (event) => {
                resolve(event.data);
            });
        });

        const init = {
            method: 'POST',
            duplex: 'half',
            headers,
            body,
        };

        const response = await fetch(this.#url, init);
        //const status = response.status;

        let status = response.status;

        if (status === 200) {
            await this.#doUpload(socket, stream);

            const content = await response.text();

            status = Number(content);
        } else {
            socket.close();
        }

        if (status !== 200) {
            throw new Error(`Unexpected post response status ${status}`);
        }
    }

    #aiter(value) {
        if (typeof value !== 'object') {
            return false;
        }
        return Symbol.asyncIterator in value;
    }

    #pop(body, name) {
        const value = this.#get(body, name);
        delete body[name];
        return value;
    }

    #get(body, name) {
        if (!(name in body)) {
            throw new Error(`Object must have ${name}`);
        }
        return body[name];
    }
}
