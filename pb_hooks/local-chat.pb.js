routerAdd('GET', '/api/local-chat/status', (e) => {
    const chat = require(`${__hooks}/lib/local-chat.js`);
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, { enabled: chat.settings($app).getBool('enabled') });
});

routerAdd('GET', '/api/local-chat/settings', (e) => {
    const chat = require(`${__hooks}/lib/local-chat.js`);
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, chat.configuration(chat.settings($app)));
}, $apis.requireSuperuserAuth());

routerAdd('GET', '/api/local-chat/models', (e) => {
    const chat = require(`${__hooks}/lib/local-chat.js`);
    e.response.header().set('Cache-Control', 'no-store');
    let models;
    try {
        models = chat.listModels();
    } catch (error) {
        $app.logger().error('Local chat model list failed', 'error', String(error));
        throw new ApiError(502, 'Ollama model list unavailable.');
    }
    return e.json(200, { models });
}, $apis.requireSuperuserAuth());

routerAdd('PUT', '/api/local-chat/settings', (e) => {
    const chat = require(`${__hooks}/lib/local-chat.js`);
    const value = chat.validateConfiguration(e.requestInfo().body);
    if (value.enabled) {
        let models;
        try {
            models = chat.listModels();
        } catch (error) {
            $app.logger().error('Local chat model validation failed', 'error', String(error));
            throw new ApiError(502, 'Ollama model list unavailable.');
        }
        if (!models.includes(value.model)) throw new BadRequestError('Select an installed Ollama model.');
    }
    const record = chat.settings($app);
    for (const key of ['enabled', 'model', 'system_prompt', 'max_tokens']) record.set(key, value[key]);
    $app.save(record);
    e.response.header().set('Cache-Control', 'no-store');
    $app.logger().info('Local chat configuration updated', 'admin', e.auth.id);
    return e.json(200, chat.configuration(record));
}, $apis.requireSuperuserAuth(), $apis.bodyLimit(12000));

routerAdd('POST', '/api/local-chat/messages', (e) => {
    const chat = require(`${__hooks}/lib/local-chat.js`);
    e.response.header().set('Cache-Control', 'no-store');
    chat.requireOrigin(e);
    const messages = chat.validateMessages(e.requestInfo().body);
    const config = chat.configuration(chat.settings($app));
    if (!config.enabled) throw new ApiError(503, 'Chat disabled.');
    chat.validateConfiguration(config);
    chat.reserve($app, e.remoteIP(), Date.now());
    try {
        return e.json(200, { message: chat.complete($app, config, messages) });
    } catch (error) {
        $app.logger().error('Local chat upstream failed', 'error', String(error));
        throw new ApiError(502, 'Local model unavailable.');
    } finally {
        chat.release($app);
    }
}, $apis.bodyLimit(32000));

cronAdd('cleanup-local-chat-clients', '* * * * *', () => {
    require(`${__hooks}/lib/local-chat.js`).clearExpiredClients($app, Date.now());
});

routerUse((e) => {
    if (['/settings.html', '/chat-settings.html', '/posts-editor.html'].includes(e.request.url.path)) {
        e.response.header().set('Cache-Control', 'no-store');
        e.response.header().set('X-Frame-Options', 'DENY');
        e.response.header().set('Referrer-Policy', 'no-referrer');
        e.response.header().set('X-Content-Type-Options', 'nosniff');
        e.response.header().set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; img-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'");
        if (e.request.url.path !== '/settings.html') {
            return e.redirect(302, `settings.html#${e.request.url.path === '/chat-settings.html' ? 'chat' : 'posts'}`);
        }
    }
    return e.next();
});
