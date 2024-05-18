import { CancelledError, Loop } from '../loop';

let f;

beforeEach(() => {
    const loop = new Loop();

    f = loop.createFuture();
});

test('sets result, does not set exception, and does not cancel', async () => {
    const value = {};
    f.setResult(value);
    await expect(f).resolves.toBe(value);
    f.setException(new Error());
    await expect(f).resolves.toBe(value);
    f.cancel('message');
    await expect(f).resolves.toBe(value);
});

test('sets exception, does not set result, and does not cancel', async () => {
    const error = new Error();
    f.setException(error);
    await expect(f).rejects.toThrow(error);
    f.setResult({});
    await expect(f).rejects.toThrow(error);
    f.cancel('message');
    await expect(f).rejects.toThrow(error);
});

test('cancels, does not set result, and does not set exception', async () => {
    const message = 'message';
    f.cancel(message);
    try {
        await f;
    } catch (error) {
        expect(error).toBeInstanceOf(CancelledError);
        expect(error.message).toBe(message);
        f.setResult({});
        await expect(f).rejects.toThrow(error);
        f.setException(new Error());
        await expect(f).rejects.toThrow(error);
    }
});
