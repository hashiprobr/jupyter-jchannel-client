export class AbstractError extends Error {
    constructor(message, name) {
        super(message);
        this.name = name;
    }
}

export class StateError extends AbstractError {
    constructor(message) {
        super(message, 'StateError');
    }
}

export class KernelError extends AbstractError {
    constructor(message) {
        super(message, 'KernelError');
    }
}
