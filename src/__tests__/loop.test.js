import { Loop } from '../loop';

let f;

beforeEach(() => {
    const loop = new Loop();
    f = loop.createFuture();
});

test('sets result', async () => {
    const value = {};
    f.setResult(value);
    await expect(f).resolves.toBe(value);
});

test('sets exception', async () => {
    const error = new Error();
    f.setException(error);
    await expect(f).rejects.toThrow(error);
});
