const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { File } = require('node:buffer');
const t = require('../pb_public/locales/es.json');

class Element {
    constructor(tag = 'div') {
        this.tag = tag;
        this.children = [];
        this.listeners = {};
        this._value = '';
        this.files = [];
        this.hidden = false;
        this.checked = false;
    }
    get value() {
        return this.tag === 'select' ? this.selectedOptions[0]?.value || '' : this._value;
    }
    set value(value) {
        this._value = value;
        if (this.tag === 'select') this.children.forEach(option => { option.selected = option.value === value; });
    }
    get selectedOptions() { return this.children.filter(option => option.selected); }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); return child; }
    replaceChildren(...children) { this.children = children; }
    addEventListener(event, callback) { this.listeners[event] = callback; }
    querySelector() { return new Element('button'); }
}

const schema = [
    { name: 'id', type: 'text', system: true },
    { name: 'name', type: 'text', required: true, min: 1, max: 100 },
    { name: 'repo', type: 'url' },
    { name: 'public', type: 'url' },
    { name: 'languages', type: 'select', values: ['C', 'python', 'Rust'], maxSelect: 2 },
    { name: 'tech_stack', type: 'select', values: ['docker'], maxSelect: 1 },
    { name: 'screenshot', type: 'file', maxSelect: 10, maxSize: 1024 },
    ...['es', 'en', 'fr'].map(lang => ({ name: `description_${lang}`, type: 'editor' })),
    { name: 'arch_schema', type: 'text' },
    { name: 'is_public', type: 'bool' }
];

function setup(fields = schema, pages = 1) {
    const nodes = new Map();
    const requests = [];
    const events = {};
    let confirmed = true;
    let record = {
        id: 'existingpost001', collectionId: 'projects', name: 'Existing post',
        languages: ['python'], tech_stack: 'docker', screenshot: ['existing.png'],
        description_es: '<p>Hola</p>', description_en: '<p>Hello</p>', description_fr: '<p>Bonjour</p>',
        arch_schema: 'flowchart LR\n A --> B', is_public: false
    };
    const get = id => {
        if (!nodes.has(id)) nodes.set(id, new Element(id === 'post-select' ? 'select' : 'div'));
        return nodes.get(id);
    };
    const session = {
        isAuthenticated: () => true,
        touchSession() {},
        run: async action => action(),
        request: async (url, method = 'GET', body) => {
            requests.push({ url, method, body });
            if (url === 'api/collections/projects') return { fields };
            if (url.includes('?')) return {
                page: Number(new URLSearchParams(url.split('?')[1]).get('page')),
                totalPages: pages, totalItems: pages, items: [record]
            };
            if (method === 'GET') return record;
            record = { ...record, name: body.get('name'), is_public: body.get('is_public') === 'true' };
            return record;
        }
    };
    const context = {
        document: { getElementById: get, createElement: tag => new Element(tag) },
        window: {
            confirm: () => confirmed,
            addEventListener: (event, callback) => { events[event] = callback; }
        },
        renderizarDescripcion: (node, html) => { node.textContent = html; },
        URLSearchParams, FormData, console
    };
    vm.runInNewContext(fs.readFileSync('pb_public/js/posts-editor.js', 'utf8'), context);
    const editor = context.initializePostsEditor(t, session);
    function find(node, id) {
        if (node.id === id) return node;
        for (const child of node.children || []) {
            const result = find(child, id);
            if (result) return result;
        }
    }
    const input = name => find(get('post-fields'), `post-field-${name}`);
    const emit = (id, event) => get(id).listeners[event]({
        preventDefault() {}, target: get(id), currentTarget: get(id)
    });
    async function edit() {
        get('post-select').value = record.id;
        await emit('post-select', 'change');
    }
    return { get, input, emit, requests, events,
        callbacks: () => ({ onAuthenticated: editor.load, onLogout: editor.reset }), edit,
        confirm: value => { confirmed = value; } };
}

test('editor renders every real schema field, retains HTML and makes system fields read-only', async () => {
    const fixture = setup();
    await fixture.callbacks().onAuthenticated();
    assert.equal(fixture.get('post-fields').children.length, schema.length);
    assert.equal(fixture.input('id').readOnly, true);
    assert.equal(fixture.input('name').required, true);
    assert.equal(fixture.input('name').maxLength, 100);
    assert.equal(fixture.input('languages').multiple, true);
    assert.equal(fixture.input('tech_stack').multiple, false);
    assert.equal(fixture.input('screenshot').multiple, true);
    assert.equal(fixture.get('post-view').hidden, true);
    await fixture.edit();
    for (const [field, value] of [
        ['name', 'Existing post'], ['description_es', '<p>Hola</p>'],
        ['description_en', '<p>Hello</p>'], ['description_fr', '<p>Bonjour</p>'],
        ['arch_schema', 'flowchart LR\n A --> B']
    ]) assert.equal(fixture.input(field).value, value);
    assert.equal(fixture.input('languages').selectedOptions[0].value, 'python');
    assert.equal(fixture.get('posts-previous').disabled, true);
    assert.equal(fixture.get('posts-next').disabled, true);
});

