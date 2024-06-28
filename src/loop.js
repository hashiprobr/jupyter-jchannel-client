import { AbstractError } from './types';

export class CancelledError extends AbstractError {
    constructor(message) {
        super(message, 'CancelledError');
    }
}

export class Loop {
    createFuture() {
        let pending;
        let setResult;
        let setException;

        const future = new Promise((resolve, reject) => {
            pending = true;
            setResult = resolve;
            setException = reject;
        });

        future.setResult = (result) => {
            if (pending) {
                pending = false;
                setResult(result);
            }
        };

        future.setException = (exception) => {
            if (pending) {
                pending = false;
                setException(exception);
            }
        };

        future.cancel = (message) => {
            if (pending) {
                pending = false;
                setException(new CancelledError(message));
            }
        };

        return future;
    }
}

export default new Loop();
