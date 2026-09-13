const i18n = {
    es: {
        title: "Portfolio",
        directory: "Directorio",
        allProjects: "Todos los proyectos",
        subtitle: "Una lista pública de recursos compartidos",
        loading: "Buscando registros...",
        error: "[Error de sistema] No se pudieron cargar los datos.",
        empty: "0 proyectos encontrados en la base de datos.",
        repo: "repositorio de código",
        codeRepository: "Repositorio de código",
        noRepo: "Sin repositorio disponible.",
        public: "url pública",
        publicUrl: "URL pública",
        noPublic: "Sin URL pública disponible.",
        noDesc: "Sin descripción adicional.",
        architecture: "Esquema de arquitectura",
        diagramError: "No se pudo renderizar el esquema.",
        noDiagram: "Sin esquema disponible.",
        langLocale: "es-ES"
    },
    en: {
        title: "Portfolio",
        directory: "Directory",
        allProjects: "All projects",
        subtitle: "A public list of shared resources",
        loading: "Fetching records...",
        error: "[System Error] Data could not be loaded.",
        empty: "0 projects found in the database.",
        repo: "code repository",
        codeRepository: "Code Repository",
        noRepo: "No repository available.",
        public: "Public url",
        publicUrl: "Public URL",
        noPublic: "No public URL available.",
        noDesc: "No additional description available.",
        architecture: "Architecture diagram",
        diagramError: "The diagram could not be rendered.",
        noDiagram: "No diagram available.",
        langLocale: "en-US"
    },
    fr: {
        title: "Portfolio",
        directory: "Répertoire",
        allProjects: "Tous les projets",
        subtitle: "Une liste publique de ressources partagées",
        loading: "Récupération des données...",
        error: "[Erreur système] Impossible de charger les données.",
        empty: "0 projet trouvé dans la base de données.",
        repo: "dépôt de code",
        codeRepository: "Dépôt de code",
        noRepo: "Pas de dépôt disponible.",
        public: "URL publique",
        publicUrl: "URL publique",
        noPublic: "Pas d'URL publique disponible.",
        noDesc: "Aucune description supplémentaire disponible.",
        architecture: "Schéma d'architecture",
        diagramError: "Impossible de rendre le schéma.",
        noDiagram: "Pas de schéma disponible.",
        langLocale: "fr-FR"
    }
};

const projectsApiPath = 'api/collections/projects/records';

function getBrowserLanguage() {
    const languages = navigator.languages || [navigator.language || 'es'];
    for (const langCode of languages) {
        const shortLang = langCode.split('-')[0];
        if (i18n[shortLang]) return shortLang;
    }
    return 'es';
}

function getScreenshotUrl(project) {
    if (!project.screenshot) return '';

    return `api/files/${encodeURIComponent(project.collectionId)}/${encodeURIComponent(project.id)}/${encodeURIComponent(project.screenshot)}`;
}

function getMultipleSelection(project, fieldName) {
    if (!project || !fieldName) return [];
    const value = project[fieldName];

    if (Array.isArray(value)) return value;
    return value ? [value] : [];
}

function recortarDescripcion(texto) {
    if (!texto) return '';
    const palabras = texto.trim().split(/\s+/);
    if (palabras.length > 30) {
        return palabras.slice(0, 30).join(' ') + '...';
    }
    return texto;
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
        repoUrl: project.repo || t.noRepo,
        publicUrl: project.public || t.noPublic,
        diagram: project.arch_schema || t.noDiagram,
        progLanguagesHtml: renderBadges(progLanguages),
        techStackHtml: renderBadges(techStack, true),
        postDetailUrl: esLista ? `post.html?id=${encodeURIComponent(project.id)}` : ''
    };
}

function renderBadges(options) {
    return options
        .map(option => `<span class="badge rounded-pill text-bg-dark">  ${escaparHTML(option)}</span>`)
        .join(' ');
}

async function renderProjectDiagram(container, diagram, t) {
    if (!diagram) {
        container.remove();
        return;
    }

    if (!window.mermaid) {
        container.textContent = t.diagramError;
        return;
    }

    const diagramId = `project-diagram-${Date.now()}`;
    const { svg } = await window.mermaid.render(diagramId, diagram);
    container.innerHTML = svg;
}

document.addEventListener('DOMContentLoaded', () => {
    const lang = getBrowserLanguage();
    const t = i18n[lang];

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
                        <p>${projectData.descriptionFull}</p>
                    </div>
                    <section class="project-diagram" aria-labelledby="project-diagram-title">
                        <h2 id="project-diagram-title">${t.architecture}</h2>
                        <div class="project-diagram-canvas" role="img" aria-label="${t.architecture}"></div>
                    </section>
                    <div class="card project-links-card">
                            <div class="card-body">
                                <div class="project-links">
                                    <a class="project-link" href="${escaparHTML(projectData.repoUrl)}" target="_blank" rel="noopener noreferrer">
                                        <i class="bi bi-git" aria-hidden="true"></i>
                                        <span>${t.codeRepository}</span>
                                    </a>
                                    <a class="project-link" href="${escaparHTML(projectData.publicUrl)}" target="_blank" rel="noopener noreferrer">
                                        <i class="bi bi-globe2" aria-hidden="true"></i>
                                        <span>${t.publicUrl}</span>
                                    </a>
                                </div>
                            </div>
                        </div>
                `;
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
                        <p>${projectData.description}</p>
                    `;
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
