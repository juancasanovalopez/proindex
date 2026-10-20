const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const http = require('node:http');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');

test('isolated PocketBase API: auth, configuration, Ollama, origins and quotas', {
    skip: !process.env.PB_TEST_BINARY,
    timeout: 45000
}, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'proindex-chat-test-'));
    let server;
    let ollama;
    t.after(async () => {
        if (server && server.exitCode === null) {
            server.kill('SIGTERM');
            await once(server, 'exit');
        }
        if (ollama) {
            ollama.closeAllConnections();
            await new Promise(resolve => ollama.close(resolve));
        }
        await rm(directory, { recursive: true, force: true });
    });
    const password = randomBytes(24).toString('hex');
    const binary = process.env.PB_TEST_BINARY;
    const common = ['--automigrate=false', '--dir', directory, '--migrationsDir', path.resolve('pb_migrations'), '--hooksDir', path.resolve('pb_hooks')];
    const setup = spawnSync(binary, ['superuser', 'upsert', 'test@example.test', password, ...common], { encoding: 'utf8' });
    assert.equal(setup.status, 0, setup.stderr + setup.stdout);
    let upstreamBody;
    let upstreamStatus = 200;
    let delay = false;
    ollama = http.createServer(async (req, res) => {
        if (req.method === 'GET' && req.url === '/api/tags') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ models: [
                { name: 'test:latest', capabilities: ['completion'] },
                { name: 'embed:latest', capabilities: ['embedding'] },
                { name: 'bad model' }
            ] }));
            return;
        }
        let body = '';
        for await (const part of req) body += part;
        upstreamBody = JSON.parse(body);
        if (delay) await new Promise(resolve => setTimeout(resolve, 250));
        res.writeHead(upstreamStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: { content: 'Respuesta de prueba <img src=x onerror=alert(1)>' } }));
    });
    ollama.listen(0, '127.0.0.1');
    await once(ollama, 'listening');
    const portProbe = http.createServer();
    portProbe.listen(0, '127.0.0.1');
    await once(portProbe, 'listening');
    const port = portProbe.address().port;
    await new Promise(resolve => portProbe.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    let output = '';
    server = spawn(binary, ['serve', '--http', `127.0.0.1:${port}`, '--publicDir', path.resolve('pb_public'), '--hooksWatch=false', ...common], {
        env: { ...process.env, CHAT_PUBLIC_ORIGIN: origin, OLLAMA_URL: `http://127.0.0.1:${ollama.address().port}` },
        stdio: ['ignore', 'pipe', 'pipe']
    });
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
    async function api(url, method = 'GET', body, token = '', extra = {}) {
        return fetch(origin + url, {
            method,
            headers: { 'Content-Type': 'application/json', Origin: origin, ...(token ? { Authorization: token } : {}), ...extra },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
    }
    const prefix = '/api/local-chat';
    assert.deepEqual(await (await api(`${prefix}/status`)).json(), { enabled: false });
    assert.equal((await api(`${prefix}/settings`)).status, 401);
    assert.equal((await api(`${prefix}/settings`, 'PUT', { enabled: true })).status, 401);
    for (const collection of ['local_chat_settings', 'local_chat_quota']) {
        assert.equal((await api(`/api/collections/${collection}/records`)).status, 403);
        assert.equal((await api(`/api/collections/${collection}/records`, 'POST', {})).status, 403);
    }
    const auth = await api('/api/collections/_superusers/auth-with-password', 'POST', { identity: 'test@example.test', password });
    assert.equal(auth.status, 200, JSON.stringify(await auth.clone().json()));
    const { token } = await auth.json();
    const users = await api('/api/collections', 'POST', {
        name: 'chat_test_users', type: 'auth', passwordAuth: { enabled: true, identityFields: ['email'] }
    }, token);
    assert.equal(users.status, 200, JSON.stringify(await users.clone().json()));
    assert.equal((await api('/api/collections/chat_test_users/records', 'POST', {
        email: 'visitor@example.test', password, passwordConfirm: password
    }, token)).status, 200);
    const visitorAuth = await api('/api/collections/chat_test_users/auth-with-password', 'POST', {
        identity: 'visitor@example.test', password
    });
    assert.equal(visitorAuth.status, 200);
    const visitor = await visitorAuth.json();
    assert.equal((await api(`${prefix}/settings`, 'GET', null, visitor.token)).status, 403);
    assert.equal((await api(`${prefix}/settings`, 'PUT', { enabled: true }, visitor.token)).status, 403);
    const config = { enabled: true, model: 'test:latest', system_prompt: 'Be helpful.', max_tokens: 128 };
    assert.equal((await api(`${prefix}/models`)).status, 401);
    assert.equal((await api(`${prefix}/models`, 'GET', null, visitor.token)).status, 403);
    const models = await api(`${prefix}/models`, 'GET', null, token);
    assert.equal(models.status, 200);
    assert.equal(models.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await models.json(), { models: ['test:latest'] });
    assert.equal((await api(`${prefix}/settings`, 'PUT', { ...config, model: 'missing:latest' }, token)).status, 400);
    assert.equal((await api(`${prefix}/settings`, 'PUT', { ...config, model: 'embed:latest' }, token)).status, 400);
    const saved = await api(`${prefix}/settings`, 'PUT', config, token);
    assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json()));
    assert.deepEqual(await saved.json(), config);
    assert.equal((await api(`${prefix}/settings`, 'PUT', { ...config, max_tokens: 513 }, token)).status, 400);
    const body = { messages: [{ role: 'user', content: 'Hola' }] };
    assert.equal((await api(`${prefix}/messages`, 'POST', body, '', { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await api(`${prefix}/messages`, 'POST', { messages: [{ role: 'system', content: 'No' }] })).status, 400);
    assert.equal((await api(`${prefix}/messages`, 'POST', { messages: [{ role: 'user', content: 'x'.repeat(40000) }] })).status, 413);
    const reply = await api(`${prefix}/messages`, 'POST', body);
    assert.equal(reply.status, 200, JSON.stringify(await reply.clone().json()) + output);
    assert.equal((await reply.json()).message, 'Respuesta de prueba <img src=x onerror=alert(1)>');
    assert.equal(upstreamBody.model, config.model);
    assert.equal(upstreamBody.messages[0].role, 'system');
    assert.deepEqual(upstreamBody.options, { num_predict: 128, num_ctx: 4096 });
    delay = true;
    const first = api(`${prefix}/messages`, 'POST', body);
    await new Promise(resolve => setTimeout(resolve, 75));
    assert.equal((await api(`${prefix}/messages`, 'POST', body)).status, 429);
    assert.equal((await first).status, 200);
    upstreamStatus = 500;
    assert.equal((await api(`${prefix}/messages`, 'POST', body)).status, 502);
    assert.equal((await api(`${prefix}/messages`, 'POST', body, '', { 'X-Forwarded-For': '1.2.3.4' })).status, 429);
    assert.equal((await api(`${prefix}/settings`, 'PUT', { ...config, enabled: false }, token)).status, 200);
    assert.equal((await api(`${prefix}/messages`, 'POST', body)).status, 503);
    const settingsPage = await api('/chat-settings.html');
    assert.equal(settingsPage.headers.get('x-frame-options'), 'DENY');
    assert.match(settingsPage.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    let last;
    for (let i = 0; i < 6; i++) last = await api('/api/collections/_superusers/auth-with-password', 'POST', { identity: 'test@example.test', password: 'wrong' });
    assert.equal(last.status, 429);
});
