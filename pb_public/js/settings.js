function initializeSettings(t) {
    const administration = document.getElementById('settings-administration');
    const status = document.getElementById('settings-status');
    const loaded = new Set();
    const messages = new Map();
    const buttons = Array.from(document.querySelectorAll('[data-settings-section]'));
    let active = '';
    const session = initializeAdminSession(t, {
        onAuthenticated: async () => {
            administration.hidden = false;
            try {
                await showSection(window.location.hash === '#chat' ? 'chat' : 'posts');
            } catch (error) {
                if (!session.isAuthenticated() || error.stale) throw error;
                console.error('Settings section unavailable.', error);
                status.textContent = error instanceof TypeError || error.name === 'TimeoutError'
                    ? t.chatAdminUnavailable : error.message;
            }
        },
        onLogout: () => {
            administration.hidden = true;
            for (const section of Object.values(sections)) section.reset();
            loaded.clear();
            messages.clear();
            active = '';
        }
    });
    const sections = {
        posts: initializePostsEditor(t, session),
        chat: initializeChatSettings(t, session)
    };

    async function showSection(name) {
        active = name;
        for (const button of buttons) {
            const selected = button.dataset.settingsSection === name;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-pressed', String(selected));
            document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
        }
        if (!loaded.has(name)) {
            await sections[name].load();
            loaded.add(name);
        } else {
            status.textContent = messages.get(name) || t.chatAdminAuthenticated;
        }
    }

    for (const button of buttons) {
        button.addEventListener('click', () => {
            const name = button.dataset.settingsSection;
            if (!session.isAuthenticated() || (active === name && loaded.has(name))) return;
            const message = status.textContent;
            return session.run(() => {
                if (active) messages.set(active, message);
                return showSection(name);
            });
        });
    }
}
