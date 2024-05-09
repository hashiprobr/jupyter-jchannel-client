import { Channel } from '../channel';

const KEY = 0;

let mockClient, c;

beforeEach(() => {
    mockClient = {
        channels: [],
    };

    c = new Channel(mockClient, KEY);
});

test('stub', () => {
    expect(mockClient.channels[KEY]).toBe(c);
});
