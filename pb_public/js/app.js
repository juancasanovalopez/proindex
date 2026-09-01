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

    fetch('/api/collections/proyectos/records')
        .then(res => {
            if (!res.ok) throw new Error();
            return res.json();
        })
        .then(data => {
            elCargando.classList.add('hidden');
            
            const proyectos = (data.items || []).sort((a, b) => new Date(b.created) - new Date(a.created));

            if (proyectos.length === 0) {
                elVacio.classList.remove('hidden');
                return;
            }

            proyectos.forEach(item => {
                const fecha = new Date(item.created).toLocaleDateString(t.langLocale, {
                    year: 'numeric', month: 'long', day: 'numeric'
                });
                
                const explicacion = item[`explicacion_${lang}`] || item.explicacion || t.noDesc;
                const titulo = item[`titulo_${lang}`] || item.titulo || 'Proyecto';
                const imagen = item.captura
                    ? `<img src="${escaparHTML(item.captura)}" class="card-img-top" alt="Captura de ${escaparHTML(titulo)}">`
                    : '';
                const enlace = item.enlace || item.url || '#';

                const articulo = document.createElement('article');
                articulo.className = 'project-item';
                articulo.innerHTML = `
                    <div class="card" style="width: 18rem; margin: 10px;">
                        ${imagen}
                        <div class="card-body">
                            <h5 class="card-title">${escaparHTML(titulo)}</h5>
                            <p class="card-text">${escaparHTML(explicacion)}</p>
                            <a href="${escaparHTML(enlace)}" class="btn btn-primary">${t.visit}</a>
                        </div>
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
