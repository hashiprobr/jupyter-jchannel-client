export class AbstractError extends Error {
    constructor(message, name) {
        super(message);
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
