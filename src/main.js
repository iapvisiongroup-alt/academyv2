import './style.css';
import { Header } from './components/Header.js';
import { ImageStudio } from './components/ImageStudio.js';
import { Footer } from './components/Footer.js';
import { CookieBanner } from './components/CookieBanner.js';

const app = document.querySelector('#app');
// Hacemos que toda la app ocupe la pantalla completa
app.className = 'flex flex-col h-screen overflow-hidden';
let contentArea;

// Enrutador Principal
function navigate(page) {
    if (!contentArea) return;
    contentArea.innerHTML = '';

    if (page === 'image') {
        contentArea.appendChild(ImageStudio());
    } else if (page === 'video') {
        import('./components/VideoStudio.js').then(({ VideoStudio }) => {
            contentArea.appendChild(VideoStudio());
        });
    } else if (page === 'cinema') {
        import('./components/CinemaStudio.js').then(({ CinemaStudio }) => {
            contentArea.appendChild(CinemaStudio());
        });
    } else if (page === 'lipsync') {
        import('./components/LipSyncStudio.js').then(({ LipSyncStudio }) => {
            contentArea.appendChild(LipSyncStudio());
        });
    } else if (page === 'academy') {
        // Pantalla temporal para la academia
        const academyDiv = document.createElement('div');
        academyDiv.className = 'flex-1 flex flex-col items-center justify-center bg-[#050505] w-full h-full p-8';
        academyDiv.innerHTML = `
            <div class="text-6xl mb-4">🎓</div>
            <h2 class="text-3xl font-black text-white mb-2">Academia de IA</h2>
            <p class="text-white/50">Cursos avanzados para empresas y creadores. Disponible próximamente.</p>
        `;
        contentArea.appendChild(academyDiv);
    }
}

app.innerHTML = '';

// 1. Añadimos la Cabecera
app.appendChild(Header(navigate));

// 2. Añadimos el Área de Contenido (Estudios)
contentArea = document.createElement('main');
contentArea.id = 'content-area';
contentArea.className = 'flex-1 relative w-full overflow-hidden flex flex-col bg-[#050505]';
app.appendChild(contentArea);

// 3. Añadimos el Pie de Página (Footer)
app.appendChild(Footer());

// 4. Inyectamos el Banner de Cookies si no ha sido aceptado
const cookieBanner = CookieBanner();
if (cookieBanner) {
    document.body.appendChild(cookieBanner);
}

// Ruta inicial al cargar la web
navigate('image');

// Escuchador de eventos de navegación
window.addEventListener('navigate', (e) => {
    if (e.detail.page === 'settings') {
        import('./components/SettingsModal.js').then(({ SettingsModal }) => {
            document.body.appendChild(SettingsModal());
        });
    } else {
        navigate(e.detail.page);
    }
});
