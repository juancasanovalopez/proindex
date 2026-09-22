/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    let collection;
    try {
        collection = app.findCollectionByNameOrId('projects');
    } catch (_) {
        return;
    }

    const fieldNames = new Set(collection.fields.map(field => field.name));
    if (!fieldNames.has('is_public')) {
        collection.fields.add(new BoolField({
            name: 'is_public',
            help: 'Controls whether the project is visible on the public website.'
        }));
    }

    const publicRule = 'is_public = true';
    const requirePublicRule = rule => {
        if (rule === null || rule === undefined) return publicRule;
        const trimmedRule = String(rule).trim();
        if (!trimmedRule) return publicRule;
        if (trimmedRule.includes(publicRule)) return trimmedRule;
        return `(${trimmedRule}) && (${publicRule})`;
    };

    collection.listRule = requirePublicRule(collection.listRule);
    collection.viewRule = requirePublicRule(collection.viewRule);

    return app.save(collection);
}, (app) => {
    let collection;
    try {
        collection = app.findCollectionByNameOrId('projects');
    } catch (_) {
        return;
    }

    collection.fields.removeByName('is_public');

    return app.save(collection);
});