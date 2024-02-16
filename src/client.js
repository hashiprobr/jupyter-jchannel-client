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
                    console.error('Client disconnected due to an error');
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

                if (messageType === 'string') {
                    const body = JSON.parse(event.data);
                    const bodyType = body.type;
                    delete body.type;

                    switch (bodyType) {
                        case 'debug':
                            socket.dispatchEvent(new Event('error'));
                            break;
                        default:
                            console.error(`Received unexpected body type ${bodyType}`);
                    }
                } else {
                    console.error(`Received unexpected message type ${messageType}`);
                }
            } catch (error) {
                console.error(error);
            }
        });
    }

    async _send(bodyType, body = {}) {
        const socket = await this.connection;

        body.type = bodyType;
        const data = JSON.stringify(body);

        socket.send(data);
    }
}
