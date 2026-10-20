function initializeChatSettings(t) {
    const login = document.getElementById('chat-login');
    const mfa = document.getElementById('chat-mfa');
    const form = document.getElementById('chat-configuration');
    const status = document.getElementById('settings-status');
    const modelSelect = document.getElementById('chat-model');
    const refreshModels = document.getElementById('chat-models-refresh');
    let token = '';
    let mfaId = '';
    let otpId = '';
    let timer;
    let pending = false;
    let generation = 0;

    function logout(message = t.chatAdminLoggedOut) {
        generation++;
        clearTimeout(timer);
        token = '';
        mfaId = '';
        otpId = '';
        login.reset();
        mfa.reset();
        form.reset();
        setModelOptions([], '');
        login.hidden = false;
        mfa.hidden = true;
        form.hidden = true;
        status.textContent = message;
    }

    function touchSession() {
        clearTimeout(timer);
        if (token || mfaId) timer = setTimeout(() => logout(t.chatAdminExpired), 300000);
    }

    async function request(path, method, body) {
        const currentGeneration = generation;
        const response = await fetch(path, {
            method,
            cache: 'no-store',
            credentials: 'omit',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(15000)
        });
        const data = await response.json();
        if (currentGeneration !== generation) throw new Error(t.chatAdminLoggedOut);
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                if (data.mfaId) return { mfaId: data.mfaId };
                logout(t.chatAdminDenied);
            }
            const error = new Error(response.status === 429 ? t.chatAdminLimited
                : response.status === 502 && path.startsWith('/api/local-chat/')
                    ? t.chatAdminModelsUnavailable
                    : response.status === 400 && path === '/api/local-chat/settings'
                        ? t.chatAdminInvalidSettings
                        : `${t.chatAdminFailed} (${response.status})`);
            throw error;
        }
        return data;
    }

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
            const data = await request('/api/local-chat/models', 'GET');
            if (!Array.isArray(data.models) || data.models.some(model => typeof model !== 'string')) {
                throw new Error(t.chatAdminModelsUnavailable);
            }
            setModelOptions(data.models, selected);
            return data.models.length > 0;
        } catch (error) {
            setModelOptions([], selected);
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

    async function authenticated(data) {
        if (typeof data.token !== 'string' || !data.record?.id) throw new Error(t.chatAdminInvalidAuth);
        token = data.token;
        const config = await request('/api/local-chat/settings', 'GET');
        document.getElementById('chat-enabled').checked = config.enabled;
        document.getElementById('chat-prompt').value = config.system_prompt;
        document.getElementById('chat-tokens').value = config.max_tokens;
        login.reset();
        mfa.reset();
        login.hidden = true;
        mfa.hidden = true;
        form.hidden = false;
        try {
            status.textContent = await loadModels(config.model)
                ? t.chatAdminAuthenticated : t.chatAdminModelsEmpty;
        } catch (error) {
            if (!token) throw error;
            status.textContent = modelError(error);
        }
        touchSession();
    }

    async function submit(event, action) {
        event.preventDefault();
        if (pending) return;
        pending = true;
        const button = event.target.querySelector('[type="submit"]');
        button.disabled = true;
        status.textContent = t.chatAdminProcessing;
        try {
            await action();
        } catch (error) {
            console.error('Chat administration failed.', error);
            status.textContent = error instanceof TypeError || error.name === 'TimeoutError'
                ? t.chatAdminUnavailable : error.message;
        } finally {
            pending = false;
            button.disabled = false;
        }
    }

    login.addEventListener('submit', (event) => submit(event, async () => {
        const email = document.getElementById('admin-email').value.trim();
        const password = document.getElementById('admin-password');
        const secret = password.value;
        password.value = '';
        const data = await request('/api/collections/_superusers/auth-with-password', 'POST', { identity: email, password: secret });
        if (data.mfaId) {
            mfaId = data.mfaId;
            const otp = await request('/api/collections/_superusers/request-otp', 'POST', { email });
            otpId = otp.otpId;
            login.hidden = true;
            mfa.hidden = false;
            status.textContent = t.chatAdminMfaSent;
            document.getElementById('admin-code').focus();
            touchSession();
        } else {
            await authenticated(data);
        }
    }));

    mfa.addEventListener('submit', (event) => submit(event, async () => {
        const code = document.getElementById('admin-code');
        const password = code.value.trim();
        code.value = '';
        await authenticated(await request('/api/collections/_superusers/auth-with-otp', 'POST', { otpId, password, mfaId }));
    }));

    form.addEventListener('submit', (event) => submit(event, async () => {
        await request('/api/local-chat/settings', 'PUT', {
            enabled: document.getElementById('chat-enabled').checked,
            model: modelSelect.value,
            system_prompt: document.getElementById('chat-prompt').value,
            max_tokens: Number(document.getElementById('chat-tokens').value)
        });
        status.textContent = t.chatAdminSaved;
        touchSession();
    }));

    document.getElementById('chat-logout').addEventListener('click', () => logout());
    refreshModels.addEventListener('click', async () => {
        if (pending || !token) return;
        pending = true;
        status.textContent = t.chatAdminProcessing;
        try {
            status.textContent = await loadModels(modelSelect.value)
                ? t.chatAdminModelsLoaded : t.chatAdminModelsEmpty;
            touchSession();
        } catch (error) {
            if (token) status.textContent = modelError(error);
        } finally {
            pending = false;
        }
    });
    document.addEventListener('input', touchSession);
    window.addEventListener('pagehide', () => logout());
    if (!window.isSecureContext || window.self !== window.top) {
        login.hidden = true;
        status.textContent = t.chatAdminBlocked;
    } else {
        login.hidden = false;
    }
}
