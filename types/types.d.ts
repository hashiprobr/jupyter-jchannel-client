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
