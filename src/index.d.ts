declare module "channel" {
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
}
declare module "__tests__/channel.test" {
    export {};
}
declare module "types" {
    export class AbstractError extends Error {
        constructor(message: any, name: any);
        name: any;
    }
    /**
     * Indicates that an operation could not be performed because the performer is
     * in an invalid state.
     *
     * For example, a message could not be sent because the client is not connected.
     *
     * @hideconstructor
     */
    export class StateError extends AbstractError {
        constructor(message: any);
    }
    /**
     * Indicates that an operation could not be performed in the kernel.
     *
     * Contains a simple message or the string representation of a kernel exception.
     *
     * @hideconstructor
     */
    export class KernelError extends AbstractError {
        constructor(message: any);
    }
    /**
     * Provides generators to read a kernel stream.
     *
     * @hideconstructor
     */
    export class MetaGenerator {
        constructor(stream: any);
        next(): any;
        /**
         * Convenience method that joins all chunks into one.
         *
         * @returns {Uint8Array} The joined stream chunks.
         */
        join(): Uint8Array;
        /**
         * Provides chunks with maximum size limit.
         *
         * @param {number} [limit = 8192] The size limit.
         * @yields {Uint8Array} The stream chunks.
         */
        byLimit(limit?: number): AsyncGenerator<any, void, unknown>;
        /**
         * Provides chunks according to a separator.
         *
         * @param {string|Uint8Array} [separator = '\n'] The split separator. If a
         * string, it is encoded as UTF-8.
         * @yields {Uint8Array} The stream chunks.
         */
        bySeparator(separator?: string | Uint8Array): AsyncGenerator<Uint8Array<ArrayBuffer>, void, unknown>;
        [Symbol.asyncIterator](): this;
        #private;
    }
}
declare module "registry" {
    export class Registry {
        store(future: any): any;
        retrieve(key: any): any;
        clear(): void;
        #private;
    }
}
declare module "loop" {
    export class CancelledError extends AbstractError {
        constructor(message: any);
    }
    export class Loop {
        createFuture(): Promise<any>;
    }
    const _default: Loop;
    export default _default;
    import { AbstractError } from "types";
}
declare module "client" {
    export class Client {
        constructor(url: any, mms: any);
        _connection: Promise<any>;
        _disconnection: Promise<any>;
        _registry: Registry;
        _channels: {};
        _send(bodyType: any, channelKey: any, input: any, stream: any): Promise<any>;
        #private;
    }
    import { Registry } from "registry";
}
declare module "__tests__/client.test" {
    export {};
}
declare module "index" {
    export class Index {
        start(url: any, mms: any): Promise<any>;
        stop(url: any): Promise<void>;
        _unload(url: any): void;
        #private;
    }
    const _default: Index;
    export default _default;
    export { Channel };
    import { Channel } from "channel";
}
declare module "__tests__/index.test" {
    export {};
}
declare module "__tests__/loop.test" {
    export {};
}
declare module "__tests__/registry.test" {
    export {};
}
declare module "__tests__/types.test" {
    export {};
}
