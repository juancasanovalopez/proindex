/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    for (const definition of [
        {
            name: 'local_chat_settings',
            fields: [
                { type: 'bool', name: 'enabled' },
                { type: 'text', name: 'model', max: 100 },
                { type: 'text', name: 'system_prompt', max: 2000 },
                { type: 'number', name: 'max_tokens', min: 1, max: 512, onlyInt: true }
            ],
            values: { enabled: false, model: '', system_prompt: '', max_tokens: 256 }
        },
        {
            name: 'local_chat_quota',
            fields: [
                { type: 'number', name: 'minute' },
                { type: 'number', name: 'minute_count' },
                { type: 'number', name: 'day' },
                { type: 'number', name: 'day_count' },
                { type: 'number', name: 'busy_until' },
                { type: 'json', name: 'clients', maxSize: 20000 }
            ],
            values: { clients: {} }
        }
    ]) {
        const collection = new Collection({
            name: definition.name,
            type: 'base',
            listRule: null,
            viewRule: null,
            createRule: null,
            updateRule: null,
            deleteRule: null,
            fields: definition.fields
        });
        app.save(collection);
        const record = new Record(collection);
        for (const [key, value] of Object.entries(definition.values)) record.set(key, value);
        app.save(record);
    }
}, (app) => {
    app.delete(app.findCollectionByNameOrId('local_chat_quota'));
    app.delete(app.findCollectionByNameOrId('local_chat_settings'));
});
