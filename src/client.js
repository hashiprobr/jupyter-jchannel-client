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

        socket.addEventListener('message', (event) => {
            try {
                const messageType = typeof event.data;

                if (messageType !== 'string') {
                    throw new Error(`Received unexpected message type ${messageType}`);
                }

                const body = JSON.parse(event.data);

                this.#check(body, 'future');
                const key = this.#get(body, 'channel');
                let bodyType = this.#pop(body, 'type');
                let payload = this.#pop(body, 'payload');

                if (bodyType === 'open') {
                    if (typeof payload === 'string') {
                        try {
                            const method = window.eval(payload);

                            if (typeof method === 'function') {
                                this.channels[key] = new Channel();

                                payload = method(this.channels[key]);
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
                } else {
                    const channel = this.channels[key];

                    if (channel) {
                        try {
                            switch (bodyType) {
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
                        bodyType = 'open';
                    }
                }

                if (payload instanceof ReadableStream) {
                    throw new Error('Not implemented yet');
                } else {
                    body.payload = payload;
                    this._send(bodyType, body);
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

        body.type = bodyType;

        const data = JSON.stringify(body);

        socket.send(data);
    }

    #message(error) {
        console.error(error);

        if (error.message) {
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
