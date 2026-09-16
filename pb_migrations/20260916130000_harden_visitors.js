/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const collection = app.findCollectionByNameOrId('visitors');
    const fieldNames = new Set(collection.fields.map(field => field.name));
    const fields = [
        ['page', 500],
        ...['ip', 'userAgent', 'referer', 'acceptLanguage', 'platform', 'screen', 'timezone', 'browserLanguage', 'languages']
            .map(name => [name, 1000])
    ];

    for (const [name, max] of fields) {
        if (!fieldNames.has(name)) {
            collection.fields.add(new TextField({
                name,
                max,
                hidden: name === 'ip' || name === 'userAgent' || name === 'referer' || name === 'acceptLanguage'
            }));
        }
    }

    collection.listRule = null;
    collection.viewRule = null;
    collection.createRule = '';
    collection.updateRule = null;
    collection.deleteRule = null;

    return app.save(collection);
}, (app) => {
    return;
});
