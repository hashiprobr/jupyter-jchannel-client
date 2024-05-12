export class CancelledError extends Error {
}

export class Loop {
    createFuture() {
        let setResult;
        let setException;

        const future = new Promise((resolve, reject) => {
            setResult = resolve;
            setException = reject;
        });

        future.pending = true;

        future.setResult = (result) => {
            if (future.pending) {
                future.pending = false;
                setResult(result);
            }
        };

        future.setException = (exception) => {
            if (future.pending) {
                future.pending = false;
                setException(exception);
            }
        };

        future.cancel = (message) => {
            if (future.pending) {
                future.pending = false;
                setException(new CancelledError(message));
            }
        };

        return future;
    }
}

export default new Loop();
