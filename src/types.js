export class CustomError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class StateError extends CustomError {
}

export class KernelError extends CustomError {
}
