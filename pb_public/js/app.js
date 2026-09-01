const i18n = {
    es: {
        title: "Directorio de proyectos",
        subtitle: "Una lista pública de recursos compartidos",
        loading: "Buscando registros...",
        error: "[Error de sistema] No se pudieron cargar los datos.",
        empty: "0 proyectos encontrados en la base de datos.",
        visit: "Acceder al recurso",
        noDesc: "Sin descripción adicional.",
        langLocale: "es-ES"
    },
    en: {
        title: "Project Directory",
        subtitle: "A public list of shared resources",
        loading: "Fetching records...",
        error: "[System Error] Data could not be loaded.",
        empty: "0 projects found in the database.",
        visit: "Access resource",
        noDesc: "No additional description available.",
        langLocale: "en-US"
    }
};

function getBrowserLanguage() {
    const languages = navigator.languages || [navigator.language || 'es'];
    for (const lang of languages) {
        const shortLang = lang.split('-');
        if (i18n[shortLang]) return shortLang;
    }
    return 'es';
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

    fetch('api/collections/projects/records')
        .then(res => {
            if (!res.ok) throw new Error();
            return res.json();
        })
        .then(data => {
            elCargando.classList.add('hidden');
            
            const projects = data.items || [];

            if (projects.length === 0) {
                elVacio.classList.remove('hidden');
                return;
            }

            projects.forEach(item => {
                const description = item[`description_${lang}`] || item.description || t.noDesc;
                const name = item[`name_${lang}`] || item.name || 'Proyecto';
                const imagenUrl = item.screenshot
                    ? `api/files/${encodeURIComponent(item.collectionId)}/${encodeURIComponent(item.id)}/${encodeURIComponent(item.screenshot)}`
                    : '';
                const imagen = imagenUrl
                    ? `<img src="${imagenUrl}" class="project-image" alt="screenshot de ${escaparHTML(name)}">`
                    : '';
                const public_url = item.public || '#';
                const repo_url = item.repo || '#';
                
                const post = document.createElement('article');
                post.className = 'project-item';
                post.innerHTML = `
                    ${imagen}
                    <h2>${escaparHTML(name)}</h2>
                    <p>${escaparHTML(description)}</p>
                    <div class="meta-line">
                        <a href="${escaparHTML(public_url)}" class="link" target="_blank" rel="noopener noreferrer">${t.visit}</a>
                    </div>
                    <div class="meta-line">
                        <a href="${escaparHTML(repo_url)}" class="link" target="_blank" rel="noopener noreferrer">${t.visit}</a>
                    </div>
    `;
                elLista.appendChild(post);
            });
        })
        .catch(() => {
            elCargando.classList.add('hidden');
            elError.classList.remove('hidden');
        });
});

function escaparHTML(str) {
    return String(str).replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
