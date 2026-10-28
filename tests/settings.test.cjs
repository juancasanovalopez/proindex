const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const t = require('../pb_public/locales/es.json');

function setup(hash = '') {
    const nodes = new Map();
    const get = id => {
        if (!nodes.has(id)) nodes.set(id, { hidden: true, textContent: '' });
        return nodes.get(id);
    };
    const buttons = ['posts', 'chat'].map(name => ({
        dataset: { settingsSection: name },
        attributes: { 'aria-controls': `settings-${name}` },
        getAttribute(key) { return this.attributes[key]; },
        setAttribute(key, value) { this.attributes[key] = value; },
        classList: { toggle() {} },
        addEventListener(_, callback) { this.click = callback; }
    }));
    let callbacks;
    let sessions = 0;
    let authenticated = true;
    let pending = false;
    const modules = {};
    const received = [];
    const session = {
        isAuthenticated: () => authenticated,
        run: async action => {
            if (pending) return;
            pending = true;
            get('settings-status').textContent = t.chatAdminProcessing;
            try { await action(); } finally { pending = false; }
        }
    };
    function module(name, shared) {
        received.push(shared);
        const state = {
            loads: 0, resets: 0, draft: '', fail: null, wait: null,
            async load() {
                this.loads++;
                if (this.wait) await this.wait;
                if (this.fail) throw this.fail;
                get('settings-status').textContent = `${name} loaded`;
            },
            reset() { this.resets++; this.draft = ''; }
        };
        modules[name] = state;
        return state;
    }
    const context = {
        TypeError,
        document: { getElementById: get, querySelectorAll: () => buttons },
        window: { location: { hash } },
        console: { error() {} },
        initializeAdminSession: (_, handlers) => { sessions++; callbacks = handlers; return session; },
        initializePostsEditor: (_, shared) => module('posts', shared),
        initializeChatSettings: (_, shared) => module('chat', shared)
    };
    vm.runInNewContext(fs.readFileSync('pb_public/js/settings.js', 'utf8'), context);
    context.initializeSettings(t);
    return { get, buttons, modules, session, received, sessions: () => sessions,
        callbacks: () => callbacks, deny: () => { authenticated = false; } };
}

test('settings creates exactly one session, loads posts first and keeps drafts while switching sections', async () => {
    const fixture = setup();
    assert.equal(fixture.sessions(), 1);
    assert.ok(fixture.received.every(value => value === fixture.session));
    assert.equal(fixture.modules.posts.loads, 0);
    assert.equal(fixture.modules.chat.loads, 0);
    await fixture.callbacks().onAuthenticated();
    assert.equal(fixture.get('settings-administration').hidden, false);
    assert.equal(fixture.get('settings-posts').hidden, false);
    assert.equal(fixture.get('settings-chat').hidden, true);
    assert.equal(fixture.modules.posts.loads, 1);
    fixture.modules.posts.draft = 'Unsaved post';
    await fixture.buttons[1].click();
    fixture.modules.chat.draft = 'Unsaved prompt';
    assert.equal(fixture.modules.chat.loads, 1);
    assert.equal(fixture.get('settings-posts').hidden, true);
    assert.equal(fixture.buttons[1].attributes['aria-pressed'], 'true');
    await fixture.buttons[0].click();
    assert.equal(fixture.modules.posts.loads, 1);
    assert.equal(fixture.modules.posts.draft, 'Unsaved post');
    assert.equal(fixture.get('settings-status').textContent, 'posts loaded');
    await fixture.buttons[1].click();
    assert.equal(fixture.modules.chat.loads, 1);
    assert.equal(fixture.modules.chat.draft, 'Unsaved prompt');
    assert.equal(fixture.get('settings-status').textContent, 'chat loaded');
});

test('legacy chat fragment opens chat first; shared logout clears both sections and a new login reloads data', async () => {
    const fixture = setup('#chat');
    await fixture.callbacks().onAuthenticated();
    assert.equal(fixture.modules.chat.loads, 1);
    assert.equal(fixture.modules.posts.loads, 0);
    fixture.modules.chat.draft = 'Private prompt';
    await fixture.buttons[0].click();
    fixture.modules.posts.draft = 'Private post';
    fixture.callbacks().onLogout();
    assert.equal(fixture.get('settings-administration').hidden, true);
    for (const section of Object.values(fixture.modules)) {
        assert.equal(section.resets, 1);
        assert.equal(section.draft, '');
    }
    await fixture.callbacks().onAuthenticated();
    assert.equal(fixture.modules.chat.loads, 2);
    await fixture.buttons[0].click();
    assert.equal(fixture.modules.posts.loads, 2);
});

test('a failed initial section keeps the shared session available and allows retry or another section', async () => {
    const fixture = setup('#chat');
    fixture.modules.chat.fail = new TypeError('Network error');
    await fixture.callbacks().onAuthenticated();
    assert.equal(fixture.get('settings-administration').hidden, false);
    assert.equal(fixture.get('settings-status').textContent, t.chatAdminUnavailable);
    await fixture.buttons[0].click();
    assert.equal(fixture.modules.posts.loads, 1);
    fixture.modules.chat.fail = null;
    await fixture.buttons[1].click();
    assert.equal(fixture.modules.chat.loads, 2);
    fixture.deny();
    await fixture.buttons[0].click();
    assert.equal(fixture.get('settings-chat').hidden, false);
});

test('concurrent navigation cannot change the active section during an outstanding request', async () => {
    const fixture = setup();
    await fixture.callbacks().onAuthenticated();
    let finish;
    fixture.modules.chat.wait = new Promise(resolve => { finish = resolve; });
    const loading = fixture.buttons[1].click();
    await fixture.buttons[0].click();
    finish();
    await loading;
    assert.equal(fixture.get('settings-chat').hidden, false);
    assert.equal(fixture.modules.chat.loads, 1);
    await fixture.buttons[0].click();
    assert.equal(fixture.get('settings-posts').hidden, false);
    assert.equal(fixture.get('settings-status').textContent, 'posts loaded');
});

test('unified settings markup has a single login, MFA, logout and no duplicate ids', () => {
    const html = fs.readFileSync('pb_public/settings.html', 'utf8');
    const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ['chat-login', 'chat-mfa', 'chat-logout', 'post-editor', 'chat-configuration']) {
        assert.equal(ids.filter(value => value === id).length, 1);
    }
    assert.ok(!fs.existsSync('pb_public/chat-settings.html'));
    assert.ok(!fs.existsSync('pb_public/posts-editor.html'));
});
