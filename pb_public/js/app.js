const supportedLanguages = ['es', 'en', 'fr'];

const projectsApiPath = 'api/collections/projects/records';
const visitorsApiPath = 'api/collections/visitors/records';
const visualStyleStorageKey = 'pro-index-visual-style';

function renderSharedHeader(page) {
    const navigation = page === 'post'
        ? `<a class="blog-nav-link" href="./">
            <i class="bi bi-arrow-left" aria-hidden="true"></i>
            <span data-i18n="allProjects"></span>
           </a>`
        : page === 'privacy'
            ? `<a class="blog-brand" href="./">Pro Index</a>
               <a class="blog-nav-link" href="./" data-i18n="privacyBack"></a>`
            : '<a class="blog-brand" href="./">Pro Index</a>';
    const menuId = `style-menu-${page}`;

    return `
        <header class="blog-header">
            ${navigation}
            <div class="dropdown style-switcher">
                <button class="btn style-switcher-toggle dropdown-toggle" type="button" id="${menuId}" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="bi bi-palette2" aria-hidden="true"></i>
                    ${page === 'index' ? '' : '<span data-i18n="styleLabel"></span>: <span data-current-style></span>'}
                </button>
                <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="${menuId}">
                    <li><button class="dropdown-item" type="button" role="menuitemradio" value="16bit" data-visual-style-option data-i18n="style16Bit" aria-checked="false"></button></li>
                    <li><button class="dropdown-item" type="button" role="menuitemradio" value="original" data-visual-style-option data-i18n="styleOriginal" aria-checked="false"></button></li>
                </ul>
            </div>
        </header>`;
}

function renderSharedFooter() {
    return `
        <footer class="container site-footer">
            <p class="privacy-notice" data-privacy-notice></p>
        </footer>`;
}

function initializeSharedLayout() {
    const page = document.body.dataset.page || 'index';
    const headerPlaceholder = document.querySelector('[data-layout-header]');
    const footerPlaceholder = document.querySelector('[data-layout-footer]');

    if (headerPlaceholder) headerPlaceholder.outerHTML = renderSharedHeader(page);
    if (footerPlaceholder) footerPlaceholder.outerHTML = renderSharedFooter();
}

function applyVisualStyle(style) {
    const selectedStyle = ['original', '16bit'].includes(style) ? style : 'original';
    document.documentElement.dataset.visualStyle = selectedStyle;
    document.querySelectorAll('[data-visual-style-option]').forEach(option => {
        const isSelected = option.value === selectedStyle;
        option.classList.toggle('active', isSelected);
        option.setAttribute('aria-checked', String(isSelected));

        if (isSelected) {
            const currentStyle = option.closest('.style-switcher')?.querySelector('[data-current-style]');
            if (currentStyle) currentStyle.textContent = option.textContent.trim();
        }
    });
}

function initializeVisualStyle() {
    const storedStyle = window.localStorage.getItem(visualStyleStorageKey) || 'original';
    applyVisualStyle(storedStyle);

    document.querySelectorAll('[data-visual-style-option]').forEach(option => {
        option.addEventListener('click', event => {
            const selectedStyle = event.target.value;
            window.localStorage.setItem(visualStyleStorageKey, selectedStyle);
            applyVisualStyle(selectedStyle);
        });
    });
}

async function loadTranslations(lang) {
    const requestedLanguage = supportedLanguages.includes(lang) ? lang : 'es';

    try {
        const response = await fetch(`./locales/${requestedLanguage}.json`);
        if (!response.ok) throw new Error(`Translation file not found: ${requestedLanguage}`);
        return await response.json();
    } catch (error) {
        if (requestedLanguage === 'es') throw error;

        const fallbackResponse = await fetch('./locales/es.json');
        if (!fallbackResponse.ok) throw error;
        return fallbackResponse.json();
    }
}

function registrarVisita() {
    const screenSize = window.screen ? `${window.screen.width}x${window.screen.height}` : '';
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

    fetch(visitorsApiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            page: window.location.pathname,
            platform: navigator.platform || '',
            screen: screenSize,
            timezone,
            browserLanguage: navigator.language || '',
            languages: Array.isArray(navigator.languages) ? navigator.languages.join(',') : ''
        }),
        keepalive: true
    }).catch(error => {
        console.error('No se pudo registrar la visita.', error);
    });
}

function getBrowserLanguage() {
    const languages = navigator.languages || [navigator.language || 'es'];
    for (const langCode of languages) {
        const shortLang = langCode.split('-')[0];
        if (supportedLanguages.includes(shortLang)) return shortLang;
    }
    return 'es';
}

function getScreenshotUrl(project) {
    const screenshot = Array.isArray(project.screenshot)
        ? project.screenshot[0]
        : project.screenshot;

    if (typeof screenshot !== 'string' || !screenshot.trim()) return '';

    return `api/files/${encodeURIComponent(project.collectionId)}/${encodeURIComponent(project.id)}/${encodeURIComponent(screenshot)}`;
}

