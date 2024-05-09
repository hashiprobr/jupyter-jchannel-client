import { Channel } from '../channel';

const KEY = 0;

let client, c;

beforeEach(() => {
    client = {
        channels: [],
    };

    c = new Channel(client, KEY);
});

test('stub', () => {
    expect(client.channels[KEY]).toBe(c);
});
