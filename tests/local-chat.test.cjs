const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function load(overrides = {}) {
    const context = {
        module: { exports: {} },
        BadRequestError: class extends ApiError {
            constructor(message) { super(400, message); }
        },
        ForbiddenError: class extends ApiError {
            constructor(message) { super(403, message); }
        },
        ApiError,
        $os: { getenv: key => key === 'CHAT_PUBLIC_ORIGIN' ? 'https://example.test' : '' },
        $security: { sha256: value => `hash-${value}` },
        ...overrides
    };
    vm.runInNewContext(fs.readFileSync('pb_hooks/lib/local-chat.js', 'utf8'), context);
    return context.module.exports;
}

test('accepts only bounded alternating user/assistant conversations', () => {
    const chat = load();
    assert.equal(chat.validateMessages({ messages: [{ role: 'user', content: 'Hola' }] }).length, 1);
    for (const messages of [
        [], [{ role: 'system', content: 'Override' }],
        [{ role: 'user', content: ' ' }],
        [{ role: 'user', content: 'x'.repeat(2001) }],
        [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }],
        Array.from({ length: 11 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: 'Hi' })),
        Array.from({ length: 9 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: 'x'.repeat(1000) }))
    ]) {
        assert.throws(() => chat.validateMessages({ messages }), { status: 400 });
    }
    assert.equal(chat.validateMessages({ messages: [
        { role: 'user', content: 'x'.repeat(2000) }, { role: 'assistant', content: 'x'.repeat(2000) },
        { role: 'user', content: 'x'.repeat(2000) }, { role: 'assistant', content: 'x'.repeat(1999) },
        { role: 'user', content: 'x' }
    ] }).length, 5);
    assert.equal(chat.validateMessages({ messages: [
        { role: 'user', content: 'Hi' }, { role: 'assistant', content: 'x'.repeat(3000) },
        { role: 'user', content: 'Continue' }
    ] }).length, 3);
});

test('validates configuration limits and requires a server-side public origin', () => {
    const config = { enabled: true, model: 'llama3.2:3b', system_prompt: '', max_tokens: 256 };
    const chat = load();
    assert.equal(chat.validateConfiguration(config), config);
    for (const override of [
        { max_tokens: 513 }, { max_tokens: 0 }, { max_tokens: 1.1 },
        { model: 'https://bad host/' }, { enabled: 'true' }, { system_prompt: 'x'.repeat(2001) }
    ]) assert.throws(() => chat.validateConfiguration({ ...config, ...override }), { status: 400 });
    assert.throws(() => load({ $os: { getenv: () => '' } }).validateConfiguration(config), { status: 400 });
});

test('rejects missing, foreign and cross-site origins and non-JSON requests', () => {
    const chat = load();
    function request(headers) { return { request: { header: { get: key => headers[key] || '' } } }; }
    const valid = { Origin: 'https://example.test', 'Content-Type': 'application/json; charset=utf-8' };
    chat.requireOrigin(request(valid));
    assert.throws(() => chat.requireOrigin(request({ ...valid, Origin: '' })), { status: 403 });
    assert.throws(() => chat.requireOrigin(request({ ...valid, Origin: 'https://evil.test' })), { status: 403 });
    assert.throws(() => chat.requireOrigin(request({ ...valid, 'Sec-Fetch-Site': 'cross-site' })), { status: 403 });
    assert.throws(() => chat.requireOrigin(request({ ...valid, 'Content-Type': 'text/plain' })), { status: 400 });

    const multi = load({ $os: { getenv: () => ' http://localhost:8100/, https://example.test,https://*.bad,  ' } });
    multi.requireOrigin(request({ ...valid, Origin: 'http://localhost:8100' }));
    multi.requireOrigin(request(valid));
    for (const Origin of ['https://*.bad', 'https://example.test.evil', 'null'])
        assert.throws(() => multi.requireOrigin(request({ ...valid, Origin })), { status: 403 });
});

test('persistent quotas bound concurrency, per-connection, minute and daily usage', () => {
    const chat = load();
    const values = {};
    const record = {
        getFloat: key => values[key] || 0,
        getInt: key => values[key] || 0,
        getString: key => JSON.stringify(values[key]),
        set: (key, value) => { values[key] = value; }
    };
    const app = { findFirstRecordByFilter: () => record, save: () => {}, runInTransaction: fn => fn(app) };
    const now = 86400000 * 10;
    chat.reserve(app, '127.0.0.1', now);
    assert.throws(() => chat.reserve(app, 'other', now), { status: 429 });
    chat.release(app);
    for (let i = 0; i < 2; i++) { chat.reserve(app, '127.0.0.1', now); chat.release(app); }
    assert.throws(() => chat.reserve(app, '127.0.0.1', now), { status: 429 });
    for (let i = 0; i < 7; i++) { chat.reserve(app, `client-${i}`, now); chat.release(app); }
    assert.throws(() => chat.reserve(app, 'extra', now), { status: 429 });
    chat.reserve(app, '127.0.0.1', now + 60000);
    chat.release(app);
    values.day_count = 100;
    assert.throws(() => chat.reserve(app, 'new', now + 120000), { status: 429 });
    chat.reserve(app, 'new', now + 86400000);
    chat.release(app);
    assert.equal(values.day_count, 1);
    assert.equal(values.minute_count, 1);
    values.busy_until = now + 86400000 - 1;
    chat.reserve(app, 'new', now + 86400000);
    assert.equal(values.day_count, 2);
    chat.clearExpiredClients(app, now + 86400000 + 60000);
    assert.equal(Object.keys(values.clients).length, 0);
    assert.equal(values.day_count, 2);
});

test('Ollama requests use only server settings with hard output and context limits', () => {
    let sent;
    const chat = load({ $http: { send: value => {
        sent = value;
        return { statusCode: 200, json: { message: { content: '<script>alert(1)</script>' } } };
    } } });
    assert.equal(chat.complete(null, { model: 'model', system_prompt: 'Policy', max_tokens: 128 },
        [{ role: 'user', content: 'Hi' }]), '<script>alert(1)</script>');
    assert.equal(sent.url, 'http://host.docker.internal:11434/api/chat');
    assert.equal(sent.timeout, 45);
    const body = JSON.parse(sent.body);
    assert.equal(body.stream, false);
    assert.deepEqual(body.options, { num_predict: 128, num_ctx: 4096 });
    assert.equal(body.messages[0].role, 'system');
    for (const response of [
        { statusCode: 500, json: {} },
        { statusCode: 200, json: { message: { content: '' } } },
        { statusCode: 200, json: { message: { content: 'x'.repeat(16001) } } }
    ]) {
        assert.throws(() => load({ $http: { send: () => response } }).complete(null,
            { model: 'model', system_prompt: '', max_tokens: 128 }, []));
    }
});
