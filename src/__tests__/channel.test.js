import { Channel } from '../channel';

let c;

beforeEach(() => {
    c = new Channel();
});

test('stub', () => {
    expect(c).toBeInstanceOf(Channel);
});
