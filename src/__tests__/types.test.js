import { MetaGenerator } from '../types';

let encoder, decoder;

function createChunks(content) {
    content.reverse();

    const stream = {
        getReader() {
            return {
                read() {
                    let value;
                    let done;

                    if (content.length) {
                        const data = content.pop();

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

    const content = [];

    for await (const chunk of chunks) {
        const data = decoder.decode(chunk);

        content.push(data);
    }

    expect(content).toStrictEqual([
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

    const content = [];

    for await (const chunk of chunks.byLimit(4)) {
        const data = decoder.decode(chunk);

        content.push(data);
    }

    expect(content).toStrictEqual([
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

    const content = [];

    for await (const chunk of chunks.byLimit(4)) {
        const data = decoder.decode(chunk);

        content.push(data);
    }

    expect(content).toStrictEqual([
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

    const content = [];

    for await (const chunk of chunks.byLimit(4)) {
        const data = decoder.decode(chunk);

        content.push(data);
    }

    expect(content).toStrictEqual([
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

    const content = [];

    for await (const chunk of chunks.byLimit(4)) {
        const data = decoder.decode(chunk);

        content.push(data);
    }

    expect(content).toStrictEqual([
        'abcd',
        'efgh',
        'ijkl',
        'mnop',
        'qrst',
    ]);
});

test('does not iterate by non-integer limit', async () => {
    const chunks = createChunks([]);
    const aiter = chunks.byLimit(true);
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

    const content = [];

    for await (const chunk of chunks.bySeparator(new Uint8Array([32, 32]))) {
        const data = decoder.decode(chunk);

        content.push(data);
    }

    expect(content).toStrictEqual([
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

    const content = [];

    for await (const chunk of chunks.bySeparator(new Uint8Array([32, 32]))) {
        const data = decoder.decode(chunk);

        content.push(data);
    }

    expect(content).toStrictEqual([
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

    const content = [];

    for await (const chunk of chunks.bySeparator('  ')) {
        const data = decoder.decode(chunk);

        content.push(data);
    }

    expect(content).toStrictEqual([
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

    const content = [];

    for await (const chunk of chunks.bySeparator('  ')) {
        const data = decoder.decode(chunk);

        content.push(data);
    }

    expect(content).toStrictEqual([
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
    const aiter = chunks.bySeparator('');
    await expect(() => aiter.next()).rejects.toThrow(Error);
});
