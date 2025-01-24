export class Client {
    constructor(url: any, mms: any);
    _connection: Promise<any>;
    _disconnection: Promise<any>;
    _registry: Registry;
    _channels: {};
    _send(bodyType: any, channelKey: any, input: any, stream: any): Promise<any>;
    #private;
}
import { Registry } from './registry';
