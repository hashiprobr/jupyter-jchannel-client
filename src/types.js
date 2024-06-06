export class AbstractError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class StateError extends AbstractError {
}

export class KernelError extends AbstractError {
}
