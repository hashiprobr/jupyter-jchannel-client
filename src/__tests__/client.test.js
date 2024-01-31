import { Client } from '../client';

let c;

beforeEach(() => {
    c = new Client();
});

test('stub', () => {
    expect(c).toBeInstanceOf(Client);
});
