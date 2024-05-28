export class StateError extends Error {
    constructor(message) {
        super(message);
        this.name = 'StateError';
    }
}

export class KernelError extends Error {
    constructor(message) {
        super(message);
        this.name = 'KernelError';
    }
}