function getMultipleSelection(project, fieldName) {
    if (!project || !fieldName) return [];
    const value = project[fieldName];

    if (Array.isArray(value)) return value;
    return value ? [value] : [];
}

function recortarDescripcion(texto) {
    if (!texto) return '';

    const textoPlano = document.createElement('div');
    textoPlano.innerHTML = texto;
    const palabras = (textoPlano.textContent || '').trim().split(/\s+/);

    if (palabras.length === 1 && palabras[0] === '') return '';
    if (palabras.length > 50) {
        return palabras.slice(0, 50).join(' ') + '...';
    }
    return palabras.join(' ');
}

function renderizarDescripcion(element, html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');

    const allowedTags = new Set(['A', 'B', 'BR', 'EM', 'I', 'LI', 'OL', 'P', 'STRONG', 'U', 'UL']);

    function appendSafeNodes(parent, source) {
        source.childNodes.forEach(node => {
            if (node.nodeType === 3) {
                parent.appendChild(document.createTextNode(node.nodeValue));
                return;
            }

            if (node.nodeType !== 1) return;

            const tagName = node.tagName.toUpperCase();
            if (!allowedTags.has(tagName)) {
                appendSafeNodes(parent, node);
                return;
            }

            const safeNode = document.createElement(tagName.toLowerCase());
            if (tagName === 'A') {
                const href = node.getAttribute('href') || '';
                if (/^https?:\/\//i.test(href)) {
                    safeNode.href = href;
                    safeNode.target = '_blank';
                    safeNode.rel = 'noopener noreferrer';
                }
            }
            parent.appendChild(safeNode);
            appendSafeNodes(safeNode, node);
        });
    }

    appendSafeNodes(element, template.content);
}

function prepararProyecto(project, lang, t, esLista = false) {
    const name = project.name || 'Proyecto';
    const descriptionFull = project[`description_${lang}`] || t.noDesc;
    const progLanguages = getMultipleSelection(project, 'languages');
    const techStack = getMultipleSelection(project, 'tech_stack');

    return {
        name,
        descriptionFull,
        description: esLista ? recortarDescripcion(descriptionFull) : '',
        imagenUrl: getScreenshotUrl(project),
        repoUrl: typeof project.repo === 'string' ? project.repo.trim() : '',
        publicUrl: typeof project.public === 'string' ? project.public.trim() : '',
        diagram: project.arch_schema || t.noDiagram,
        progLanguagesHtml: renderBadges(progLanguages),
        techStackHtml: renderBadges(techStack, true),
        postDetailUrl: esLista ? `./post.html?id=${encodeURIComponent(project.id)}` : ''
    };
}

function renderBadges(options) {
    return options
        .map(option => `<span class="badge rounded-pill text-bg-dark">  ${escaparHTML(option)}</span>`)
        .join(' ');
}

function renderProjectLinks(projectData, t) {
    const links = [];

    if (projectData.repoUrl) {
        links.push(`
            <a class="project-link" href="${escaparHTML(projectData.repoUrl)}" target="_blank" rel="noopener noreferrer">
                <i class="bi bi-git" aria-hidden="true"></i>
                <span>${t.codeRepository}</span>
            </a>`);
    }

    if (projectData.publicUrl) {
        links.push(`
            <a class="project-link" href="${escaparHTML(projectData.publicUrl)}" target="_blank" rel="noopener noreferrer">
                <i class="bi bi-globe2" aria-hidden="true"></i>
                <span>${t.publicUrl}</span>
            </a>`);
    }

    if (links.length === 0) return '';

    return `
        <div class="card project-links-card">
            <div class="card-body">
                <div class="project-links">
                    ${links.join('')}
                </div>
            </div>
        </div>`;
}

async function renderProjectDiagram(container, diagram, t) {
    if (!diagram) {
        container.remove();
        return;
    }

    if (typeof diagram !== 'string' || diagram.length > 10000 || /<\/?script|\bon\w+\s*=|javascript:/i.test(diagram)) {
        throw new Error('Invalid diagram content');
    }

    if (!window.mermaid) {
        container.textContent = t.diagramError;
        return;
    }

    const diagramId = `project-diagram-${Date.now()}`;
    const { svg } = await window.mermaid.render(diagramId, diagram);
    container.innerHTML = svg;
}

