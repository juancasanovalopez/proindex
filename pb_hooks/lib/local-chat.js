function settings(app) {
    return app.findFirstRecordByFilter('local_chat_settings', 'id != ""');
}

function configuration(record) {
    return {
        enabled: record.getBool('enabled'),
        model: record.getString('model'),
        system_prompt: record.getString('system_prompt'),
        max_tokens: record.getInt('max_tokens')
    };
}

function validateConfiguration(value) {
    if (!value || typeof value.enabled !== 'boolean' ||
        typeof value.model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(value.model) ||
        typeof value.system_prompt !== 'string' || value.system_prompt.length > 2000 ||
        !Number.isInteger(value.max_tokens) || value.max_tokens < 1 || value.max_tokens > 512) {
        throw new BadRequestError('Invalid chat configuration.');
    }
    if (value.enabled && allowedOrigins().length === 0) {
        throw new BadRequestError('Set CHAT_PUBLIC_ORIGIN on the server before enabling chat.');
    }
    return value;
}

function validateMessages(body) {
    const messages = body && body.messages;
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 9 ||
        messages.length % 2 !== 1) throw new BadRequestError('Invalid conversation.');
    let length = 0;
    const result = messages.map((message, index) => {
        if (!message || message.role !== (index % 2 === 0 ? 'user' : 'assistant') ||
            typeof message.content !== 'string' || !message.content.trim() ||
            message.content.length > (message.role === 'user' ? 2000 : 16000)) throw new BadRequestError('Invalid message.');
        length += message.content.length;
        return { role: message.role, content: message.content };
    });
    if (length > 8000) throw new BadRequestError('Conversation too long.');
    return result;
}

function allowedOrigins() {
    return ($os.getenv('CHAT_PUBLIC_ORIGIN') || '').split(',')
        .map(origin => origin.trim().replace(/\/+$/, ''))
        .filter(origin => /^https?:\/\/(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i.test(origin));
}

function requireOrigin(e) {
    const origin = e.request.header.get('Origin');
    if (!origin || !allowedOrigins().includes(origin) ||
        e.request.header.get('Sec-Fetch-Site') === 'cross-site') {
        throw new ForbiddenError('Origin not allowed.');
    }
    if (!/^application\/json(?:;|$)/i.test(e.request.header.get('Content-Type'))) {
        throw new BadRequestError('JSON required.');
    }
}

function reserve(app, ip, now) {
    const minute = Math.floor(now / 60000);
    const day = Math.floor(now / 86400000);
    app.runInTransaction((tx) => {
        const quota = tx.findFirstRecordByFilter('local_chat_quota', 'id != ""');
        if (quota.getFloat('busy_until') > now) throw new ApiError(429, 'Chat busy.');
        const minuteCount = quota.getFloat('minute') === minute ? quota.getInt('minute_count') : 0;
        const dayCount = quota.getFloat('day') === day ? quota.getInt('day_count') : 0;
        const clients = quota.getFloat('minute') === minute
            ? JSON.parse(quota.getString('clients') || '{}') : {};
        // Use the connection address, never visitor-controlled forwarding headers.
        const client = $security.sha256(ip);
        if (minuteCount >= 10 || dayCount >= 100 || (clients[client] || 0) >= 3) {
            throw new ApiError(429, 'Chat quota exceeded.');
        }
        clients[client] = (clients[client] || 0) + 1;
        quota.set('minute', minute);
        quota.set('minute_count', minuteCount + 1);
        quota.set('day', day);
        quota.set('day_count', dayCount + 1);
        quota.set('clients', clients);
        // Persistent lease survives restarts and bounds concurrent model requests.
        quota.set('busy_until', now + 60000);
        tx.save(quota);
    });
}

function release(app) {
    app.runInTransaction((tx) => {
        const quota = tx.findFirstRecordByFilter('local_chat_quota', 'id != ""');
        quota.set('busy_until', 0);
        tx.save(quota);
    });
}

function clearExpiredClients(app, now) {
    app.runInTransaction((tx) => {
        const quota = tx.findFirstRecordByFilter('local_chat_quota', 'id != ""');
        if (quota.getFloat('minute') < Math.floor(now / 60000)) {
            quota.set('clients', {});
            tx.save(quota);
        }
    });
}

function ollamaBase() {
    const base = ($os.getenv('OLLAMA_URL') || 'http://host.docker.internal:11434').replace(/\/+$/, '');
    if (!/^https?:\/\/[^/?#@]+(?::\d+)?$/.test(base)) {
        throw new Error('Invalid server-side OLLAMA_URL.');
    }
    return base;
}

function listModels() {
    const response = $http.send({ url: `${ollamaBase()}/api/tags`, method: 'GET', timeout: 10 });
    const models = response.json && response.json.models;
    if (response.statusCode !== 200 || !Array.isArray(models)) {
        throw new Error('Invalid Ollama model list.');
    }
    const names = models
        .filter(model => model && (!Array.isArray(model.capabilities) || model.capabilities.includes('completion')))
        .map(model => model.name || model.model)
        .filter(name => typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(name));
    return Array.from(new Set(names)).sort().slice(0, 200);
}

function complete(app, config, messages) {
    const base = ollamaBase();
    const response = $http.send({
        url: `${base}/api/chat`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 45,
        body: JSON.stringify({
            model: config.model,
            stream: false,
            messages: config.system_prompt
                ? [{ role: 'system', content: config.system_prompt }, ...messages] : messages,
            options: { num_predict: config.max_tokens, num_ctx: 4096 }
        })
    });
    const content = response.json && response.json.message && response.json.message.content;
    if (response.statusCode !== 200 || typeof content !== 'string' ||
        !content.trim() || content.length > 16000) {
        throw new Error('Invalid Ollama response.');
    }
    return content;
}

module.exports = { settings, configuration, validateConfiguration, validateMessages, requireOrigin, reserve, release, clearExpiredClients, listModels, complete };
