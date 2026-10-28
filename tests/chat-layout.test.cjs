const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('administration translations cover all markup and status messages in every language', () => {
    const html = fs.readFileSync('pb_public/settings.html', 'utf8');
    const script = ['settings', 'chat-settings', 'admin-session', 'posts-editor'].map(file => fs.readFileSync(`pb_public/js/${file}.js`, 'utf8')).join('\n');
    const keys = new Set([
        ...Array.from(html.matchAll(/data-i18n="([^"]+)"/g), match => match[1]),
        ...Array.from(script.matchAll(/\bt\.(\w+)/g), match => match[1])
    ]);
    for (const lang of ['es', 'en', 'fr']) {
        const translations = JSON.parse(fs.readFileSync(`pb_public/locales/${lang}.json`, 'utf8'));
        for (const key of keys) {
            assert.equal(typeof translations[key], 'string', `${lang}: ${key}`);
            assert.ok(translations[key].trim(), `${lang}: ${key} must not be empty`);
        }
    }
});

test('frontend API calls stay relative so the site works behind a reverse-proxy path prefix', () => {
    for (const file of ['app.js', 'chat.js', 'chat-settings.js', 'admin-session.js', 'posts-editor.js', 'settings.js']) {
        const source = fs.readFileSync(`pb_public/js/${file}`, 'utf8');
        assert.doesNotMatch(source, /['"`]\/api\//, `${file} must not use root-absolute /api/ paths`);
    }
});

test('settings and public chat reuse the shared language and remembered visual style', async () => {
    const source = fs.readFileSync('pb_public/js/app.js', 'utf8');
    for (const lang of ['es', 'en', 'fr']) {
        const translations = JSON.parse(fs.readFileSync(`pb_public/locales/${lang}.json`, 'utf8'));
        for (const page of ['settings', 'index']) {
            let initialize;
            let settings;
            let chat;
            const requests = [];
            const title = {
                getAttribute: () => page === 'settings' ? 'settingsTitle' : 'title'
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
                initializeSettings: value => { settings = value; },
                initializeLocalChat: value => { chat = value; },
                URLSearchParams,
                console
            };
            vm.runInNewContext(source, context);
            await initialize();
            assert.equal(document.documentElement.lang, lang);
            assert.equal(document.documentElement.dataset.visualStyle, '16bit');
            assert.equal(title.textContent, page === 'settings' ? translations.settingsTitle : translations.title);
            assert.ok(requests.includes(`./locales/${lang}.json`));
            assert.ok(requests.includes('api/collections/visitors/records'));
            assert.ok(!requests.some(url => url.includes('projects/records')));
            if (page !== 'index') {
                assert.equal(settings, translations);
                assert.equal(chat, undefined, 'Settings should not create a second public chat');
            } else {
                assert.equal(chat, translations.chat);
                assert.equal(settings, undefined);
            }
        }
    }
});