document.addEventListener('DOMContentLoaded', async () => {
    initializeSharedLayout();

    const lang = getBrowserLanguage();
    const t = await loadTranslations(lang);

    document.documentElement.lang = lang;
    registrarVisita();

    if (window.mermaid) {
        window.mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'base'
        });
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.textContent = t[key];
    });

    initializeVisualStyle();

    document.querySelectorAll('[data-privacy-notice]').forEach(el => {
        el.textContent = `${t.privacyNotice} `;
        const privacyLink = document.createElement('a');
        privacyLink.href = './privacy.html';
        privacyLink.textContent = lang === 'es'
            ? 'Política de privacidad'
            : lang === 'fr'
                ? 'Politique de confidentialité'
                : 'Privacy policy';
        el.appendChild(privacyLink);
    });

    const elCargando = document.getElementById('estado-cargando');
    const elError = document.getElementById('estado-error');
    const elVacio = document.getElementById('estado-vacio');
    const elLista = document.getElementById('proyectos-lista');
    const elPost = document.getElementById('projectos-contenido');

    // 2. Detectar si estamos buscando un post específico (?id=XYZ)
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('id');

    // --- MODO A: VISTA DE DETALLE (post.html) ---
    if (postId && elPost) {
        fetch(`${projectsApiPath}/${encodeURIComponent(postId)}`)
            .then(res => {
                if (!res.ok) throw new Error();
                return res.json();
            })
            .then(project => {
                if (elCargando) elCargando.classList.add('hidden');

                const projectData = prepararProyecto(project, lang, t);
                const imagen = projectData.imagenUrl
                    ? `<img src="${projectData.imagenUrl}" class="project-image-full img-fluid" alt="screenshot de ${escaparHTML(projectData.name)}" loading="lazy" decoding="async">`
                    : '';
                const postCard = document.createElement('article');
                postCard.className = 'project-detail';

                // Pintamos la información completa sin recortar en post.html
                postCard.innerHTML = `
                    <h1>${escaparHTML(projectData.name)}</h1>
                    ${imagen}
                    <p class="project-badges">${projectData.progLanguagesHtml}</p>
                    <p class="project-badges">${projectData.techStackHtml}</p>
                    <div class="project-description-full">
                        <div class="project-description" data-project-description></div>
                    </div>
                    <section class="project-diagram" aria-labelledby="project-diagram-title">
                        <h2 id="project-diagram-title">${t.architecture}</h2>
                        <div class="project-diagram-canvas" role="img" aria-label="${t.architecture}"></div>
                    </section>
                    ${renderProjectLinks(projectData, t)}
                `;
                renderizarDescripcion(
                    postCard.querySelector('[data-project-description]'),
                    projectData.descriptionFull
                );
                elPost.appendChild(postCard);
                renderProjectDiagram(
                    postCard.querySelector('.project-diagram-canvas'),
                    projectData.diagram,
                    t
                ).catch(() => {
                    const diagramContainer = postCard.querySelector('.project-diagram-canvas');
                    if (diagramContainer) diagramContainer.textContent = t.diagramError;
                });
            })
            .catch(error => {
                console.error('No se pudo cargar el detalle del proyecto.', error);
                if (elCargando) elCargando.classList.add('hidden');
                if (elError) elError.classList.remove('hidden');
            });

    // --- MODO B: VISTA DE LISTA (index.html / principal) ---
    } else if (elLista) {
        fetch(projectsApiPath)
            .then(res => {
                if (!res.ok) throw new Error();
                return res.json();
            })
            .then(data => {
                if (elCargando) elCargando.classList.add('hidden');

                const projects = data.items || [];
                if (projects.length === 0) {
                    if (elVacio) elVacio.classList.remove('hidden');
                    return;
                }

                const projectFragment = document.createDocumentFragment();

                projects.forEach(project => {
                    const projectData = prepararProyecto(project, lang, t, true);
                    const imagen = projectData.imagenUrl
                        ? `<a href="${escaparHTML(projectData.postDetailUrl)}" class="project-image-link">
                            <img src="${projectData.imagenUrl}" class="project-image" alt="screenshot de ${escaparHTML(projectData.name)}" loading="lazy" decoding="async">
                           </a>`
                        : '';
                    const postCard = document.createElement('article');
                    postCard.className = 'project-item';

                    postCard.innerHTML = `
                        <h2>
                            <a href="${escaparHTML(projectData.postDetailUrl)}" class="project-title-link">
                                ${escaparHTML(projectData.name)}
                            </a>
                        </h2>
                        ${imagen}
                        <p class="project-badges">${projectData.progLanguagesHtml}</p>
                        <p class="project-badges">${projectData.techStackHtml}</p>
                        <div class="project-description" data-project-description></div>
                    `;
                    renderizarDescripcion(
                        postCard.querySelector('[data-project-description]'),
                        projectData.description
                    );
                    projectFragment.appendChild(postCard);
                });
                elLista.appendChild(projectFragment);
            })
            .catch(error => {
                console.error('No se pudo cargar la lista de proyectos.', error);
                if (elCargando) elCargando.classList.add('hidden');
                if (elError) elError.classList.remove('hidden');
            });
    }
});

function escaparHTML(str) {
    return String(str).replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
