function initializeChatSettings(t, session) {
    const form = document.getElementById('chat-configuration');
    const status = document.getElementById('settings-status');
    const modelSelect = document.getElementById('chat-model');
    const refreshModels = document.getElementById('chat-models-refresh');
    function reset() {
        form.reset();
        setModelOptions([], '');
        form.hidden = true;
    }
    const { request, submit, touchSession } = session;

    function setModelOptions(models, selected) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = models.length ? t.chatAdminModelPlaceholder : t.chatAdminModelsEmpty;
        const options = models.map(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            return option;
        });
        if (selected && !models.includes(selected)) {
            const unavailable = document.createElement('option');
            unavailable.value = selected;
            unavailable.textContent = `${selected} (${t.chatAdminModelUnavailable})`;
            options.unshift(unavailable);
        }
        modelSelect.replaceChildren(placeholder, ...options);
        modelSelect.value = selected || '';
    }

    async function loadModels(selected) {
        modelSelect.disabled = true;
        refreshModels.disabled = true;
        try {
            const data = await request('api/local-chat/models', 'GET');
            if (!Array.isArray(data.models) || data.models.some(model => typeof model !== 'string')) {
                throw new Error(t.chatAdminModelsUnavailable);
            }
            setModelOptions(data.models, selected);
            return data.models.length > 0;
        } catch (error) {
            if (session.isAuthenticated() && !error.stale) setModelOptions([], selected);
            throw error;
        } finally {
            modelSelect.disabled = false;
            refreshModels.disabled = false;
        }
    }

    function modelError(error) {
        console.error('Ollama model list unavailable.', error);
        return error instanceof TypeError || error.name === 'TimeoutError'
            ? t.chatAdminUnavailable : error.message;
    }

    async function load() {
        const config = await request('api/local-chat/settings', 'GET');
        document.getElementById('chat-enabled').checked = config.enabled;
        document.getElementById('chat-prompt').value = config.system_prompt;
        document.getElementById('chat-tokens').value = config.max_tokens;
        form.hidden = false;
        try {
            status.textContent = await loadModels(config.model)
                ? t.chatAdminAuthenticated : t.chatAdminModelsEmpty;
        } catch (error) {
            if (!session.isAuthenticated() || error.stale) throw error;
            status.textContent = modelError(error);
        }
        touchSession();
    }

    form.addEventListener('submit', (event) => submit(event, async () => {
        await request('api/local-chat/settings', 'PUT', {
            enabled: document.getElementById('chat-enabled').checked,
            model: modelSelect.value,
            system_prompt: document.getElementById('chat-prompt').value,
            max_tokens: Number(document.getElementById('chat-tokens').value)
        });
        status.textContent = t.chatAdminSaved;
        touchSession();
    }));

    refreshModels.addEventListener('click', () => session.run(async () => {
        if (!session.isAuthenticated()) return;
        try {
            status.textContent = await loadModels(modelSelect.value)
                ? t.chatAdminModelsLoaded : t.chatAdminModelsEmpty;
            touchSession();
        } catch (error) {
            if (!session.isAuthenticated() || error.stale) throw error;
            status.textContent = modelError(error);
        }
    }, refreshModels));

    return { load, reset };
}
