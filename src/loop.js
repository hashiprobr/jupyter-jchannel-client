export class Loop {
    createFuture() {
        let setResult;
        let setException;

        const future = new Promise((resolve, reject) => {
            setResult = resolve;
            setException = reject;
        });

        future.setResult = setResult;
        future.setException = setException;

        return future;
    }
}

export default new Loop();
