import './style.css';
import { Header } from './components/Header.js';
import { LandingPage } from './components/LandingPage.js';
import { ImageStudio } from './components/ImageStudio.js';
import { Footer } from './components/Footer.js';
import { CookieBanner } from './components/CookieBanner.js';

function recoverMainStylesheet() {
    const stylesheet = document.querySelector('link[rel="stylesheet"][href*="/assets/"]');

    if (!stylesheet) return;

    window.setTimeout(async () => {
        const stylesLoaded = getComputedStyle(document.body).margin === '0px';

        if (stylesLoaded || document.querySelector('#kreateia-css-fallback')) return;

        try {
            const response = await fetch(stylesheet.href, { cache: 'reload' });
            if (!response.ok) return;

            const fallback = document.createElement('style');
            fallback.id = 'kreateia-css-fallback';
            fallback.textContent = await response.text();
            document.head.appendChild(fallback);
        } catch (error) {
            console.warn('[KreateIA] No se pudo recuperar la hoja de estilos:', error);
        }
    }, 800);
}

recoverMainStylesheet();

const app = document.querySelector('#app');
document.documentElement.dataset.build = 'kreateedit-beta-1';
app.className = 'flex flex-col h-screen overflow-hidden';

const ROUTABLE_PAGES = new Set([
    'home',
    'image',
    'video',
    'music',
    'kreateedit',
    'cinema',
    'lipsync',
    'library',
    'academy',
]);

let contentArea;
let navToken = 0;

async function importFresh(moduleLoader) {
    try {
        const module = await moduleLoader();
        sessionStorage.removeItem('kreateia_chunk_reload');
        return module;
    } catch (error) {
        const message = String(error?.message || '');
        const isStaleChunk = message.includes('dynamically imported module')
            || message.includes('Importing a module script failed')
            || message.includes('error loading dynamically imported module');

        if (isStaleChunk && sessionStorage.getItem('kreateia_chunk_reload') !== '1') {
            sessionStorage.setItem('kreateia_chunk_reload', '1');
            window.location.reload();
            return null;
        }

        throw error;
    }
}

function openAdminPanel() {
    importFresh(() => import('./components/AdminPanel.js')).then(module => {
        if (!module) return;
        const { AdminPanel } = module;
        if (!document.querySelector('#admin-panel-root')) {
            const panel = AdminPanel();
            panel.id = 'admin-panel-root';
            document.body.appendChild(panel);
        }
    });
}

function pageFromUrl() {
    const params = new URLSearchParams(window.location.search);

    if (params.has('academy_payment')) return 'academy';

    const requestedPage = String(params.get('page') || '').trim().toLowerCase();
    return ROUTABLE_PAGES.has(requestedPage) ? requestedPage : 'home';
}

function updatePageUrl(page, replace = false) {
    if (!ROUTABLE_PAGES.has(page)) return;

    const url = new URL(window.location.href);

    if (page === 'home') url.searchParams.delete('page');
    else url.searchParams.set('page', page);

    const nextUrl = url.pathname + url.search + url.hash;
    const method = replace ? 'replaceState' : 'pushState';

    if (nextUrl !== window.location.pathname + window.location.search + window.location.hash) {
        window.history[method]({ page }, '', nextUrl);
    }
}

function navigate(page, options = {}) {
    if (!contentArea) return;

    if (page === 'admin') {
        openAdminPanel();
        return;
    }

    const safePage = ROUTABLE_PAGES.has(page) ? page : 'home';

    if (options.updateUrl !== false) {
        updatePageUrl(safePage, options.replaceUrl === true);
    }

    const token = ++navToken;
    contentArea.innerHTML = '';

    if (safePage === 'home') {
        contentArea.appendChild(LandingPage(navigate));

    } else if (safePage === 'image') {
        contentArea.appendChild(ImageStudio());

    } else if (safePage === 'video') {
        importFresh(() => import('./components/VideoStudio.js')).then(module => {
            if (!module) return;
            const { VideoStudio } = module;
            if (token === navToken) contentArea.appendChild(VideoStudio());
        });

    } else if (safePage === 'music') {
        importFresh(() => import('./components/KreateMusicStudio.js')).then(module => {
            if (!module) return;
            const { KreateMusicStudio } = module;
            if (token === navToken) contentArea.appendChild(KreateMusicStudio());
        });

    } else if (safePage === 'kreateedit') {
        importFresh(() => import('./components/KreateEditPage.js')).then(module => {
            if (!module) return;
            const { KreateEditPage } = module;
            if (token === navToken) contentArea.appendChild(KreateEditPage());
        });

    } else if (safePage === 'cinema') {
        importFresh(() => import('./components/CinemaStudio.js')).then(module => {
            if (!module) return;
            const { CinemaStudio } = module;
            if (token === navToken) contentArea.appendChild(CinemaStudio());
        });

    } else if (safePage === 'lipsync') {
        importFresh(() => import('./components/LipSyncStudio.js')).then(module => {
            if (!module) return;
            const { LipSyncStudio } = module;
            if (token === navToken) contentArea.appendChild(LipSyncStudio());
        });

    } else if (safePage === 'library') {
        const div = document.createElement('div');
        div.className = 'flex-1 flex flex-col items-center justify-center bg-[#050505] w-full h-full p-8';
        div.innerHTML = '<div style="font-size:64px;opacity:.3">📚</div><h2 style="color:#fff;font-size:24px;font-weight:900;margin:16px 0 8px">Historial</h2><p style="color:#555;font-size:14px">Próximamente disponible</p>';
        contentArea.appendChild(div);

    } else if (safePage === 'academy') {
        importFresh(() => import('./components/AcademyPage.js')).then(module => {
            if (!module) return;
            const { AcademyPage } = module;
            if (token === navToken) contentArea.appendChild(AcademyPage(navigate));
        });
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

navigate(pageFromUrl(), { updateUrl: false });

importFresh(() => import('./components/GenerationCenter.js')).then(module => {
    if (!module) return;
    const { GenerationCenter } = module;
    if (!document.querySelector('#generation-center-root')) {
        const gc = GenerationCenter();
        gc.id = 'generation-center-root';
        document.body.appendChild(gc);
    }
});

window.addEventListener('navigate', (event) => {
    if (event.detail.page === 'settings') {
        importFresh(() => import('./components/SettingsModal.js')).then(module => {
            if (!module) return;
            const { SettingsModal } = module;
            document.body.appendChild(SettingsModal());
        });
    } else if (event.detail.page === 'admin') {
        openAdminPanel();
    } else {
        navigate(event.detail.page);
    }
});

window.addEventListener('popstate', () => {
    navigate(pageFromUrl(), { updateUrl: false });
});
