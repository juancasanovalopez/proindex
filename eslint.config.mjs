export default [
    {
        files: ['pb_public/js/app.js'],
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