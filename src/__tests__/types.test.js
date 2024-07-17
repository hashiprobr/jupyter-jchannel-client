import { MetaGenerator } from '../types';

let encoder;
let decoder;

function createChunks(input) {
    input.reverse();

    const stream = {
        getReader() {
            return {
                read() {
                    let value;
                    let done;

                    if (input.length) {
                        const data = input.pop();

                        value = encoder.encode(data);
                        done = false;
                    } else {
                        done = true;
                    }

                    return { value, done };
                },
            };
        },
    };

    return new MetaGenerator(stream);
}

beforeEach(() => {
    encoder = new TextEncoder();
    decoder = new TextDecoder();
});

test('iterates', async () => {
    const chunks = createChunks([
        'a',
        '',
        'bc',
        '',
        'def',
    ]);

    const output = [];

    for await (const chunk of chunks) {
        const data = decoder.decode(chunk);

        output.push(data);
    }

    expect(output).toStrictEqual([
        'a',
        '',
        'bc',
        '',
        'def',
    ]);
});

test('iterates by limit of four (1, 3, 7)', async () => {
    const chunks = createChunks([
        'a',
        '',
        'bcd',
        '',
        'efghijk',
    ]);

    const output = [];

    for await (const chunk of chunks.byLimit(4)) {
        const data = decoder.decode(chunk);

        output.push(data);
    }

    expect(output).toStrictEqual([
        'abcd',
        'efgh',
        'ijk',
    ]);
});

test('iterates by limit of four (2, 4, 8)', async () => {
    const chunks = createChunks([
        'ab',
        '',
        'cdef',
        '',
        'ghijklmn',
    ]);

    const output = [];

    for await (const chunk of chunks.byLimit(4)) {
        const data = decoder.decode(chunk);

        output.push(data);
    }

    expect(output).toStrictEqual([
        'abcd',
        'efgh',
        'ijkl',
        'mn',
    ]);
});

test('iterates by limit of four (3, 5, 9)', async () => {
    const chunks = createChunks([
        'abc',
        '',
        'defgh',
        '',
        'ijklmnopq',
    ]);

    const output = [];

    for await (const chunk of chunks.byLimit(4)) {
        const data = decoder.decode(chunk);

        output.push(data);
    }

    expect(output).toStrictEqual([
        'abcd',
        'efgh',
        'ijkl',
        'mnop',
        'q',
    ]);
});

test('iterates by limit of four (4, 6, 10)', async () => {
    const chunks = createChunks([
        'abcd',
        '',
        'efghij',
        '',
        'klmnopqrst',
    ]);

    const output = [];

    for await (const chunk of chunks.byLimit(4)) {
        const data = decoder.decode(chunk);

        output.push(data);
    }

    expect(output).toStrictEqual([
        'abcd',
        'efgh',
        'ijkl',
        'mnop',
        'qrst',
    ]);
});

test('does not iterate by non-integer limit', async () => {
    const chunks = createChunks([]);
    const aiter = chunks.byLimit('8192');
    await expect(() => aiter.next()).rejects.toThrow(TypeError);
});

test('does not iterate by non-positive limit', async () => {
    const chunks = createChunks([]);
    const aiter = chunks.byLimit(0);
    await expect(() => aiter.next()).rejects.toThrow(Error);
});

test('iterates by two-space separator (flex-start)', async () => {
    const chunks = createChunks([
        'abcdef  ',
        '',
        'ghijk  lmno  ',
        '',
        'pqr  st  u  ',
    ]);

    const output = [];

    for await (const chunk of chunks.bySeparator('  ')) {
        const data = decoder.decode(chunk);

        output.push(data);
    }

    expect(output).toStrictEqual([
        'abcdef  ',
        'ghijk  ',
        'lmno  ',
        'pqr  ',
        'st  ',
        'u  ',
    ]);
});

test('iterates by two-space separator (flex-end)', async () => {
    const chunks = createChunks([
        '  abcdef',
        '',
        '  ghijk  lmno',
        '',
        '  pqr  st  u',
    ]);

    const output = [];

    for await (const chunk of chunks.bySeparator('  ')) {
        const data = decoder.decode(chunk);

        output.push(data);
    }

    expect(output).toStrictEqual([
        '  ',
        'abcdef  ',
        'ghijk  ',
        'lmno  ',
        'pqr  ',
        'st  ',
        'u',
    ]);
});

test('iterates by two-space separator (space-around)', async () => {
    const chunks = createChunks([
        ' abcdef ',
        '',
        ' ghijk  lmno ',
        '',
        ' pqr  st  u ',
    ]);

    const output = [];

    for await (const chunk of chunks.bySeparator('  ')) {
        const data = decoder.decode(chunk);

        output.push(data);
    }

    expect(output).toStrictEqual([
        ' abcdef  ',
        'ghijk  ',
        'lmno  ',
        'pqr  ',
        'st  ',
        'u ',
    ]);
});

test('iterates by two-space separator (space-between)', async () => {
    const chunks = createChunks([
        'abcdef',
        '',
        'ghijk  lmno',
        '',
        'pqr  st  u',
    ]);

    const output = [];

    for await (const chunk of chunks.bySeparator('  ')) {
        const data = decoder.decode(chunk);

        output.push(data);
    }

    expect(output).toStrictEqual([
        'abcdefghijk  ',
        'lmnopqr  ',
        'st  ',
        'u',
    ]);
});

test('does not iterate by invalid separator', async () => {
    const chunks = createChunks([]);
    const aiter = chunks.bySeparator(true);
    await expect(() => aiter.next()).rejects.toThrow(TypeError);
});

test('does not iterate by empty separator', async () => {
    const chunks = createChunks([]);
    const aiter = chunks.bySeparator(new Uint8Array());
    await expect(() => aiter.next()).rejects.toThrow(Error);
});
