/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const collection = new Collection({
        name: 'contact_info',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
            { type: 'email', name: 'email' },
            { type: 'url', name: 'linkedin' },
            { type: 'url', name: 'github' }
        ]
    });

    app.save(collection);

    const contact = new Record(collection);
    contact.set('email', 'contacto@example.com');
    contact.set('linkedin', 'https://www.linkedin.com/in/tu-perfil/');
    contact.set('github', 'https://github.com/tu-usuario');
    return app.save(contact);
}, (app) => {
    return app.delete(app.findCollectionByNameOrId('contact_info'));
});