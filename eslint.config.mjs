export default [
    {
        files: ['pb_public/js/app.js', 'pb_public/js/chat.js', 'pb_public/js/chat-settings.js', 'pb_public/js/admin-session.js', 'pb_public/js/posts-editor.js', 'pb_public/js/settings.js'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'script',
            globals: {
                console: 'readonly',
                document: 'readonly',
                fetch: 'readonly',
                navigator: 'readonly',
                URLSearchParams: 'readonly',
                window: 'readonly',
                mermaid: 'readonly'
            }
        },
        rules: {
            'no-console': ['error', { allow: ['error'] }]
        }
    }
];