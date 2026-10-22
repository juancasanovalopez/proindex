function initializeLocalChat(t) {
    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'chat-launcher';
    launcher.setAttribute('aria-label', t.open);
    launcher.setAttribute('aria-haspopup', 'dialog');
    launcher.setAttribute('aria-controls', 'local-chat');
    launcher.innerHTML = '<i class="bi bi-chat-dots" aria-hidden="true"></i>';

    const dialog = document.createElement('dialog');
    dialog.id = 'local-chat';
    dialog.className = 'local-chat';
    dialog.setAttribute('aria-labelledby', 'local-chat-title');
    dialog.innerHTML = `
        <header class="chat-header">
            <h2 id="local-chat-title"></h2>
            <button class="btn style-switcher-toggle chat-action" type="button" data-chat-close><i class="bi bi-x-lg" aria-hidden="true"></i></button>
        </header>
        <p class="chat-notice"></p>
        <div class="chat-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
        <p class="status chat-status" role="status"></p>
        <form class="chat-composer">
            <label for="chat-message" class="visually-hidden"></label>
            <textarea id="chat-message" rows="2" maxlength="2000" required disabled></textarea>
            <button class="btn style-switcher-toggle chat-action" type="submit" disabled><i class="bi bi-send" aria-hidden="true"></i></button>
        </form>
        <footer class="chat-footer"><button class="btn style-switcher-toggle chat-action" type="button" data-chat-reset></button></footer>`;
    dialog.querySelector('h2').textContent = t.title;
    dialog.querySelector('[data-chat-close]').setAttribute('aria-label', t.close);
    dialog.querySelector('.chat-notice').textContent = t.notice;
    dialog.querySelector('label').textContent = t.message;
    dialog.querySelector('textarea').placeholder = t.message;
    dialog.querySelector('[type="submit"]').setAttribute('aria-label', t.send);
    dialog.querySelector('[data-chat-reset]').textContent = t.reset;
    document.body.append(launcher, dialog);
    function updateViewport() {
        const viewport = window.visualViewport;
        if (!viewport) return;
        dialog.style.setProperty('--chat-viewport-height', `${viewport.height}px`);
        dialog.style.setProperty('--chat-viewport-top', `${viewport.offsetTop}px`);
    }
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    updateViewport();

    const log = dialog.querySelector('.chat-messages');
    const status = dialog.querySelector('.chat-status');
    const input = dialog.querySelector('textarea');
    const send = dialog.querySelector('[type="submit"]');
    const reset = dialog.querySelector('[data-chat-reset]');
    const history = [];
    let busy = false;
    let enabled = false;

    function updateComposer() {
        input.disabled = busy || !enabled;
        send.disabled = busy || !enabled;
        reset.disabled = busy;
        log.setAttribute('aria-busy', String(busy));
    }

    function appendMessage(role, content) {
        const message = document.createElement('p');
        message.className = `chat-message chat-message-${role}`;
        const author = document.createElement('strong');
        author.className = 'editorial-label';
        author.textContent = role === 'user' ? t.you : t.assistant;
        const text = document.createElement('span');
        text.textContent = content;
        message.append(author, text);
        log.appendChild(message);
        message.scrollIntoView({ block: 'nearest' });
    }

    launcher.addEventListener('click', async () => {
        dialog.showModal();
        document.body.classList.add('chat-is-open');
        status.textContent = t.loading;
        try {
            const response = await fetch('api/local-chat/status', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error(`Chat status: ${response.status}`);
            enabled = (await response.json()).enabled === true;
            status.textContent = enabled ? '' : t.disabled;
            updateComposer();
            if (enabled && !busy) input.focus();
        } catch (error) {
            console.error('Chat status unavailable.', error);
            enabled = false;
            status.textContent = t.unavailable;
            updateComposer();
        }
    });
    dialog.querySelector('[data-chat-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            dialog.close();
        }
    });
    dialog.addEventListener('close', () => {
        document.body.classList.remove('chat-is-open');
        launcher.focus();
    });
    reset.addEventListener('click', () => {
        history.length = 0;
        log.replaceChildren();
        input.value = '';
        status.textContent = enabled ? '' : t.disabled;
        if (enabled) input.focus();
    });
    dialog.querySelector('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const content = input.value.trim();
        if (busy || !enabled || !content) return;
        // Keep at most four complete turns; never send an orphan assistant message.
        const messages = [...history.slice(-8), { role: 'user', content }];
        if (messages.reduce((size, message) => size + message.content.length, 0) > 8000) {
            status.textContent = t.tooLong;
            return;
        }
        busy = true;
        updateComposer();
        status.textContent = t.thinking;
        try {
            const response = await fetch('api/local-chat/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages }),
                signal: AbortSignal.timeout(55000)
            });
            if (!response.ok) {
                status.textContent = response.status === 429 ? t.limited
                    : response.status === 503 ? t.disabled
                        : response.status === 403 ? t.forbidden : t.unavailable;
                return;
            }
            const data = await response.json();
            if (typeof data.message !== 'string' || !data.message.trim()) throw new Error('Invalid chat response.');
            appendMessage('user', content);
            appendMessage('assistant', data.message);
            history.push({ role: 'user', content }, { role: 'assistant', content: data.message });
            if (history.length > 8) history.splice(0, history.length - 8);
            input.value = '';
            status.textContent = '';
        } catch (error) {
            console.error('Chat request failed.', error);
            status.textContent = t.unavailable;
        } finally {
            busy = false;
            updateComposer();
            if (dialog.open) input.focus();
        }
    });
}
