const apiUrl = (process.env.PB_API_URL || 'http://pocketbase:8090').replace(/\/$/, '');
const adminEmail = process.env.PB_ADMIN_EMAIL;
const adminPassword = process.env.PB_ADMIN_PASSWORD;
const cleanupIntervalMs = 24 * 60 * 60 * 1000;

if (!adminEmail || !adminPassword) {
    throw new Error('PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD are required.');
}

async function request(path, options = {}) {
    const response = await fetch(`${apiUrl}${path}`, options);
    if (!response.ok) {
        const details = await response.text();
        throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${details}`);
    }
    return response;
}

async function authenticateAdmin() {
    const response = await request('/api/collections/_superusers/auth-with-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: adminEmail, password: adminPassword })
    });
    const data = await response.json();
    return data.token;
}

async function ensureVisitorsCollection(token) {
    const headers = { Authorization: token };
    const response = await fetch(`${apiUrl}/api/collections/visitors`, { headers });

    if (response.ok) {
        const collection = await response.json();
        const fields = collection.schema || collection.fields || [];
        const fieldNames = new Set(fields.map(field => field.name));
        const fieldDefinitions = [
            ['page', 500],
            ...['ip', 'userAgent', 'referer', 'acceptLanguage', 'platform', 'screen', 'timezone', 'browserLanguage', 'languages']
                .map(name => [name, 1000])
        ];
        const missingFields = fieldDefinitions
            .filter(([name]) => !fieldNames.has(name))
            .map(([name, max]) => ({
                name,
                type: 'text',
                required: false,
                options: { min: null, max, pattern: '' }
            }));

        if (missingFields.length > 0) {
            const fieldKey = collection.schema ? 'schema' : 'fields';
            await request(`/api/collections/${encodeURIComponent(collection.id)}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ [fieldKey]: [...fields, ...missingFields] })
            });
        }
        return;
    }
    if (response.status !== 404) {
        const details = await response.text();
        throw new Error(`GET /api/collections/visitors failed (${response.status}): ${details}`);
    }

    await request('/api/collections', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'visitors',
            type: 'base',
            schema: [
                {
                    name: 'page',
                    type: 'text',
                    required: false,
                    options: { min: null, max: 500, pattern: '' }
                },
                ...['ip', 'userAgent', 'referer', 'acceptLanguage', 'platform', 'screen', 'timezone', 'browserLanguage', 'languages'].map(name => ({
                    name,
                    type: 'text',
                    required: false,
                    options: { min: null, max: 1000, pattern: '' }
                }))
            ],
            listRule: null,
            viewRule: null,
            createRule: '',
            updateRule: null,
            deleteRule: null
        })
    });
}

async function deleteExpiredVisitors(token) {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const filter = encodeURIComponent(`created < "${cutoff}"`);
    for (;;) {
        const response = await request(`/api/collections/visitors/records?filter=${filter}&perPage=200&page=1&fields=id`, {
            headers: { Authorization: token }
        });
        const data = await response.json();

        if (!data.items || data.items.length === 0) break;

        for (const visitor of data.items || []) {
            await request(`/api/collections/visitors/records/${encodeURIComponent(visitor.id)}`, {
                method: 'DELETE',
                headers: { Authorization: token }
            });
        }
    }
}

async function waitForPocketBase() {
    for (;;) {
        try {
            const token = await authenticateAdmin();
            await ensureVisitorsCollection(token);
            await deleteExpiredVisitors(token);
            return;
        } catch (error) {
            console.error(`Visitor maintenance will retry: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

await waitForPocketBase();
setInterval(async () => {
    try {
        const token = await authenticateAdmin();
        await ensureVisitorsCollection(token);
        await deleteExpiredVisitors(token);
    } catch (error) {
        console.error(`Visitor cleanup failed: ${error.message}`);
    }
}, cleanupIntervalMs);
