export class Channel {
    constructor(client, key) {
        client.channels[key] = this;

        this.client = client;
        this.key = key;
    }
}
