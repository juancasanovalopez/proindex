const i18n = {
    es: {
        title: "Directorio de proyectos",
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
        subtitle: "A public list of shared resources",
        loading: "Fetching records...",
        error: "[System Error] Data could not be loaded.",
        empty: "0 projects found in the database.",
        repo: "code repository",
        public: "Public url",
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
                const name =  item.name || 'Proyecto';
                const imagenUrl = item.screenshot
                    ? `api/files/${encodeURIComponent(item.collectionId)}/${encodeURIComponent(item.id)}/${encodeURIComponent(item.screenshot)}`
                    : '';
                const imagen = imagenUrl
                    ? `<img src="${imagenUrl}" class="project-image" alt="screenshot de ${escaparHTML(name)}">`
                    : '';
                const public_url = item.public || '#';
                const repo_url = item.repo || '#';

                // 1. Obtener las opciones seleccionadas (asumiendo que tu campo se llama 'tags' o 'categoria')
                // Cambia 'tu_campo_select' por el nombre real de tu columna en PocketBase
                const opcionesSeleccionadas = item.languajes; 
    
                // 2. Convertir a Array si es un string único, o dejar vacío si no hay nada
                const listaOpciones = Array.isArray(opcionesSeleccionadas) 
                ? opcionesSeleccionadas 
                : (opcionesSeleccionadas ? [opcionesSeleccionadas] : []);

                // 3. Generar el HTML de los badges escapando el texto para evitar XSS
                const badgesHtml = listaOpciones
                .map(opcion => `<span class="badge rounded-pill text-bg-dark">${escaparHTML(opcion)}</span>`)
                .join(' '); // Une todos los badges con un espacio

                const post = document.createElement('article');
                post.className = 'project-item';
                post.innerHTML = `
                    ${imagen}
                    <h2>${escaparHTML(name)}</h2>
                      
                    <p class="project-badges">
                        ${badgesHtml}
                    </p>  
                    <p>${description}</p>
                    <div class="meta-line">
                        <a href="${escaparHTML(public_url)}" class="link" target="_blank" rel="noopener noreferrer">${t.public}</a>
                    </div>
                    <div class="meta-line">
                        <a href="${escaparHTML(repo_url)}" class="link" target="_blank" rel="noopener noreferrer">${t.repo}</a>
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
