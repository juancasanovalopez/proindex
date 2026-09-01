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

    fetch('api/collections/proyectos/records')
        .then(res => {
            if (!res.ok) throw new Error();
            return res.json();
        })
        .then(data => {
            elCargando.classList.add('hidden');
            
            const proyectos = data.items || [];

            if (proyectos.length === 0) {
                elVacio.classList.remove('hidden');
                return;
            }

            proyectos.forEach(item => {
                const explicacion = item[`explicacion_${lang}`] || item.explicacion || t.noDesc;
                const titulo = item[`titulo_${lang}`] || item.titulo || 'Proyecto';
                const imagenUrl = item.captura
                    ? `api/files/${encodeURIComponent(item.collectionId)}/${encodeURIComponent(item.id)}/${encodeURIComponent(item.captura)}`
                    : '';
                const imagen = imagenUrl
                    ? `<img src="${imagenUrl}" class="project-image" alt="Captura de ${escaparHTML(titulo)}">`
                    : '';
                const enlace = item.repo || item.enlace || item.url || '#';

                const articulo = document.createElement('article');
                articulo.className = 'project-item';
                articulo.innerHTML = `
                    ${imagen}
                    <h2>${escaparHTML(titulo)}</h2>
                    <p>${escaparHTML(explicacion)}</p>
                    <div class="meta-line">
                        <a href="${escaparHTML(enlace)}" class="link" target="_blank" rel="noopener noreferrer">${t.visit}</a>
                    </div>
    `;
                elLista.appendChild(articulo);
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
