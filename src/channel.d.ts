/**
 * Represents a communication channel between a frontend client and a kernel
 * server.
 *
 * @hideconstructor
 */
export class Channel {
    constructor(client: any, key: any);
    set handler(value: object);
    /**
     * The object that handles calls from the server.
     *
     * @type {object}
     */
    get handler(): object;
    _handle(name: any, args: any): any;
    /**
     * Sends arguments to the server and receives them back.
     *
     * Under normal circumstances, this method should not be called. It should
     * only be called for debugging or testing purposes.
     *
     * It is particularly useful to verify whether the arguments are robust to
     * JSON serialization and deserialization.
     *
     * @param {any} args The arguments.
     * @returns {Array} The same arguments as an array.
     */
    echo(...args: any): any[];
    /**
     * Sends a byte stream to the server and receives it back.
     *
     * Under normal circumstances, this method should not be called. It should
     * only be called for debugging or testing purposes.
     *
     * It is particularly useful to verify whether the bytes are robust to GET
     * and POST streaming.
     *
     * @param {object} stream An async iterable of Uint8Array instances.
     * @returns {MetaGenerator} The same bytes as a meta generator.
     */
    pipe(stream: object): MetaGenerator;
    /**
     * Makes a call to the server.
     *
     * @param {string} name The name of a server handler method.
     * @param {any} args The arguments of the call.
     * @returns {any} The return value of the method.
     */
    call(name: string, ...args: any): any;
    /**
     * Makes a call to the server with a byte stream as its first argument. The
     * method receives it as a
     * {@link https://jupyter-jchannel.readthedocs.io/en/latest/jchannel.types.html#jchannel.types.MetaGenerator|server MetaGenerator}.
     *
     * @param {string} name The name of a server handler method.
     * @param {object} stream The first argument of the call, an async iterable
     * of Uint8Array instances.
     * @param {any} args The other arguments of the call.
     * @returns {any} The return value of the method.
     */
    callWithStream(name: string, stream: object, ...args: any): any;
    #private;
}
