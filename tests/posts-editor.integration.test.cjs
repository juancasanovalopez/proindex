const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, cp, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const http = require('node:http');

test('isolated post editor API: schema, superuser-only writes, all fields, screenshots and visibility', {
    skip: !process.env.PB_TEST_BINARY,
    timeout: 45000
}, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'proindex-posts-test-'));
    let server;
    t.after(async () => {
        if (server && server.exitCode === null) {
            server.kill('SIGTERM');
            await once(server, 'exit');
        }
        await rm(directory, { recursive: true, force: true });
    });
    const migrations = path.join(directory, 'migrations');
    await cp('pb_migrations', migrations, { recursive: true });
    const fields = [
        { name: 'name', type: 'text' },
        { name: 'repo', type: 'url' },
        { name: 'public', type: 'url' },
        { name: 'languages', type: 'select', values: ['C', 'python', 'C++', 'Rust', 'Go'], maxSelect: 5 },
        { name: 'tech_stack', type: 'select', values: ['docker'], maxSelect: 1 },
        { name: 'screenshot', type: 'file', maxSelect: 10 },
        ...['es', 'en', 'fr'].map(lang => ({ name: `description_${lang}`, type: 'editor' })),
        { name: 'arch_schema', type: 'text' },
        { name: 'is_public', type: 'bool' }
    ];
    await writeFile(path.join(migrations, '20260901000000_test_projects.js'),
        `migrate(app => app.save(new Collection(${JSON.stringify({
            name: 'projects', type: 'base', fields,
            listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: ''
        })})));`);
    const password = randomBytes(24).toString('hex');
    const binary = process.env.PB_TEST_BINARY;
    const common = ['--automigrate=false', '--dir', path.join(directory, 'db'),
        '--migrationsDir', migrations, '--hooksDir', path.resolve('pb_hooks')];
    const setup = spawnSync(binary, ['superuser', 'upsert', 'posts@example.test', password, ...common], { encoding: 'utf8' });
    assert.equal(setup.status, 0, setup.stderr + setup.stdout);
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    let output = '';
    server = spawn(binary, ['serve', '--http', `127.0.0.1:${port}`, '--publicDir', path.resolve('pb_public'),
        '--hooksWatch=false', ...common], { stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => { output += data; });
    server.stderr.on('data', data => { output += data; });
    for (let i = 0; i < 100; i++) {
        try {
            if ((await fetch(`${origin}/api/health`)).ok) break;
        } catch (error) {
            if (i === 99) throw new Error(`${error.message}\n${output}`);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    function api(url, method = 'GET', body, token = '') {
        const multipart = body instanceof FormData;
        return fetch(origin + url, {
            method,
            headers: { ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: token } : {}) },
            ...(body ? { body: multipart ? body : JSON.stringify(body) } : {})
        });
    }
    const auth = await api('/api/collections/_superusers/auth-with-password', 'POST', {
        identity: 'posts@example.test', password
    });
    assert.equal(auth.status, 200);
    const { token } = await auth.json();
    const schema = await (await api('/api/collections/projects', 'GET', null, token)).json();
    for (const rule of ['createRule', 'updateRule', 'deleteRule']) assert.equal(schema[rule], null);
    assert.equal(schema.listRule, 'is_public = true');
    assert.equal(schema.viewRule, 'is_public = true');
    for (const field of fields) assert.ok(schema.fields.some(item => item.name === field.name));
    assert.equal((await api('/api/collections/projects')).status, 401);
    const records = '/api/collections/projects/records';
    assert.equal((await api(records, 'POST', { name: 'Unauthorized' })).status, 403);
    const users = await api('/api/collections', 'POST', {
        name: 'editor_test_users', type: 'auth', passwordAuth: { enabled: true, identityFields: ['email'] }
    }, token);
    assert.equal(users.status, 200);
    assert.equal((await api('/api/collections/editor_test_users/records', 'POST', {
        email: 'user@example.test', password, passwordConfirm: password
    }, token)).status, 200);
    const user = await (await api('/api/collections/editor_test_users/auth-with-password', 'POST', {
        identity: 'user@example.test', password
    })).json();
    assert.equal((await api(records, 'POST', { name: 'Unauthorized' }, user.token)).status, 403);
    assert.equal((await api('/api/collections/projects', 'GET', null, user.token)).status, 403);
    const values = {
        name: 'Complete project', repo: 'https://example.test/repo', public: 'https://example.test/app',
        languages: ['C', 'python'], tech_stack: 'docker',
        description_es: '<p>Hola <strong>mundo</strong></p>',
        description_en: '<p>Hello world</p>', description_fr: '<p>Bonjour</p>',
        arch_schema: 'flowchart LR\n browser --> api', is_public: false
    };
    const body = new FormData();
    for (const [key, value] of Object.entries(values)) body.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
    const image = new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0uUAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' });
    body.append('screenshot+', image, 'first.png');
    const created = await api(records, 'POST', body, token);
    assert.equal(created.status, 200, JSON.stringify(await created.clone().json()));
    const record = await created.json();
    for (const [key, value] of Object.entries(values)) {
        assert.deepEqual(typeof record[key] === 'string' ? record[key].replace(/\r\n/g, '\n') : record[key], value, key);
    }
    assert.equal(record.screenshot.length, 1);
    assert.equal((await (await api(records)).json()).items.length, 0);
    assert.equal((await api(`${records}/${record.id}`)).status, 404);
    for (const role of ['', user.token]) {
        assert.equal((await api(`${records}/${record.id}`, 'PATCH', { name: 'Unauthorized' }, role)).status, 403);
        assert.equal((await api(`${records}/${record.id}`, 'DELETE', null, role)).status, 403);
    }
    const update = new FormData();
    update.append('is_public', 'true');
    update.append('languages', '[]');
    update.append('screenshot+', image, 'second.png');
    const published = await (await api(`${records}/${record.id}`, 'PATCH', update, token)).json();
    assert.equal(published.is_public, true);
    assert.deepEqual(published.languages, []);
    assert.equal(published.screenshot.length, 2, 'Appending a screenshot preserves existing files');
    assert.equal((await (await api(records)).json()).items.length, 1);
    assert.equal((await api(`${records}/${record.id}`)).status, 200);
    const removal = new FormData();
    removal.append('screenshot-', record.screenshot[0]);
    const removed = await (await api(`${records}/${record.id}`, 'PATCH', removal, token)).json();
    assert.equal(removed.screenshot.length, 1);
    assert.ok(!removed.screenshot.includes(record.screenshot[0]));
    assert.equal(removed.description_es, values.description_es, 'Unchanged fields survive partial updates');
    assert.equal((await (await api(records, 'GET', null, token)).json()).totalItems, 1);
    const page = await api('/settings.html');
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const html = await page.text();
    assert.equal((html.match(/id="chat-login"/g) || []).length, 1);
    assert.equal((html.match(/id="chat-logout"/g) || []).length, 1);
    assert.match(html, /id="post-editor"/);
    assert.match(html, /id="chat-configuration"/);
    for (const [legacy, section] of [['chat-settings', 'chat'], ['posts-editor', 'posts']]) {
        const redirect = await fetch(`${origin}/${legacy}.html`, { redirect: 'manual' });
        assert.equal(redirect.status, 302);
        assert.equal(redirect.headers.get('location'), `settings.html#${section}`);
    }
});
