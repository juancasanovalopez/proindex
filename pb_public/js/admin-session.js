function initializeAdminSession(t, { onAuthenticated, onLogout }) {
    const login = document.getElementById('chat-login');
    const mfa = document.getElementById('chat-mfa');
    const status = document.getElementById('settings-status');
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
        onLogout();
        login.hidden = false;
        mfa.hidden = true;
        status.textContent = message;
    }

    function touchSession() {
        clearTimeout(timer);
        if (token || mfaId) timer = setTimeout(() => logout(t.chatAdminExpired), 300000);
    }

    async function request(path, method = 'GET', body) {
        const currentGeneration = generation;
        const multipart = body instanceof FormData;
        let response;
        let data;
        try {
            response = await fetch(path, {
                method,
                cache: 'no-store',
                credentials: 'omit',
                headers: {
                    ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
                    ...(token ? { Authorization: token } : {})
                },
                ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
                signal: AbortSignal.timeout(multipart ? 60000 : 15000)
            });
            data = await response.json();
        } catch (error) {
            if (currentGeneration !== generation) error.stale = true;
            throw error;
        }
        if (currentGeneration !== generation) {
            const error = new Error(t.chatAdminLoggedOut);
            error.stale = true;
            throw error;
        }
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                if (data.mfaId) return { mfaId: data.mfaId };
                logout(t.chatAdminDenied);
            }
            const details = Object.entries(data.data || {})
                .filter(([, value]) => typeof value.message === 'string')
                .map(([field, value]) => `${field}: ${value.message}`).join('\n');
            throw new Error(response.status === 429 ? t.chatAdminLimited
                : response.status === 502 && path.startsWith('api/local-chat/')
                    ? t.chatAdminModelsUnavailable
                    : response.status === 400 && path === 'api/local-chat/settings'
                        ? t.chatAdminInvalidSettings
                        : `${t.chatAdminFailed} (${response.status})${details ? `\n${details}` : ''}`);
        }
        return data;
    }

    async function run(action, button) {
        if (pending) return;
        pending = true;
        if (button) button.disabled = true;
        status.textContent = t.chatAdminProcessing;
        try {
            await action();
        } catch (error) {
            if (!error.stale) {
                console.error('Administration failed.', error);
                status.textContent = error instanceof TypeError || error.name === 'TimeoutError'
                    ? t.chatAdminUnavailable : error.message;
            }
        } finally {
            pending = false;
            if (button) button.disabled = false;
        }
    }

    function submit(event, action) {
        event.preventDefault();
        return run(action, event.target.querySelector('[type="submit"]'));
    }

    async function authenticated(data) {
        if (typeof data.token !== 'string' || !data.record?.id) throw new Error(t.chatAdminInvalidAuth);
        token = data.token;
        touchSession();
        try {
            await onAuthenticated();
        } catch (error) {
            if (!error.stale) logout(error.message);
            throw error;
        }
        login.reset();
        mfa.reset();
        login.hidden = true;
        mfa.hidden = true;
        touchSession();
    }

    login.addEventListener('submit', event => submit(event, async () => {
        const email = document.getElementById('admin-email').value.trim();
        const password = document.getElementById('admin-password');
        const secret = password.value;
        password.value = '';
        const data = await request('api/collections/_superusers/auth-with-password', 'POST', { identity: email, password: secret });
        if (data.mfaId) {
            mfaId = data.mfaId;
            touchSession();
            const otp = await request('api/collections/_superusers/request-otp', 'POST', { email });
            otpId = otp.otpId;
            login.hidden = true;
            mfa.hidden = false;
            status.textContent = t.chatAdminMfaSent;
            document.getElementById('admin-code').focus();
        } else {
            await authenticated(data);
        }
    }));

    mfa.addEventListener('submit', event => submit(event, async () => {
        const code = document.getElementById('admin-code');
        const password = code.value.trim();
        code.value = '';
        await authenticated(await request('api/collections/_superusers/auth-with-otp', 'POST', { otpId, password, mfaId }));
    }));

    document.getElementById('chat-logout').addEventListener('click', () => logout());
    document.addEventListener('input', touchSession);
    document.addEventListener('click', touchSession);
    window.addEventListener('pagehide', () => logout());
    if (!window.isSecureContext || window.self !== window.top) {
        login.hidden = true;
        status.textContent = t.chatAdminBlocked;
    } else {
        login.hidden = false;
    }

    return { request, run, submit, touchSession, isAuthenticated: () => Boolean(token) };
}
