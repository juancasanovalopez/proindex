/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const collection = new Collection({
        name: 'visitors',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: '',
        updateRule: null,
        deleteRule: null,
        fields: [
            {
                type: 'text',
                name: 'page',
                required: false,
                max: 500
            },
            ...['ip', 'userAgent', 'referer', 'acceptLanguage', 'platform', 'screen', 'timezone', 'browserLanguage', 'languages'].map(name => ({
                type: 'text',
                name,
                required: false,
                max: 1000
            }))
        ]
    });

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId('visitors');
    return app.delete(collection);
});
