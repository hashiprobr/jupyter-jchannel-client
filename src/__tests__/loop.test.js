import { Loop } from '../loop';

let future;

beforeEach(() => {
    const loop = new Loop();
    future = loop.createFuture();
});

test('sets result', async () => {
    const value = {};
    future.setResult(value);
    await expect(future).resolves.toBe(value);
});

test('sets exception', async () => {
    const error = new Error();
    future.setException(error);
    await expect(future).rejects.toThrow(error);
});
