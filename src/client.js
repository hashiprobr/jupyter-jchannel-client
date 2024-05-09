import { Channel } from './channel';

export class Client {
    constructor(url) {
        const socket = new WebSocket(`${url}/socket`);

        this.connection = new Promise((resolve, reject) => {
            let open = false;

            socket.addEventListener('open', () => {
                open = true;
                resolve(socket);
            });

            socket.addEventListener('error', () => {
                if (open) {
                    console.error('Caught unexpected exception');
                } else {
                    reject(new Error('Client could not connect'));
                }
            });
        });

        this.disconnection = new Promise((resolve) => {
            socket.addEventListener('close', () => {
                resolve();
            });
        });

        socket.addEventListener('message', async (event) => {
            try {
                const messageType = typeof event.data;

                if (messageType !== 'string') {
                    throw new TypeError(`Received unexpected message type ${messageType}`);
                }

                const body = JSON.parse(event.data);

                this.#check(body, 'future');
                const channelKey = this.#get(body, 'channel');
                let payload = this.#pop(body, 'payload');
                let bodyType = this.#pop(body, 'type');

                let input;
                let output;
                let channel;

                switch (bodyType) {
                    case 'exception':
                        break;
                    case 'result':
                        break;
                    default:
                        input = JSON.parse(payload);

                        switch (bodyType) {
                            case 'open':
                                if (typeof input === 'string') {
                                    try {
                                        const method = window.eval(input);

                                        if (typeof method === 'function') {
                                            channel = new Channel();

                                            this.channels[channelKey] = channel;

                                            output = method(channel);
                                            if (output instanceof Promise) {
                                                output = await output;
                                            }
                                            payload = JSON.stringify(output);
                                            bodyType = 'result';
                                        } else {
                                            payload = 'Code must represent a function';
                                            bodyType = 'exception';
                                        }
                                    } catch (error) {
                                        payload = this.#message(error);
                                        bodyType = 'exception';
                                    }
                                } else {
                                    payload = 'Code must be a string';
                                    bodyType = 'exception';
                                }
                                break;
                            case 'close':
                                break;
                            default: {
                                channel = this.channels[channelKey];

                                if (channel) {
                                    try {
                                        switch (bodyType) {
                                            case 'echo':
                                                bodyType = 'result';
                                                break;
                                            case 'call':
                                                output = channel.handleCall(input.name, input.args);
                                                if (output instanceof Promise) {
                                                    output = await output;
                                                }
                                                payload = JSON.stringify(output);
                                                bodyType = 'result';
                                                break;
                                            default:
                                                payload = `Received unexpected body type ${bodyType}`;
                                                bodyType = 'exception';
                                        }
                                    } catch (error) {
                                        payload = this.#message(error);
                                        bodyType = 'exception';
                                    }
                                } else {
                                    console.warn('Unexpected channel closure');

                                    payload = null;
                                    bodyType = 'closed';
                                }
                            }
                        }

                        body.payload = payload;

                        this.#accept(socket, bodyType, body);
                }
            } catch (error) {
                console.error(error);

                socket.dispatchEvent(new Event('error'));
                socket.close();
            }
        });

        this.channels = {};
    }

    async _send(bodyType, body = {}) {
        const socket = await this.connection;

        this.#accept(socket, bodyType, body);
    }

    #accept(socket, bodyType, body) {
        body.type = bodyType;

        const data = JSON.stringify(body);

        socket.send(data);
    }

    #message(error) {
        console.error(error);

        if (typeof error.message === 'string' && error.message) {
            return error.message;
        }
        return 'Check the browser console for details';
    }

    #pop(body, name) {
        const value = this.#get(body, name);
        delete body[name];
        return value;
    }

    #get(body, name) {
        this.#check(body, name);
        return body[name];
    }

    #check(body, name) {
        if (!(name in body)) {
            throw new Error(`Body must have ${name}`);
        }
    }
}
