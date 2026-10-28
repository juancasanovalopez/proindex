const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const translations = require('../pb_public/locales/es.json');

function setup(respond, { secure = true, embedded = false } = {}) {
    const elements = new Map();
    const events = {};
    const timers = new Map();
    const requests = [];
    let timerId = 0;
    let authenticated = 0;
    let loggedOut = 0;
    function get(id) {
        if (!elements.has(id)) elements.set(id, {
            value: '', hidden: true, disabled: false, textContent: '',
            listeners: {},
            addEventListener(event, callback) { this.listeners[event] = callback; },
            reset() {},
            focus() {},
            querySelector() { return get('submit'); }
        });
        return elements.get(id);
    }
    const window = {
        isSecureContext: secure,
        self: {},
        addEventListener: (name, callback) => { events[name] = callback; }
    };
    window.top = embedded ? {} : window.self;
    const context = {
        document: { getElementById: get, addEventListener: (name, callback) => { events[name] = callback; } },
        window, FormData, AbortSignal,
        console: { error() {} },
        setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
        clearTimeout: id => timers.delete(id),
        fetch: async (path, options) => {
            requests.push({ path, ...options });
            const result = await respond(path, options);
            return { ok: result.status < 400, status: result.status, json: async () => result.body };
        }
    };
    vm.runInNewContext(fs.readFileSync('pb_public/js/admin-session.js', 'utf8'), context);
    const session = context.initializeAdminSession(translations, {
        onAuthenticated: async () => { authenticated++; },
        onLogout: () => { loggedOut++; }
    });
    async function submit(id) {
        await get(id).listeners.submit({ preventDefault() {}, target: get(id) });
    }
    async function login() {
        get('admin-email').value = 'admin@example.test';
        get('admin-password').value = 'test-secret';
        await submit('chat-login');
    }
    return { get, events, timers, requests, session, submit, login,
        authenticated: () => authenticated, loggedOut: () => loggedOut };
}

test('shared admin authentication keeps tokens in memory, handles uploads and expires after five idle minutes', async () => {
    const fixture = setup(async path => ({
        status: 200,
        body: path.endsWith('auth-with-password') ? { token: 'test-token', record: { id: 'admin' } } : {}
    }));
    assert.equal(fixture.get('chat-login').hidden, false);
    await fixture.login();
    assert.equal(fixture.authenticated(), 1);
    assert.equal(fixture.get('admin-password').value, '');
    assert.equal(fixture.get('chat-login').hidden, true);
    assert.equal(fixture.session.isAuthenticated(), true);
    const body = new FormData();
    body.append('name', 'Project');
    await fixture.session.request('api/collections/projects/records', 'POST', body);
    const upload = fixture.requests.at(-1);
    assert.equal(upload.headers.Authorization, 'test-token');
    assert.equal(upload.headers['Content-Type'], undefined, 'Browser must generate the multipart boundary');
    assert.equal(upload.body, body);
    assert.equal(upload.cache, 'no-store');
    assert.equal(upload.credentials, 'omit');
    const [timer] = fixture.timers.values();
    assert.equal(timer.delay, 300000);
    timer.callback();
    assert.equal(fixture.session.isAuthenticated(), false);
    assert.equal(fixture.loggedOut(), 1);
    assert.equal(fixture.get('settings-status').textContent, translations.chatAdminExpired);
    assert.equal(fixture.get('chat-login').hidden, false);
});

test('shared admin authentication supports the password + MFA/OTP flow', async () => {
    const fixture = setup(async path => path.endsWith('auth-with-password')
        ? { status: 401, body: { mfaId: 'mfa-test' } }
        : path.endsWith('request-otp')
            ? { status: 200, body: { otpId: 'otp-test' } }
            : { status: 200, body: { token: 'otp-token', record: { id: 'admin' } } });
    await fixture.login();
    assert.equal(fixture.authenticated(), 0);
    assert.equal(fixture.get('chat-mfa').hidden, false);
    assert.equal(fixture.get('settings-status').textContent, translations.chatAdminMfaSent);
    fixture.get('admin-code').value = '12345678';
    await fixture.submit('chat-mfa');
    assert.equal(fixture.authenticated(), 1);
    assert.deepEqual(JSON.parse(fixture.requests.at(-1).body), {
        mfaId: 'mfa-test', otpId: 'otp-test', password: '12345678'
    });
    assert.equal(fixture.get('admin-code').value, '');
});

test('stale responses after logout cannot restore administration or overwrite the status', async () => {
    let finish;
    const fixture = setup(() => new Promise(resolve => { finish = resolve; }));
    const pending = fixture.login();
    fixture.events.pagehide();
    finish({ status: 200, body: { token: 'late-token', record: { id: 'admin' } } });
    await pending;
    assert.equal(fixture.authenticated(), 0);
    assert.equal(fixture.session.isAuthenticated(), false);
    assert.equal(fixture.get('settings-status').textContent, translations.chatAdminLoggedOut);
});

test('server denials clear the session and validation errors retain field details', async () => {
    const fixture = setup(async path => ({
        status: path === 'denied' ? 403 : path === 'invalid' ? 400 : 200,
        body: path === 'invalid' ? { data: { name: { message: 'Required.' } } }
            : { token: 'test-token', record: { id: 'admin' } }
    }));
    await fixture.login();
    await assert.rejects(fixture.session.request('invalid'), /name: Required\./);
    await assert.rejects(fixture.session.request('denied'), /\(403\)/);
    assert.equal(fixture.session.isAuthenticated(), false);
    assert.equal(fixture.get('settings-status').textContent, translations.chatAdminDenied);
});

test('a network failure after logout does not replace the logout status', async () => {
    let reject;
    const fixture = setup(() => new Promise((_, fail) => { reject = fail; }));
    const pending = fixture.login();
    fixture.events.pagehide();
    reject(new TypeError('Network unavailable'));
    await pending;
    assert.equal(fixture.authenticated(), 0);
    assert.equal(fixture.get('settings-status').textContent, translations.chatAdminLoggedOut);
});

test('administration requires a secure context and cannot be embedded', () => {
    for (const options of [{ secure: false }, { embedded: true }]) {
        const fixture = setup(async () => { throw new Error('No requests expected'); }, options);
        assert.equal(fixture.get('chat-login').hidden, true);
        assert.equal(fixture.get('settings-status').textContent, translations.chatAdminBlocked);
        assert.equal(fixture.requests.length, 0);
    }
});
