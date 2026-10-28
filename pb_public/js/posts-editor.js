function initializePostsEditor(t, session) {
    const administration = document.getElementById('posts-administration');
    const controls = document.getElementById('posts-controls');
    const form = document.getElementById('post-editor');
    const fieldsContainer = document.getElementById('post-fields');
    const select = document.getElementById('post-select');
    const status = document.getElementById('settings-status');
    const previous = document.getElementById('posts-previous');
    const next = document.getElementById('posts-next');
    const newPost = document.getElementById('post-new');
    const view = document.getElementById('post-view');
    const recordsPath = 'api/collections/projects/records';
    const fieldLabels = {
        name: t.postsAdminName,
        repo: t.codeRepository,
        public: t.publicUrl,
        languages: t.postsAdminLanguages,
        tech_stack: t.postsAdminStack,
        screenshot: t.postsAdminScreenshots,
        description_es: t.postsAdminDescriptionEs,
        description_en: t.postsAdminDescriptionEn,
        description_fr: t.postsAdminDescriptionFr,
        arch_schema: t.architecture,
        is_public: t.postsAdminPublic
    };
    let fields = [];
    let record = {};
    let page = 1;
    let totalPages = 1;
    let dirty = false;
    const inputs = new Map();
    async function load() {
        const schema = await session.request('api/collections/projects');
        fields = schema.fields;
        await loadPage(1);
        renderRecord({});
        administration.hidden = false;
        status.textContent = t.chatAdminAuthenticated;
    }

    function reset() {
        administration.hidden = true;
        fieldsContainer.replaceChildren();
        select.replaceChildren();
        inputs.clear();
        fields = [];
        record = {};
        dirty = false;
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function button(label, action) {
        const node = element('button', 'btn style-switcher-toggle chat-action', label);
        node.type = 'button';
        node.addEventListener('click', action);
        return node;
    }

    function confirmDiscard() {
        return !dirty || window.confirm(t.postsAdminDiscard);
    }

    async function perform(action, trigger) {
        return session.run(async () => {
            if (!session.isAuthenticated()) return;
            controls.disabled = true;
            newPost.disabled = true;
            try {
                await action();
                session.touchSession();
            } finally {
                controls.disabled = false;
                newPost.disabled = false;
            }
        }, trigger);
    }

    async function loadPage(number) {
        const params = new URLSearchParams({ page: String(number), perPage: '50', sort: 'name,id' });
        const data = await session.request(`${recordsPath}?${params}`);
        page = data.page;
        totalPages = data.totalPages;
        const placeholder = element('option', '', t.postsAdminSelect);
        placeholder.value = '';
        const options = data.items.map(item => {
            const option = element('option', '', `${item.name || item.id} (${item.is_public ? t.postsAdminPublished : t.postsAdminPrivate})`);
            option.value = item.id;
            return option;
        });
        if (record.id && !data.items.some(item => item.id === record.id)) {
            const current = element('option', '', record.name || record.id);
            current.value = record.id;
            options.push(current);
        }
        select.replaceChildren(placeholder, ...options);
        select.value = record.id || '';
        previous.disabled = page <= 1;
        next.disabled = page >= totalPages;
        document.getElementById('posts-page').textContent = `${page} / ${Math.max(1, totalPages)} (${data.totalItems})`;
    }

    function addHtmlEditor(wrapper, input) {
        const toolbar = element('div', 'post-toolbar');
        const tags = [
            [t.postsAdminBold, '<strong>', '</strong>'],
            [t.postsAdminItalic, '<em>', '</em>'],
            [t.postsAdminUnderline, '<u>', '</u>'],
            [t.postsAdminParagraph, '<p>', '</p>'],
            [t.postsAdminList, '<ul><li>', '</li></ul>'],
            [t.postsAdminLink, '<a href="https://">', '</a>']
        ];
        const preview = element('div', 'post-preview project-description');
        function updatePreview() {
            preview.replaceChildren();
            renderizarDescripcion(preview, input.value);
        }
        for (const [label, opening, closing] of tags) {
            toolbar.appendChild(button(label, () => {
                const start = input.selectionStart;
                const selected = input.value.slice(start, input.selectionEnd);
                input.setRangeText(`${opening}${selected}${closing}`, start, input.selectionEnd, 'select');
                dirty = true;
                updatePreview();
                input.focus();
            }));
        }
        input.addEventListener('input', updatePreview);
        const details = element('details');
        details.append(element('summary', '', t.postsAdminPreview), preview);
        wrapper.append(toolbar, input, element('small', '', t.postsAdminHtmlHelp), details);
        updatePreview();
    }

    function addFiles(wrapper, field, input, value) {
        input.multiple = field.maxSelect > 1;
        input.accept = (field.mimeTypes || []).join(',');
        const existing = Array.isArray(value) ? value : value ? [value] : [];
        input.required = Boolean(field.required && !existing.length);
        const files = element('div', 'post-files');
        const removals = [];
        for (const filename of existing) {
            const item = element('div', 'post-file');
            if (!field.protected && /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(filename)) {
                const image = element('img');
                image.src = `api/files/${encodeURIComponent(record.collectionId)}/${encodeURIComponent(record.id)}/${encodeURIComponent(filename)}`;
                image.alt = filename;
                image.loading = 'lazy';
                item.appendChild(image);
            }
            item.appendChild(element('span', '', filename));
            const label = element('label');
            const remove = element('input');
            remove.type = 'checkbox';
            remove.value = filename;
            label.append(remove, ` ${t.postsAdminRemoveFile}`);
            item.appendChild(label);
            files.appendChild(item);
            removals.push(remove);
        }
        wrapper.append(files, input, element('small', '', `${t.postsAdminFileHelp} ${field.maxSelect}${field.maxSize ? ` · ${field.maxSize} bytes` : ''}`));
        return { input, removals, existing };
    }

    function renderRecord(value) {
        record = value;
        dirty = false;
        inputs.clear();
        fieldsContainer.replaceChildren();
        document.getElementById('post-mode').textContent = value.id ? `${t.postsAdminEditing} ${value.id}` : t.postsAdminNew;
        view.hidden = !value.id || !value.is_public;
        view.href = value.id ? `./post.html?id=${encodeURIComponent(value.id)}` : './';
        for (const field of fields) {
            const wrapper = element('div', 'post-field');
            const label = element('label', 'editorial-label', fieldLabels[field.name] || field.name);
            label.htmlFor = `post-field-${field.name}`;
            const readOnly = field.system || field.primaryKey || field.type === 'autodate';
            const multiline = ['editor', 'json'].includes(field.type) || field.name === 'arch_schema';
            const input = element(field.type === 'select' ? 'select' : multiline ? 'textarea' : 'input');
            input.id = label.htmlFor;
            input.name = field.name;
            input.required = Boolean(field.required && !readOnly);
            if (readOnly) {
                input.readOnly = true;
                input.value = value[field.name] || '';
            } else if (field.type === 'select') {
                input.multiple = field.maxSelect > 1;
                const selected = Array.isArray(value[field.name]) ? value[field.name] : [value[field.name]];
                if (!input.multiple) {
                    const empty = element('option');
                    empty.value = '';
                    input.appendChild(empty);
                }
                for (const choice of new Set([...field.values, ...selected.filter(Boolean)])) {
                    const option = element('option', '', choice);
                    option.value = choice;
                    option.selected = selected.includes(choice);
                    input.appendChild(option);
                }
            } else if (field.type === 'bool') {
                input.type = 'checkbox';
                input.checked = Boolean(value[field.name]);
            } else if (field.type === 'file') {
                input.type = 'file';
            } else if (field.type === 'number') {
                input.type = 'number';
                input.step = field.onlyInt ? '1' : 'any';
                if (field.min !== null && field.min !== undefined) input.min = field.min;
                if (field.max !== null && field.max !== undefined) input.max = field.max;
                input.value = value[field.name] ?? '';
            } else {
                if (multiline) input.rows = field.type === 'editor' ? 10 : 6;
                else input.type = ['url', 'email'].includes(field.type) ? field.type : 'text';
                input.value = field.type === 'json' && value[field.name] !== undefined
                    ? JSON.stringify(value[field.name], null, 2) : value[field.name] || '';
                if (field.type === 'text' && field.max) input.maxLength = field.max;
                if (field.type === 'text' && field.min) input.minLength = field.min;
                if (field.pattern) input.pattern = field.pattern;
            }
            wrapper.appendChild(label);
            let entry = { input };
            if (field.type === 'file') entry = addFiles(wrapper, field, input, value[field.name]);
            else if (field.type === 'editor') addHtmlEditor(wrapper, input);
            else wrapper.appendChild(input);
            wrapper.appendChild(element('small', '', `${field.name}${readOnly ? ` · ${t.postsAdminReadOnly}` : ''}`));
            if (field.help) wrapper.appendChild(element('small', '', field.help));
            inputs.set(field.name, entry);
            fieldsContainer.appendChild(wrapper);
        }
    }

    function buildBody() {
        const body = new FormData();
        for (const field of fields) {
            if (field.system || field.primaryKey || field.type === 'autodate') continue;
            const { input, removals, existing } = inputs.get(field.name);
            if (field.type === 'file') {
                const removed = removals.filter(item => item.checked);
                const count = field.maxSelect === 1 && input.files.length
                    ? input.files.length : existing.length - removed.length + input.files.length;
                if (count > field.maxSelect || (field.required && !count)
                    || Array.from(input.files).some(file => field.maxSize > 0 && file.size > field.maxSize)) {
                    throw new Error(`${fieldLabels[field.name] || field.name}: ${t.postsAdminInvalidFiles}`);
                }
                for (const file of removed) body.append(`${field.name}-`, file.value);
                // Append instead of replacing existing files on a multi-file field.
                for (const file of input.files) body.append(`${field.name}${field.maxSelect > 1 ? '+' : ''}`, file);
            } else if (field.type === 'select' && field.maxSelect > 1) {
                if (input.selectedOptions.length > field.maxSelect) {
                    throw new Error(`${field.name}: ${t.postsAdminInvalidSelection} ${field.maxSelect}`);
                }
                body.append(field.name, JSON.stringify(Array.from(input.selectedOptions, option => option.value)));
            } else if (field.type === 'bool') {
                body.append(field.name, String(input.checked));
            } else if (field.type === 'json') {
                try {
                    body.append(field.name, JSON.stringify(input.value.trim() ? JSON.parse(input.value) : null));
                } catch (error) {
                    throw new Error(`${field.name}: ${error.message}`);
                }
            } else {
                body.append(field.name, input.value);
            }
        }
        return body;
    }

    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('change', () => { dirty = true; });
    form.addEventListener('submit', event => {
        event.preventDefault();
        return perform(async () => {
            const body = buildBody();
            const saved = await session.request(record.id ? `${recordsPath}/${encodeURIComponent(record.id)}` : recordsPath,
                record.id ? 'PATCH' : 'POST', body);
            renderRecord(saved);
            status.textContent = t.postsAdminSaved;
            try {
                await loadPage(page);
            } catch (error) {
                if (error.stale || !session.isAuthenticated()) throw error;
                console.error('Post saved, but list refresh failed.', error);
                status.textContent = t.postsAdminSavedRefreshFailed;
            }
        }, form.querySelector('[type="submit"]'));
    });
    select.addEventListener('change', () => {
        const id = select.value;
        if (!id || !confirmDiscard()) {
            select.value = record.id || '';
            return;
        }
        return perform(async () => {
            try {
                const data = await session.request(`${recordsPath}/${encodeURIComponent(id)}`);
                renderRecord(data);
                status.textContent = t.postsAdminLoaded;
            } finally {
                select.value = record.id || '';
            }
        });
    });
    newPost.addEventListener('click', event => {
        if (!confirmDiscard()) return;
        return perform(async () => {
            renderRecord({});
            select.value = '';
            status.textContent = t.postsAdminNew;
        }, event.currentTarget);
    });
    document.getElementById('post-reset').addEventListener('click', event => {
        if (!confirmDiscard()) return;
        return perform(async () => {
            renderRecord(record);
            status.textContent = t.postsAdminResetDone;
        }, event.currentTarget);
    });
    for (const [trigger, step] of [[previous, -1], [next, 1]]) {
        trigger.addEventListener('click', () => perform(async () => {
            await loadPage(page + step);
            status.textContent = t.postsAdminListLoaded;
        }));
    }
    window.addEventListener('beforeunload', event => {
        if (!dirty) return;
        event.preventDefault();
        event.returnValue = '';
    });

    return { load, reset };
}
