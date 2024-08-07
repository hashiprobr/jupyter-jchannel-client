/*
 * Copyright (c) 2024 Marcelo Hashimoto
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

export class AbstractError extends Error {
    constructor(message, name) {
        super(message);
        // NOTE: Using this.constructor.name
        // would be more elegant, but this
        // property is mangled by minification.
        this.name = name;
    }
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
    constructor(message) {
        super(message, 'StateError');
    }
}

/**
 * Indicates that an operation could not be performed in the kernel.
 *
 * Contains a simple message or the string representation of a kernel exception.
 *
 * @hideconstructor
 */
export class KernelError extends AbstractError {
    constructor(message) {
        super(message, 'KernelError');
    }
}

/**
 * Provides generators to read a kernel stream.
 *
 * @hideconstructor
 */
export class MetaGenerator {
    #reader;

    constructor(stream) {
        this.#reader = stream.getReader();
    }

    [Symbol.asyncIterator]() {
        return this;
    }

    next() {
        return this.#reader.read();
    }

    /**
     * Convenience method that joins all chunks into one.
     *
     * @returns {Uint8Array} The joined stream chunks.
     */
    async join() {
        let limit = 0;
        let buffer = new Uint8Array();
        let size = 0;

        for await (const chunk of this) {
            const newSize = size + chunk.length;

            if (newSize > limit) {
                limit = 2 ** Math.ceil(Math.log2(newSize));
                const newBuffer = new Uint8Array(limit);
                newBuffer.set(buffer.subarray(0, size));
                buffer = newBuffer;
            }

            buffer.set(chunk, size);
            size = newSize;
        }

        return buffer.subarray(0, size);
    }

    /**
     * Provides chunks with maximum size limit.
     *
     * @param {number} [limit = 8192] The size limit.
     * @yields {Uint8Array} The stream chunks.
     */
    async * byLimit(limit = 8192) {
        if (!Number.isInteger(limit)) {
            throw new TypeError('Limit must be an integer');
        }

        if (limit <= 0) {
            throw new Error('Limit must be positive');
        }

        const buffer = new Uint8Array(limit);

        let size = 0;

        for await (let chunk of this) {
            let length = chunk.length;

            let begin = 0;
            let end = limit - size;

            if (length > end) {
                buffer.set(chunk.subarray(begin, end), size);
                yield buffer.slice();
                size = 0;

                begin = end;
                end += limit;

                while (end <= length) {
                    yield chunk.subarray(begin, end);

                    begin = end;
                    end += limit;
                }

                chunk = chunk.subarray(begin);
                length = chunk.length;
            }

            buffer.set(chunk, size);
            size += length;
        }

        if (size > 0) {
            yield buffer.subarray(0, size);
        }
    }

    /**
     * Provides chunks according to a separator.
     *
     * @param {string|Uint8Array} [separator = '\n'] The split separator. If a
     * string, it is encoded as UTF-8.
     * @yields {Uint8Array} The stream chunks.
     */
    async * bySeparator(separator = '\n') {
        separator = this.#clean(separator);

        if (!separator.length) {
            throw new Error('Separator cannot be empty');
        }

        let limit = 0;
        let buffer = new Uint8Array();
        let size = 0;
        let offset = 0;

        for await (const chunk of this) {
            const newSize = size + chunk.length;

            if (newSize > limit) {
                limit = 2 ** Math.ceil(Math.log2(newSize));
                const newBuffer = new Uint8Array(limit);
                newBuffer.set(buffer.subarray(0, size));
                buffer = newBuffer;
            }

            buffer.set(chunk, size);
            size = newSize;

            let shift = 0;

            while (offset <= size - separator.length) {
                if (this.#match(buffer, offset, separator)) {
                    offset += separator.length;
                    yield buffer.slice(shift, offset);
                    shift = offset;
                } else {
                    offset += 1;
                }
            }

            if (shift > 0) {
                buffer.set(buffer.subarray(shift, size));
                size -= shift;
                offset -= shift;
            }
        }

        if (size > 0) {
            yield buffer.subarray(0, size);
        }
    }

    #clean(separator) {
        if (typeof separator === 'string') {
            const encoder = new TextEncoder();
            return encoder.encode(separator);
        }

        if (separator instanceof Uint8Array) {
            return separator;
        }

        throw new TypeError('Separator must be a string or an Uint8Array');
    }

    #match(buffer, offset, separator) {
        let i = offset;
        let j = 0;

        while (j < separator.length) {
            if (buffer[i] !== separator[j]) {
                return false;
            }

            i++;
            j++;
        }

        return true;
    }
}
