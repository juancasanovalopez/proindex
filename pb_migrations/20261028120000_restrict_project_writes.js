/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const collection = app.findAllCollections('base').find(item => item.name === 'projects');
    if (!collection) return;
    collection.createRule = null;
    collection.updateRule = null;
    collection.deleteRule = null;
    app.save(collection);
});
