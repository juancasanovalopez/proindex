const i18n = {
    es: {
        title: "Directorio de proyectos",
        directory: "Directorio",
        allProjects: "Todos los proyectos",
        subtitle: "Una lista pública de recursos compartidos",
        loading: "Buscando registros...",
        error: "[Error de sistema] No se pudieron cargar los datos.",
        empty: "0 proyectos encontrados en la base de datos.",
        repo: "repositorio de código",
        public: "url pública",
        noDesc: "Sin descripción adicional.",
        langLocale: "es-ES"
    },
    en: {
        title: "Project Directory",
        directory: "Directory",
        allProjects: "All projects",
        subtitle: "A public list of shared resources",
        loading: "Fetching records...",
        error: "[System Error] Data could not be loaded.",
        empty: "0 projects found in the database.",
        repo: "code repository",
        public: "Public url",
        noDesc: "No additional description available.",
        langLocale: "en-US"
    },
    fr: {
        title: "Répertoire des projets",
        directory: "Répertoire",
        allProjects: "Tous les projets",
        subtitle: "Une liste publique de ressources partagées",
        loading: "Récupération des données...",
        error: "[Erreur système] Impossible de charger les données.",
        empty: "0 projet trouvé dans la base de données.",
        repo: "dépôt de code",
        public: "URL publique",
        noDesc: "Aucune description supplémentaire disponible.",
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

function getProjectLanguages(project) {
    if (Array.isArray(project.languajes)) return project.languajes;
    return project.languajes ? [project.languajes] : [];
}

document.addEventListener('DOMContentLoaded', () => {
    const lang = getBrowserLanguage();
    const t = i18n[lang];

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

    function recortarDescripcion(texto) {
        if (!texto) return '';
        const palabras = texto.trim().split(/\s+/);
        if (palabras.length > 30) {
            return palabras.slice(0, 30).join(' ') + '...';
        }
        return texto;
    }

    // --- MODO A: VISTA DE DETALLE (post.html) ---
    if (postId && elPost) {
        fetch(`${projectsApiPath}/${encodeURIComponent(postId)}`)
            .then(res => {
                if (!res.ok) throw new Error();
                return res.json();
            })
            .then(project => {
                if (elCargando) elCargando.classList.add('hidden');

                const name = project.name || 'Proyecto';
                const descriptionFull = project[`description_${lang}`] || t.noDesc;
                const imagenUrl = getScreenshotUrl(project);
                
                const imagen = imagenUrl
                    ? `<img src="${imagenUrl}" class="project-image-full img-fluid" alt="screenshot de ${escaparHTML(name)}" loading="lazy" decoding="async">`
                    : '';
                
                const badgesHtml = getProjectLanguages(project)
                    .map(opcion => `<span class="badge rounded-pill text-bg-dark">${escaparHTML(opcion)}</span>`)
                    .join(' ');

                const postCard = document.createElement('article');
                postCard.className = 'project-detail';

                // Pintamos la información completa sin recortar en post.html
                postCard.innerHTML = `
                    <h1>${escaparHTML(name)}</h1>
                    ${imagen}
                    <p class="project-badges">${badgesHtml}</p>
                    <div class="project-description-full">
                        <p>${escaparHTML(descriptionFull)}</p>
                    </div>
                `;
                elPost.appendChild(postCard);
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

                projects.forEach(project => {
                    const descriptionOriginal = project[`description_${lang}`] || t.noDesc;
                    const description = recortarDescripcion(descriptionOriginal);
                    const name = project.name || 'Proyecto';
                    const postDetailUrl = `post.html?id=${encodeURIComponent(project.id)}`;
                    
                    const imagenUrl = getScreenshotUrl(project);
                    
                    const imagen = imagenUrl
                        ? `<a href="${escaparHTML(postDetailUrl)}" class="project-image-link">
                            <img src="${imagenUrl}" class="project-image" alt="screenshot de ${escaparHTML(name)}" loading="lazy" decoding="async">
                           </a>`
                        : '';
                    
                    const badgesHtml = getProjectLanguages(project)
                        .map(opcion => `<span class="badge rounded-pill text-bg-dark">${escaparHTML(opcion)}</span>`)
                        .join(' ');
                    
                    const postCard = document.createElement('article');
                    postCard.className = 'project-item';

                    postCard.innerHTML = `
                        <h2>
                            <a href="${escaparHTML(postDetailUrl)}" class="project-title-link">
                                ${escaparHTML(name)}
                            </a>
                        </h2>
                        ${imagen}
                        <p class="project-badges">${badgesHtml}</p>
                        <p>${escaparHTML(description)}</p>
                    `;
                    elLista.appendChild(postCard);
                });
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