test('editor serializes all writable fields, preserves files, clears selections and creates/updates through native API', async () => {
    const fixture = setup();
    await fixture.callbacks().onAuthenticated();
    await fixture.edit();
    fixture.input('name').value = 'Edited post';
    fixture.input('languages').children.forEach(option => { option.selected = false; });
    fixture.input('is_public').checked = true;
    fixture.input('screenshot').files = [new File(['new image'], 'new.png', { type: 'image/png' })];
    await fixture.emit('post-editor', 'submit');
    const update = fixture.requests.find(item => item.method === 'PATCH');
    assert.equal(update.url, 'api/collections/projects/records/existingpost001');
    assert.equal(update.body.has('id'), false);
    for (const field of schema.filter(item => !item.system && item.type !== 'file')) {
        assert.ok(update.body.has(field.name), field.name);
    }
    assert.equal(update.body.get('name'), 'Edited post');
    assert.equal(update.body.get('languages'), '[]');
    assert.equal(update.body.get('is_public'), 'true');
    assert.equal(update.body.get('screenshot+').name, 'new.png');
    assert.equal(update.body.has('screenshot-'), false);
    assert.equal(fixture.get('post-view').hidden, false);
    const wrapper = fixture.get('post-fields').children.find(node => node.children[0].htmlFor === 'post-field-screenshot');
    const remove = wrapper.children.find(node => node.className === 'post-files').children[0].children.at(-1).children[0];
    remove.checked = true;
    await fixture.emit('post-editor', 'submit');
    assert.equal(fixture.requests.filter(item => item.method === 'PATCH').at(-1).body.get('screenshot-'), 'existing.png');
    await fixture.emit('post-new', 'click');
    fixture.input('name').value = 'New private post';
    await fixture.emit('post-editor', 'submit');
    const created = fixture.requests.find(item => item.method === 'POST');
    assert.equal(created.url, 'api/collections/projects/records');
    assert.equal(created.body.get('is_public'), 'false');
});

test('editor prevents oversized files and too many selections without sending a write', async () => {
    const fixture = setup();
    await fixture.callbacks().onAuthenticated();
    fixture.input('screenshot').files = [new File(['x'.repeat(1025)], 'large.png')];
    await assert.rejects(fixture.emit('post-editor', 'submit'), /Revisa el número de archivos/);
    fixture.input('screenshot').files = [];
    fixture.input('languages').children.forEach(option => { option.selected = true; });
    await assert.rejects(fixture.emit('post-editor', 'submit'), /Máximo de opciones: 2/);
    assert.ok(!fixture.requests.some(item => ['POST', 'PATCH'].includes(item.method)));
    assert.equal(fixture.get('posts-controls').disabled, false);
});

test('unsaved changes require confirmation and logout clears private records and HTML', async () => {
    const fixture = setup();
    await fixture.callbacks().onAuthenticated();
    await fixture.edit();
    fixture.input('name').value = 'Unsaved name';
    fixture.emit('post-editor', 'input');
    fixture.confirm(false);
    await fixture.emit('post-new', 'click');
    await fixture.emit('post-reset', 'click');
    assert.equal(fixture.input('name').value, 'Unsaved name');
    let prevented = false;
    const unload = { preventDefault() { prevented = true; } };
    fixture.events.beforeunload(unload);
    assert.equal(prevented, true);
    fixture.confirm(true);
    await fixture.emit('post-reset', 'click');
    assert.equal(fixture.input('name').value, 'Existing post');
    fixture.callbacks().onLogout();
    assert.equal(fixture.get('posts-administration').hidden, true);
    assert.equal(fixture.get('post-fields').children.length, 0);
    assert.equal(fixture.get('post-select').children.length, 0);
});

test('pagination reaches subsequent pages without losing unsaved edits or enabling invalid navigation', async () => {
    const fixture = setup(schema, 2);
    await fixture.callbacks().onAuthenticated();
    fixture.input('name').value = 'Unsaved name';
    fixture.emit('post-editor', 'input');
    await fixture.emit('posts-next', 'click');
    assert.ok(fixture.requests.at(-1).url.includes('page=2'));
    assert.equal(fixture.input('name').value, 'Unsaved name');
    assert.equal(fixture.get('posts-previous').disabled, false);
    assert.equal(fixture.get('posts-next').disabled, true);
    assert.equal(fixture.get('settings-status').textContent, t.postsAdminListLoaded);
    await fixture.emit('posts-previous', 'click');
    assert.ok(fixture.requests.at(-1).url.includes('page=1'));
    assert.equal(fixture.get('posts-previous').disabled, true);
    assert.equal(fixture.get('posts-next').disabled, false);
});
