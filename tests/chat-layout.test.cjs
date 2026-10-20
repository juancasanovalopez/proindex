const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('chat settings translations cover all markup and status messages in every language', () => {
    const html = fs.readFileSync('pb_public/chat-settings.html', 'utf8');
    const script = fs.readFileSync('pb_public/js/chat-settings.js', 'utf8');
    const keys = new Set([
        ...Array.from(html.matchAll(/data-i18n="([^"]+)"/g), match => match[1]),
        ...Array.from(script.matchAll(/t\.(chatAdmin\w+)/g), match => match[1])
    ]);
    for (const lang of ['es', 'en', 'fr']) {
        const translations = JSON.parse(fs.readFileSync(`pb_public/locales/${lang}.json`, 'utf8'));
        for (const key of keys) {
            assert.equal(typeof translations[key], 'string', `${lang}: ${key}`);
            assert.ok(translations[key].trim(), `${lang}: ${key} must not be empty`);
        }
    }
});

test('settings and public chat reuse the shared language and remembered visual style', async () => {
    const source = fs.readFileSync('pb_public/js/app.js', 'utf8');
    for (const lang of ['es', 'en', 'fr']) {
        const translations = JSON.parse(fs.readFileSync(`pb_public/locales/${lang}.json`, 'utf8'));
        for (const page of ['chat-settings', 'index']) {
            let initialize;
            let settings;
            let chat;
            const requests = [];
            const title = {
                getAttribute: () => page === 'chat-settings' ? 'chatAdminTitle' : 'title'
            };
            const styleButton = { setAttribute: () => {} };
            const document = {
                body: { dataset: { page } },
                documentElement: { dataset: {} },
                addEventListener: (_, listener) => { initialize = listener; },
                querySelector: selector => selector === '[data-style-toggle]' ? styleButton : null,
                querySelectorAll: selector => selector === '[data-i18n]' ? [title] : [],
                getElementById: () => null
            };
            const context = {
                document,
                window: {
                    localStorage: { getItem: () => '16bit' },
                    location: { search: '', pathname: '/' }
                },
                navigator: { languages: [lang], language: lang },
                fetch: async (url) => {
                    requests.push(String(url));
                    return { ok: true, json: async () => translations };
                },
                initializeChatSettings: value => { settings = value; },
                initializeLocalChat: value => { chat = value; },
                URLSearchParams,
                console
            };
            vm.runInNewContext(source, context);
            await initialize();
            assert.equal(document.documentElement.lang, lang);
            assert.equal(document.documentElement.dataset.visualStyle, '16bit');
            assert.equal(title.textContent, page === 'chat-settings' ? translations.chatAdminTitle : translations.title);
            assert.ok(requests.includes(`./locales/${lang}.json`));
            assert.ok(requests.includes('api/collections/visitors/records'));
            assert.ok(!requests.some(url => url.includes('projects/records')));
            if (page === 'chat-settings') {
                assert.equal(settings, translations);
                assert.equal(chat, undefined, 'Settings should not create a second public chat');
            } else {
                assert.equal(chat, translations.chat);
                assert.equal(settings, undefined);
            }
        }
    }
});
