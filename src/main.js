import './style.css';
import { Header } from './components/Header.js';
import { LandingPage } from './components/LandingPage.js';
import { ImageStudio } from './components/ImageStudio.js';
import { Footer } from './components/Footer.js';
import { CookieBanner } from './components/CookieBanner.js';

const app = document.querySelector('#app');
app.className = 'flex flex-col h-screen overflow-hidden';

let contentArea;
let navToken = 0;

function openAdminPanel() {
    import('./components/AdminPanel.js').then(({ AdminPanel }) => {
        if (!document.querySelector('#admin-panel-root')) {
            const panel = AdminPanel();
            panel.id = 'admin-panel-root';
            document.body.appendChild(panel);
        }
    });
}

function navigate(page) {
    if (!contentArea) return;

    if (page === 'admin') {
        openAdminPanel();
        return;
    }

    const token = ++navToken;
    contentArea.innerHTML = '';

    if (page === 'home') {
        contentArea.appendChild(LandingPage(navigate));

    } else if (page === 'image') {
        contentArea.appendChild(ImageStudio());

    } else if (page === 'video') {
        import('./components/VideoStudio.js').then(({ VideoStudio }) => {
            if (token === navToken) contentArea.appendChild(VideoStudio());
        });

    } else if (page === 'music') {
        import('./components/KreateMusicStudio.js').then(({ KreateMusicStudio }) => {
            if (token === navToken) contentArea.appendChild(KreateMusicStudio());
        });

    } else if (page === 'cinema') {
        import('./components/CinemaStudio.js').then(({ CinemaStudio }) => {
            if (token === navToken) contentArea.appendChild(CinemaStudio());
        });

    } else if (page === 'lipsync') {
        import('./components/LipSyncStudio.js').then(({ LipSyncStudio }) => {
            if (token === navToken) contentArea.appendChild(LipSyncStudio());
        });

    } else if (page === 'library') {
        const div = document.createElement('div');
        div.className = 'flex-1 flex flex-col items-center justify-center bg-[#050505] w-full h-full p-8';
        div.innerHTML = '<div style="font-size:64px;opacity:.3">📚</div><h2 style="color:#fff;font-size:24px;font-weight:900;margin:16px 0 8px">Historial</h2><p style="color:#555;font-size:14px">Próximamente disponible</p>';
        contentArea.appendChild(div);

    } else if (page === 'academy') {
        const academyDiv = document.createElement('div');
        academyDiv.className = 'flex-1 flex flex-col items-center justify-center bg-[#050505] w-full h-full p-8';
        academyDiv.innerHTML = `
            <div class="text-6xl mb-4">🎓</div>
            <h2 class="text-3xl font-black text-white mb-2">Academia de IA</h2>
            <p class="text-white/50">Cursos avanzados para empresas y creadores. Disponible próximamente.</p>
        `;
        contentArea.appendChild(academyDiv);

    } else {
        contentArea.appendChild(LandingPage(navigate));
    }
}

app.innerHTML = '';

app.appendChild(Header(navigate));

contentArea = document.createElement('main');
contentArea.id = 'content-area';
contentArea.className = 'flex-1 relative w-full overflow-hidden flex flex-col bg-[#050505]';
app.appendChild(contentArea);

app.appendChild(Footer());

const cookieBanner = CookieBanner();
if (cookieBanner) document.body.appendChild(cookieBanner);

navigate('home');

import('./components/GenerationCenter.js').then(({ GenerationCenter }) => {
    if (!document.querySelector('#generation-center-root')) {
        const gc = GenerationCenter();
        gc.id = 'generation-center-root';
        document.body.appendChild(gc);
    }
});

window.addEventListener('navigate', (e) => {
    if (e.detail.page === 'settings') {
        import('./components/SettingsModal.js').then(({ SettingsModal }) => {
            document.body.appendChild(SettingsModal());
        });
    } else if (e.detail.page === 'admin') {
        openAdminPanel();
    } else {
        navigate(e.detail.page);
    }
});
