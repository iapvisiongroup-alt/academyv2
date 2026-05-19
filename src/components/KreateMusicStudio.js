import { auth, db, APP_ID } from '../lib/firebase.js';
import {
    collection, addDoc, getDocs, doc, getDoc, updateDoc,
    query, orderBy, limit, serverTimestamp, setDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ============================================================
// PRECIOS MuAPI + 35% margen. 1 CR = $0.01
// ============================================================
const MUSIC_COSTS = {
    'suno-create-music':       20,  // $0.10 x2
    'suno-extend-music':       20,
    'suno-remix-music':        20,
    'suno-add-vocals':         20,
    'suno-add-instrumental':   20,
    'suno-generate-mashup':    20,
    'suno-generate-lyrics':    1,   // $0.0033 x2 = mínimo 1 CR
    'suno-boost-music-style':  1,
    'suno-generate-sounds':    4,   // $0.022 x2
    'suno-voice-clone':        2,   // gratis en MuAPI, cobramos mínimo 2 CR
    'nano-banana-2':           24,  // $0.12 x2
    'nano-banana-2-edit':      12,  // $0.06 x2
};

// ============================================================
// HELPERS
// ============================================================

const BASE_URL = window.location.origin;

async function callMuapi(endpoint, params, token) {
    const resp = await fetch(`/api/v1/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(params)
    });
    if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Error (${resp.status}): ${t.slice(0, 200)}`);
    }
    return resp.json();
}

async function pollResult(requestId, token, maxAttempts = 90, interval = 3000) {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, interval));
        const resp = await fetch(`/api/v1/predictions/${requestId}/result`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) { if (resp.status >= 500) continue; throw new Error(`Poll ${resp.status}`); }
        const data = await resp.json();
        const status = (data.status || data.output?.status || '').toLowerCase();
        const url = data.output?.outputs?.[0] || data.outputs?.[0] || data.url || data.audio_url
                 || data.output?.url || data.image_url;
        if (url) return { url, data };
        if (status === 'failed' || status === 'error')
            throw new Error(data.error || data.output?.error || 'La generación falló.');
    }
    throw new Error('Tiempo de espera agotado.');
}

async function checkCredits(userRef, cost) {
    const snap = await getDoc(userRef);
    const credits = snap.exists() ? (snap.data().credits || 0) : 0;
    const isAdmin = snap.exists() && snap.data().role === 'admin';
    if (!isAdmin && credits < cost)
        throw new Error(`Saldo insuficiente. Necesitas ${cost} 🪙 y tienes ${credits} 🪙.`);
    return { credits, isAdmin };
}

async function deductCredits(userRef, cost, isAdmin) {
    if (!isAdmin && cost > 0) {
        const snap = await getDoc(userRef);
        const cur = snap.data().credits || 0;
        await updateDoc(userRef, { credits: Math.max(0, cur - cost) });
    }
}

// Spinner inline
function spinner(size = 20) {
    const s = document.createElement('div');
    s.style.cssText = `width:${size}px;height:${size}px;border:2px solid #f59e0b33;border-top-color:#f59e0b;border-radius:50%;animation:spin 1s linear infinite;flex-shrink:0`;
    return s;
}

// Inject spin keyframes once
if (!document.querySelector('#km-spin')) {
    const st = document.createElement('style');
    st.id = 'km-spin';
    st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(st);
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export function KreateMusicStudio() {
    const root = document.createElement('div');
    root.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;background:#050505;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif';

    let currentUser = null;
    let currentArtist = null; // { id, name, referencePhotoUrl, voiceId, voiceStyle, ... }
    let artists = [];

    // ── Views ──
    const views = {};
    const showView = (name) => {
        Object.values(views).forEach(v => { v.style.display = 'none'; });
        if (views[name]) views[name].style.display = 'flex';
    };

    // ============================================================
    // AUTH GUARD
    // ============================================================
    const authGuard = document.createElement('div');
    authGuard.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#fff';
    authGuard.innerHTML = `
        <div style="font-size:40px">🎵</div>
        <p style="color:#888;font-size:14px">Inicia sesión para usar KreateMusic</p>
    `;
    views.auth = authGuard;
    root.appendChild(authGuard);

    // ============================================================
    // VIEW: LISTA DE ARTISTAS
    // ============================================================
    const artistListView = document.createElement('div');
    artistListView.style.cssText = 'flex:1;flex-direction:column;overflow-y:auto;padding:24px;gap:24px;display:none';
    views.artistList = artistListView;
    root.appendChild(artistListView);

    function renderArtistList() {
        artistListView.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;flex-shrink:0';
        header.innerHTML = `
            <div>
                <h1 style="color:#fff;font-size:24px;font-weight:900;margin:0">KreateMusic</h1>
                <p style="color:#555;font-size:13px;margin:4px 0 0">Tus artistas de IA</p>
            </div>
        `;
        const newArtistBtn = document.createElement('button');
        newArtistBtn.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 20px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:13px;font-weight:700;cursor:pointer';
        newArtistBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg> Nuevo artista`;
        newArtistBtn.addEventListener('click', () => showView('createArtist'));
        header.appendChild(newArtistBtn);
        artistListView.appendChild(header);

        if (artists.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center';
            empty.innerHTML = `
                <div style="font-size:64px;filter:grayscale(1);opacity:.3">🎤</div>
                <p style="color:#fff;font-size:18px;font-weight:700;margin:0">Sin artistas aún</p>
                <p style="color:#555;font-size:13px;margin:0">Crea tu primer artista de IA</p>
            `;
            artistListView.appendChild(empty);
            return;
        }

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px';

        artists.forEach(artist => {
            const card = document.createElement('div');
            card.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden;cursor:pointer;transition:border-color .15s;animation:fadeUp .3s ease';
            card.addEventListener('mouseenter', () => card.style.borderColor = '#f59e0b66');
            card.addEventListener('mouseleave', () => card.style.borderColor = '#2a2a2a');
            card.innerHTML = `
                <div style="aspect-ratio:1;overflow:hidden;background:#1a1a1a">
                    ${artist.referencePhotoUrl
                        ? `<img src="${artist.referencePhotoUrl}" style="width:100%;height:100%;object-fit:cover">`
                        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:48px">🎤</div>`
                    }
                </div>
                <div style="padding:12px">
                    <p style="color:#fff;font-size:14px;font-weight:700;margin:0 0 4px">${artist.name}</p>
                    <p style="color:#555;font-size:11px;margin:0">${artist.genre || ''} · ${artist.style || ''}</p>
                    <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
                        ${artist.voiceId ? `<span style="background:#f59e0b22;color:#f59e0b;font-size:9px;font-weight:700;padding:2px 6px;border-radius:100px;border:1px solid #f59e0b33">VOZ CLONADA</span>` : ''}
                        ${artist.voiceStyle ? `<span style="background:#3b82f622;color:#60a5fa;font-size:9px;font-weight:700;padding:2px 6px;border-radius:100px;border:1px solid #3b82f633">ESTILO VOZ</span>` : ''}
                    </div>
                </div>
            `;
            card.addEventListener('click', () => {
                currentArtist = artist;
                renderArtistDashboard();
                showView('artistDashboard');
            });
            grid.appendChild(card);
        });
        artistListView.appendChild(grid);
    }

    // ============================================================
    // VIEW: CREAR ARTISTA
    // ============================================================
    const createArtistView = document.createElement('div');
    createArtistView.style.cssText = 'flex:1;flex-direction:column;overflow-y:auto;padding:24px;gap:20px;display:none;max-width:640px;margin:0 auto;width:100%';
    views.createArtist = createArtistView;
    root.appendChild(createArtistView);

    function renderCreateArtist() {
        createArtistView.innerHTML = '';

        // Back
        const back = document.createElement('button');
        back.style.cssText = 'display:flex;align-items:center;gap:6px;background:none;border:none;color:#888;font-size:13px;cursor:pointer;padding:0;width:fit-content';
        back.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg> Mis artistas`;
        back.addEventListener('click', () => showView('artistList'));
        createArtistView.appendChild(back);

        const title = document.createElement('div');
        title.innerHTML = `<h2 style="color:#fff;font-size:20px;font-weight:900;margin:0">Crear nuevo artista</h2><p style="color:#555;font-size:13px;margin:6px 0 0">Describe tu artista y generaremos una foto de referencia</p>`;
        createArtistView.appendChild(title);

        // Form fields
        const fields = [
            { id: 'name',       label: 'Nombre del artista',         placeholder: 'Ej: Luna Reyes',                        type: 'text' },
            { id: 'genre',      label: 'Género musical',             placeholder: 'Ej: Reggaeton, Pop, R&B, Trap...',       type: 'text' },
            { id: 'style',      label: 'Estilo / Vibe',              placeholder: 'Ej: Oscuro y elegante, Urbano, Fresco...', type: 'text' },
            { id: 'ethnicity',  label: 'Etnia / Origen',             placeholder: 'Ej: Latina, Africana, Asiática, Europea...', type: 'text' },
            { id: 'age',        label: 'Edad aproximada',            placeholder: 'Ej: 25 años',                            type: 'text' },
            { id: 'gender',     label: 'Género',                     placeholder: 'Ej: Mujer, Hombre, No binario...',       type: 'text' },
            { id: 'build',      label: 'Complexión / físico',        placeholder: 'Ej: Atlética, Delgada, Curvilínea...',   type: 'text' },
            { id: 'outfit',     label: 'Vestimenta / estética',      placeholder: 'Ej: Streetwear, Elegante, Deportivo...', type: 'text' },
            { id: 'extra',      label: 'Detalles extra (opcional)',   placeholder: 'Tatuajes, color de cabello, accesorios...', type: 'textarea' },
        ];

        const formData = {};
        fields.forEach(f => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
            const lbl = document.createElement('label');
            lbl.style.cssText = 'color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
            lbl.textContent = f.label;
            wrap.appendChild(lbl);

            const input = f.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
            input.placeholder = f.placeholder;
            input.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s';
            if (f.type === 'textarea') { input.rows = 3; input.style.resize = 'none'; }
            input.addEventListener('focus', () => input.style.borderColor = '#f59e0b66');
            input.addEventListener('blur',  () => input.style.borderColor = '#2a2a2a');
            input.addEventListener('input', () => { formData[f.id] = input.value; });
            wrap.appendChild(input);
            createArtistView.appendChild(wrap);
        });

        // Voz
        const voiceSection = document.createElement('div');
        voiceSection.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px';
        voiceSection.innerHTML = `<p style="color:#fff;font-size:13px;font-weight:700;margin:0">🎤 Configuración de voz</p>`;

        let voiceMode = 'style'; // 'style' | 'clone'
        const voiceToggle = document.createElement('div');
        voiceToggle.style.cssText = 'display:flex;gap:8px';

        const styleBtn = document.createElement('button');
        styleBtn.style.cssText = 'flex:1;padding:8px;background:#f59e0b22;border:1px solid #f59e0b66;border-radius:10px;color:#f59e0b;font-size:12px;font-weight:700;cursor:pointer';
        styleBtn.textContent = 'Estilo textual';

        const cloneBtn = document.createElement('button');
        cloneBtn.style.cssText = 'flex:1;padding:8px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;color:#888;font-size:12px;font-weight:700;cursor:pointer';
        cloneBtn.textContent = 'Clonar voz real';

        voiceToggle.appendChild(styleBtn);
        voiceToggle.appendChild(cloneBtn);
        voiceSection.appendChild(voiceToggle);

        // Panel estilo
        const stylePanel = document.createElement('div');
        stylePanel.style.cssText = 'display:flex;flex-direction:column;gap:8px';
        const styleInput = document.createElement('input');
        styleInput.placeholder = 'Ej: voz femenina, grave, sensual, con acento latino...';
        styleInput.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;outline:none;font-family:inherit';
        styleInput.addEventListener('input', () => { formData.voiceStyle = styleInput.value; });
        stylePanel.appendChild(Object.assign(document.createElement('p'), { style: 'color:#888;font-size:11px;margin:0', textContent: 'Describe la voz del artista en texto' }));
        stylePanel.appendChild(styleInput);

        // Panel clonar
        const clonePanel = document.createElement('div');
        clonePanel.style.cssText = 'display:none;flex-direction:column;gap:8px';
        clonePanel.innerHTML = `
            <p style="color:#888;font-size:11px;margin:0">Sube un audio de 10 segundos con la voz a clonar (MP3/WAV)</p>
            <input type="file" accept="audio/*" id="voice-file-input" style="display:none">
            <button id="voice-upload-btn" style="background:#1a1a1a;border:1px dashed #2a2a2a;border-radius:10px;padding:16px;color:#888;font-size:12px;cursor:pointer;width:100%;text-align:center">
                🎙 Seleccionar archivo de audio
            </button>
            <p id="voice-file-status" style="color:#555;font-size:11px;margin:0"></p>
        `;

        styleBtn.addEventListener('click', () => {
            voiceMode = 'style';
            styleBtn.style.cssText = 'flex:1;padding:8px;background:#f59e0b22;border:1px solid #f59e0b66;border-radius:10px;color:#f59e0b;font-size:12px;font-weight:700;cursor:pointer';
            cloneBtn.style.cssText = 'flex:1;padding:8px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;color:#888;font-size:12px;font-weight:700;cursor:pointer';
            stylePanel.style.display = 'flex';
            clonePanel.style.display = 'none';
        });

        cloneBtn.addEventListener('click', () => {
            voiceMode = 'clone';
            cloneBtn.style.cssText = 'flex:1;padding:8px;background:#f59e0b22;border:1px solid #f59e0b66;border-radius:10px;color:#f59e0b;font-size:12px;font-weight:700;cursor:pointer';
            styleBtn.style.cssText = 'flex:1;padding:8px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;color:#888;font-size:12px;font-weight:700;cursor:pointer';
            stylePanel.style.display = 'none';
            clonePanel.style.display = 'flex';
        });

        voiceSection.appendChild(stylePanel);
        voiceSection.appendChild(clonePanel);
        createArtistView.appendChild(voiceSection);

        // Manejar subida de voz
        let voiceFileUrl = null;
        setTimeout(() => {
            const vBtn = clonePanel.querySelector('#voice-upload-btn');
            const vInput = clonePanel.querySelector('#voice-file-input');
            const vStatus = clonePanel.querySelector('#voice-file-status');
            if (vBtn && vInput) {
                vBtn.addEventListener('click', () => vInput.click());
                vInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    vBtn.textContent = '⏳ Subiendo...';
                    try {
                        const token = await currentUser.getIdToken();
                        const fd = new FormData(); fd.append('file', file);
                        const resp = await fetch('/api/v1/upload_file', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
                        const data = await resp.json();
                        voiceFileUrl = data.url || data.file_url;
                        vBtn.textContent = `✓ ${file.name}`;
                        vBtn.style.borderColor = '#f59e0b66';
                        vBtn.style.color = '#f59e0b';
                        if (vStatus) vStatus.textContent = 'Audio listo para clonar';
                    } catch (err) {
                        vBtn.textContent = '🎙 Seleccionar archivo de audio';
                        if (vStatus) vStatus.textContent = `Error: ${err.message}`;
                    }
                });
            }
        }, 100);

        // Botón crear
        const createBtn = document.createElement('button');
        createBtn.style.cssText = 'width:100%;padding:14px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s;margin-bottom:40px';
        createBtn.textContent = 'Crear artista y generar fotos ✨';
        createBtn.addEventListener('mouseenter', () => createBtn.style.background = '#fbbf24');
        createBtn.addEventListener('mouseleave', () => createBtn.style.background = '#f59e0b');

        createBtn.addEventListener('click', async () => {
            if (!formData.name) return alert('El nombre del artista es obligatorio.');
            if (!currentUser) return alert('Debes iniciar sesión.');

            createBtn.disabled = true;
            createBtn.textContent = '⏳ Generando fotos...';

            try {
                const token = await currentUser.getIdToken();
                const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);
                const { isAdmin } = await checkCredits(userRef, MUSIC_COSTS['nano-banana-2']);

                // Construir prompt para foto de referencia de estudio
                const artistDesc = [
                    formData.gender && `${formData.gender}`,
                    formData.age && `de ${formData.age}`,
                    formData.ethnicity && `de origen ${formData.ethnicity}`,
                    formData.build && `complexión ${formData.build}`,
                    formData.outfit && `vestimenta ${formData.outfit}`,
                    formData.extra && formData.extra,
                ].filter(Boolean).join(', ');

                const studioPrompt = `Professional music artist reference sheet, white studio background, ${artistDesc}, ${formData.style || ''} aesthetic, multiple poses: front facing close-up portrait, three-quarter body, full body standing, side profile left, side profile right, sitting casual — all in the same white studio setting, high quality photography, 8K, editorial fashion magazine style`;

                const initRes = await callMuapi('nano-banana-2', { prompt: studioPrompt, aspect_ratio: '1:1' }, token);
                const rid = initRes.request_id || initRes.id;
                let refPhotoUrl = initRes.url || initRes.output?.outputs?.[0] || initRes.outputs?.[0];

                if (!refPhotoUrl && rid) {
                    createBtn.textContent = '⏳ Procesando fotos (1-2 min)...';
                    const result = await pollResult(rid, token, 60, 3000);
                    refPhotoUrl = result.url;
                }

                if (!refPhotoUrl) throw new Error('No se generó la foto de referencia.');

                // Clonar voz si eligió ese modo
                let voiceId = null;
                if (voiceMode === 'clone' && voiceFileUrl) {
                    createBtn.textContent = '⏳ Clonando voz...';
                    try {
                        const cloneRes = await callMuapi('suno-voice-clone', { audio_url: voiceFileUrl }, token);
                        voiceId = cloneRes.voice_id || cloneRes.id || null;
                    } catch (e) {
                        console.warn('Voice clone failed:', e.message);
                    }
                }

                // Guardar artista en Firebase
                const artistData = {
                    name:              formData.name,
                    genre:             formData.genre || '',
                    style:             formData.style || '',
                    ethnicity:         formData.ethnicity || '',
                    age:               formData.age || '',
                    gender:            formData.gender || '',
                    build:             formData.build || '',
                    outfit:            formData.outfit || '',
                    extra:             formData.extra || '',
                    voiceStyle:        voiceMode === 'style' ? (formData.voiceStyle || '') : '',
                    voiceId:           voiceId,
                    referencePhotoUrl: refPhotoUrl,
                    studioPrompt:      studioPrompt,
                    createdAt:         serverTimestamp()
                };

                const artistsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists');
                const docRef = await addDoc(artistsRef, artistData);

                await deductCredits(userRef, MUSIC_COSTS['nano-banana-2'], isAdmin);

                // Guardar foto en subcolección
                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', docRef.id, 'photos'), {
                    url: refPhotoUrl, scene: 'studio_reference', createdAt: serverTimestamp()
                });

                currentArtist = { id: docRef.id, ...artistData };
                artists.unshift(currentArtist);

                // Mostrar foto generada en preview y completar barra
                clearInterval(progressInterval);
                progressBar.style.width = '100%';
                progressIcon.textContent = '✅';
                progressLabel.textContent = '¡Artista creado con éxito!';
                previewContainer.innerHTML = `<img src="${refPhotoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:14px">`;
                previewContainer.style.border = '2px solid #f59e0b';

                await new Promise(r => setTimeout(r, 1500));
                progressView.remove();
                createArtistView.style.display = 'flex';

                renderArtistDashboard();
                showView('artistDashboard');

            } catch (err) {
                console.error(err);
                clearInterval(progressInterval);
                if (progressView.parentNode) progressView.remove();
                createArtistView.style.display = 'flex';
                alert(`Error: ${err.message}`);
                createBtn.disabled = false;
                createBtn.textContent = 'Crear artista y generar fotos ✨';
            }
        });

        createArtistView.appendChild(createBtn);
    }

    // ============================================================
    // VIEW: DASHBOARD DEL ARTISTA
    // ============================================================
    const artistDashboardView = document.createElement('div');
    artistDashboardView.style.cssText = 'flex:1;flex-direction:column;overflow:hidden;display:none';
    views.artistDashboard = artistDashboardView;
    root.appendChild(artistDashboardView);

    function renderArtistDashboard() {
        if (!currentArtist) return;
        artistDashboardView.innerHTML = '';

        // ── Header del artista ──
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:16px;padding:16px 24px;background:#111;border-bottom:1px solid #1f1f1f;flex-shrink:0';

        const backBtn = document.createElement('button');
        backBtn.style.cssText = 'background:none;border:none;color:#888;cursor:pointer;padding:4px;display:flex;align-items:center;gap:4px;font-size:12px';
        backBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`;
        backBtn.addEventListener('click', () => { renderArtistList(); showView('artistList'); });

        const artistThumb = document.createElement('div');
        artistThumb.style.cssText = 'width:48px;height:48px;border-radius:12px;overflow:hidden;background:#1a1a1a;flex-shrink:0;border:2px solid #f59e0b44';
        if (currentArtist.referencePhotoUrl) {
            artistThumb.innerHTML = `<img src="${currentArtist.referencePhotoUrl}" style="width:100%;height:100%;object-fit:cover">`;
        } else {
            artistThumb.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px">🎤</div>`;
        }

        const artistInfo = document.createElement('div');
        artistInfo.innerHTML = `
            <p style="color:#fff;font-size:16px;font-weight:900;margin:0">${currentArtist.name}</p>
            <p style="color:#555;font-size:12px;margin:2px 0 0">${currentArtist.genre || ''} ${currentArtist.style ? '· ' + currentArtist.style : ''}</p>
        `;

        // Tabs
        const tabs = ['🎵 Crear música', '📸 Fotos', '🎤 Voz'];
        let activeTab = 0;
        const tabBar = document.createElement('div');
        tabBar.style.cssText = 'display:flex;gap:4px;margin-left:auto';

        const tabPanels = [];
        tabs.forEach((tab, i) => {
            const tabBtn = document.createElement('button');
            tabBtn.style.cssText = `padding:6px 14px;border-radius:100px;font-size:12px;font-weight:700;cursor:pointer;border:none;transition:all .15s;${i === 0 ? 'background:#f59e0b;color:#000' : 'background:#1a1a1a;color:#888'}`;
            tabBtn.textContent = tab;
            tabBtn.addEventListener('click', () => {
                activeTab = i;
                tabBar.querySelectorAll('button').forEach((b, j) => {
                    b.style.background = j === i ? '#f59e0b' : '#1a1a1a';
                    b.style.color      = j === i ? '#000'    : '#888';
                });
                tabPanels.forEach((p, j) => { p.style.display = j === i ? 'flex' : 'none'; });
            });
            tabBar.appendChild(tabBtn);
        });

        header.appendChild(backBtn);
        header.appendChild(artistThumb);
        header.appendChild(artistInfo);
        header.appendChild(tabBar);
        artistDashboardView.appendChild(header);

        // ── Tab panels container ──
        const panelsContainer = document.createElement('div');
        panelsContainer.style.cssText = 'flex:1;overflow:hidden;position:relative';
        artistDashboardView.appendChild(panelsContainer);

        // ── TAB 0: Crear música ──
        const musicPanel = buildMusicPanel();
        musicPanel.style.display = 'flex';
        tabPanels.push(musicPanel);
        panelsContainer.appendChild(musicPanel);

        // ── TAB 1: Fotos ──
        const photosPanel = buildPhotosPanel();
        photosPanel.style.display = 'none';
        tabPanels.push(photosPanel);
        panelsContainer.appendChild(photosPanel);

        // ── TAB 2: Voz ──
        const voicePanel = buildVoicePanel();
        voicePanel.style.display = 'none';
        tabPanels.push(voicePanel);
        panelsContainer.appendChild(voicePanel);
    }

    // ============================================================
    // PANEL: CREAR MÚSICA
    // ============================================================
    function buildMusicPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'flex-direction:column;overflow-y:auto;padding:24px;gap:20px;height:100%';

        // Selector de herramienta
        const toolLabel = document.createElement('p');
        toolLabel.style.cssText = 'color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0';
        toolLabel.textContent = 'Herramienta';
        panel.appendChild(toolLabel);

        const tools = [
            { id: 'suno-create-music',      icon: '🎵', label: 'Crear canción',    desc: 'Genera una canción completa desde cero' },
            { id: 'suno-generate-lyrics',   icon: '✍️',  label: 'Generar letra',   desc: 'Genera letra para una canción' },
            { id: 'suno-extend-music',      icon: '➕', label: 'Extender canción', desc: 'Alarga una canción existente' },
            { id: 'suno-remix-music',       icon: '🔄', label: 'Remix',            desc: 'Transforma una canción a otro estilo' },
            { id: 'suno-add-vocals',        icon: '🎤', label: 'Añadir voces',     desc: 'Añade voces a una pista instrumental' },
            { id: 'suno-add-instrumental',  icon: '🎸', label: 'Añadir música',    desc: 'Añade instrumentales a una voz' },
            { id: 'suno-generate-mashup',   icon: '🎛️', label: 'Mashup',           desc: 'Mezcla varias canciones' },
            { id: 'suno-generate-sounds',   icon: '🔊', label: 'Efectos de sonido', desc: 'Genera efectos de sonido' },
        ];

        let selectedTool = 'suno-create-music';
        const toolGrid = document.createElement('div');
        toolGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px';

        const toolPanelContainer = document.createElement('div');

        tools.forEach(tool => {
            const card = document.createElement('div');
            const isActive = tool.id === selectedTool;
            card.style.cssText = `background:${isActive ? '#f59e0b22' : '#1a1a1a'};border:1px solid ${isActive ? '#f59e0b66' : '#2a2a2a'};border-radius:12px;padding:10px 12px;cursor:pointer;transition:all .15s`;
            card.innerHTML = `<div style="font-size:18px;margin-bottom:4px">${tool.icon}</div><div style="color:${isActive ? '#f59e0b' : '#fff'};font-size:12px;font-weight:700">${tool.label}</div><div style="color:#555;font-size:10px;margin-top:2px">${tool.desc}</div>`;
            card.addEventListener('click', () => {
                selectedTool = tool.id;
                toolGrid.querySelectorAll('div').forEach(c => {
                    c.style.background = '#1a1a1a'; c.style.borderColor = '#2a2a2a';
                    c.querySelector('div:nth-child(2)').style.color = '#fff';
                });
                card.style.background = '#f59e0b22'; card.style.borderColor = '#f59e0b66';
                card.querySelector('div:nth-child(2)').style.color = '#f59e0b';
                renderToolPanel(selectedTool, toolPanelContainer);
            });
            toolGrid.appendChild(card);
        });

        panel.appendChild(toolGrid);

        // Separador
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:#1f1f1f;flex-shrink:0';
        panel.appendChild(sep);

        panel.appendChild(toolPanelContainer);
        renderToolPanel(selectedTool, toolPanelContainer);

        // Historial de canciones
        const songsLabel = document.createElement('p');
        songsLabel.style.cssText = 'color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0';
        songsLabel.textContent = 'Canciones del artista';
        panel.appendChild(songsLabel);

        const songsGrid = document.createElement('div');
        songsGrid.id = 'songs-grid';
        songsGrid.style.cssText = 'display:flex;flex-direction:column;gap:8px';
        panel.appendChild(songsGrid);

        loadSongs(songsGrid);

        return panel;
    }

    function renderToolPanel(toolId, container) {
        container.innerHTML = '';
        container.style.cssText = 'display:flex;flex-direction:column;gap:14px';

        const cost = MUSIC_COSTS[toolId] || 20;

        // ── PANEL ESPECIAL PARA CREAR CANCIÓN ──
        if (toolId === 'suno-create-music') {
            // Título
            const titleWrap = document.createElement('div');
            titleWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
            const titleLbl = document.createElement('label');
            titleLbl.style.cssText = 'color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
            titleLbl.textContent = 'Título de la canción';
            const titleInput = document.createElement('input');
            titleInput.placeholder = `Ej: ${currentArtist?.name || 'Mi artista'} - Mi primera canción`;
            titleInput.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s';
            titleInput.addEventListener('focus', () => titleInput.style.borderColor = '#f59e0b66');
            titleInput.addEventListener('blur',  () => titleInput.style.borderColor = '#2a2a2a');
            titleWrap.appendChild(titleLbl);
            titleWrap.appendChild(titleInput);
            container.appendChild(titleWrap);
            container._titleInput = titleInput;

            // Estilo musical (auto del artista)
            const styleWrap = document.createElement('div');
            styleWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
            const styleLbl = document.createElement('label');
            styleLbl.style.cssText = 'color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
            styleLbl.textContent = 'Estilo musical';
            const styleInput = document.createElement('input');
            styleInput.value = [currentArtist?.genre, currentArtist?.style].filter(Boolean).join(', ');
            styleInput.placeholder = 'Ej: Reggaeton, urbano, trap, melódico...';
            styleInput.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s';
            styleInput.addEventListener('focus', () => styleInput.style.borderColor = '#f59e0b66');
            styleInput.addEventListener('blur',  () => styleInput.style.borderColor = '#2a2a2a');
            styleWrap.appendChild(styleLbl);
            styleWrap.appendChild(styleInput);
            container.appendChild(styleWrap);
            container._styleInput = styleInput;

            // ── SECCIÓN DE LETRA ──
            const lyricsSection = document.createElement('div');
            lyricsSection.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px';

            const lyricsHeader = document.createElement('div');
            lyricsHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
            lyricsHeader.innerHTML = '<p style="color:#fff;font-size:13px;font-weight:700;margin:0">✍️ Letra de la canción</p>';

            // Toggle manual / generar
            let lyricsMode = 'manual';
            const lyricsToggle = document.createElement('div');
            lyricsToggle.style.cssText = 'display:flex;gap:4px';

            const manualBtn = document.createElement('button');
            manualBtn.style.cssText = 'padding:4px 10px;background:#f59e0b22;border:1px solid #f59e0b66;border-radius:8px;color:#f59e0b;font-size:11px;font-weight:700;cursor:pointer';
            manualBtn.textContent = 'Escribir';

            const generateLyricsBtn = document.createElement('button');
            generateLyricsBtn.style.cssText = 'padding:4px 10px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#888;font-size:11px;font-weight:700;cursor:pointer';
            generateLyricsBtn.textContent = '✨ Generar con IA';

            lyricsToggle.appendChild(manualBtn);
            lyricsToggle.appendChild(generateLyricsBtn);
            lyricsHeader.appendChild(lyricsToggle);
            lyricsSection.appendChild(lyricsHeader);

            // Panel manual
            const manualPanel = document.createElement('div');
            manualPanel.style.cssText = 'display:flex;flex-direction:column;gap:6px';
            const lyricsTextarea = document.createElement('textarea');
            lyricsTextarea.rows = 6;
            lyricsTextarea.placeholder = 'Escribe la letra aquí...\n\n[Verso 1]\n...\n\n[Coro]\n...';
            lyricsTextarea.style.cssText = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 14px;color:#fff;font-size:12px;outline:none;font-family:monospace;resize:vertical;line-height:1.6;transition:border-color .15s';
            lyricsTextarea.addEventListener('focus', () => lyricsTextarea.style.borderColor = '#f59e0b66');
            lyricsTextarea.addEventListener('blur',  () => lyricsTextarea.style.borderColor = '#2a2a2a');
            manualPanel.appendChild(lyricsTextarea);
            lyricsSection.appendChild(manualPanel);
            container._lyricsTextarea = lyricsTextarea;

            // Panel generar letra con IA
            const aiLyricsPanel = document.createElement('div');
            aiLyricsPanel.style.cssText = 'display:none;flex-direction:column;gap:8px';

            const aiLyricsTheme = document.createElement('input');
            aiLyricsTheme.placeholder = 'Tema de la letra: amor, desamor, fiesta, éxito, calle...';
            aiLyricsTheme.style.cssText = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s';
            aiLyricsTheme.addEventListener('focus', () => aiLyricsTheme.style.borderColor = '#f59e0b66');
            aiLyricsTheme.addEventListener('blur',  () => aiLyricsTheme.style.borderColor = '#2a2a2a');

            const genLyricsActionBtn = document.createElement('button');
            genLyricsActionBtn.style.cssText = 'padding:9px 18px;background:#3b82f6;border:none;border-radius:100px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;width:fit-content;display:flex;align-items:center;gap:6px';
            genLyricsActionBtn.innerHTML = '✨ Generar letra <span style="background:rgba(255,255,255,.2);padding:1px 6px;border-radius:100px;font-size:10px;font-family:monospace">1 🪙</span>';

            genLyricsActionBtn.addEventListener('click', async () => {
                if (!aiLyricsTheme.value.trim()) return alert('Escribe el tema de la letra.');
                genLyricsActionBtn.textContent = '⏳ Generando...';
                genLyricsActionBtn.disabled = true;
                try {
                    const token = await currentUser.getIdToken();
                    const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);
                    const { isAdmin } = await checkCredits(userRef, MUSIC_COSTS['suno-generate-lyrics']);

                    // Usar gpt-5-mini para generar letra estructurada
                    const lyricsPrompt = `Write song lyrics for a ${currentArtist?.genre || 'pop'} song by artist ${currentArtist?.name || 'the artist'}. Theme: ${aiLyricsTheme.value}. Style: ${currentArtist?.style || ''}. Include [Verse 1], [Chorus], [Verse 2], [Chorus], [Bridge], [Outro]. Write in Spanish. Make it catchy and authentic.`;
                    const res = await callMuapi('gpt-5-mini', { prompt: lyricsPrompt }, token);
                    const rid = res.request_id || res.id;
                    let lyricsText = res.text || res.output?.text || res.result;

                    if (!lyricsText && rid) {
                        const polled = await pollResult(rid, token, 30, 2000);
                        lyricsText = polled.data?.text || polled.data?.result || polled.url;
                    }

                    if (lyricsText) {
                        lyricsTextarea.value = lyricsText;
                        await deductCredits(userRef, MUSIC_COSTS['suno-generate-lyrics'], isAdmin);
                        // Cambiar a panel manual para que pueda editarla
                        lyricsMode = 'manual';
                        manualBtn.style.cssText = 'padding:4px 10px;background:#f59e0b22;border:1px solid #f59e0b66;border-radius:8px;color:#f59e0b;font-size:11px;font-weight:700;cursor:pointer';
                        generateLyricsBtn.style.cssText = 'padding:4px 10px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#888;font-size:11px;font-weight:700;cursor:pointer';
                        manualPanel.style.display = 'flex';
                        aiLyricsPanel.style.display = 'none';
                    }
                } catch (err) {
                    alert('Error generando letra: ' + err.message);
                } finally {
                    genLyricsActionBtn.innerHTML = '✨ Generar letra <span style="background:rgba(255,255,255,.2);padding:1px 6px;border-radius:100px;font-size:10px;font-family:monospace">1 🪙</span>';
                    genLyricsActionBtn.disabled = false;
                }
            });

            aiLyricsPanel.appendChild(aiLyricsTheme);
            aiLyricsPanel.appendChild(genLyricsActionBtn);
            lyricsSection.appendChild(aiLyricsPanel);
            container.appendChild(lyricsSection);

            // Toggle entre manual y IA
            manualBtn.addEventListener('click', () => {
                lyricsMode = 'manual';
                manualBtn.style.cssText = 'padding:4px 10px;background:#f59e0b22;border:1px solid #f59e0b66;border-radius:8px;color:#f59e0b;font-size:11px;font-weight:700;cursor:pointer';
                generateLyricsBtn.style.cssText = 'padding:4px 10px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#888;font-size:11px;font-weight:700;cursor:pointer';
                manualPanel.style.display = 'flex';
                aiLyricsPanel.style.display = 'none';
            });
            generateLyricsBtn.addEventListener('click', () => {
                lyricsMode = 'ai';
                generateLyricsBtn.style.cssText = 'padding:4px 10px;background:#f59e0b22;border:1px solid #f59e0b66;border-radius:8px;color:#f59e0b;font-size:11px;font-weight:700;cursor:pointer';
                manualBtn.style.cssText = 'padding:4px 10px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#888;font-size:11px;font-weight:700;cursor:pointer';
                aiLyricsPanel.style.display = 'flex';
                manualPanel.style.display = 'none';
            });

            // ── TIPO: INSTRUMENTAL O CON VOZ ──
            const voiceTypeSection = document.createElement('div');
            voiceTypeSection.style.cssText = 'display:flex;flex-direction:column;gap:8px';
            const voiceTypeLbl = document.createElement('p');
            voiceTypeLbl.style.cssText = 'color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0';
            voiceTypeLbl.textContent = 'Tipo de canción';
            voiceTypeSection.appendChild(voiceTypeLbl);

            let songType = 'vocals'; // 'vocals' | 'instrumental'
            const typeRow = document.createElement('div');
            typeRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px';

            const vocalsCard = document.createElement('div');
            vocalsCard.style.cssText = 'background:#f59e0b22;border:2px solid #f59e0b66;border-radius:12px;padding:12px;cursor:pointer;text-align:center';
            vocalsCard.innerHTML = '<div style="font-size:20px;margin-bottom:4px">🎤</div><div style="color:#f59e0b;font-size:12px;font-weight:700">Con voz</div><div style="color:#f59e0b88;font-size:10px">Canta el artista</div>';

            const instrumentalCard = document.createElement('div');
            instrumentalCard.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:12px;cursor:pointer;text-align:center';
            instrumentalCard.innerHTML = '<div style="font-size:20px;margin-bottom:4px">🎸</div><div style="color:#888;font-size:12px;font-weight:700">Instrumental</div><div style="color:#555;font-size:10px">Solo música</div>';

            vocalsCard.addEventListener('click', () => {
                songType = 'vocals';
                vocalsCard.style.cssText = 'background:#f59e0b22;border:2px solid #f59e0b66;border-radius:12px;padding:12px;cursor:pointer;text-align:center';
                instrumentalCard.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:12px;cursor:pointer;text-align:center';
                vocalsCard.querySelector('div:nth-child(2)').style.color = '#f59e0b';
                instrumentalCard.querySelector('div:nth-child(2)').style.color = '#888';
                lyricsSection.style.opacity = '1'; lyricsSection.style.pointerEvents = 'auto';
            });
            instrumentalCard.addEventListener('click', () => {
                songType = 'instrumental';
                instrumentalCard.style.cssText = 'background:#f59e0b22;border:2px solid #f59e0b66;border-radius:12px;padding:12px;cursor:pointer;text-align:center';
                vocalsCard.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:12px;cursor:pointer;text-align:center';
                instrumentalCard.querySelector('div:nth-child(2)').style.color = '#f59e0b';
                vocalsCard.querySelector('div:nth-child(2)').style.color = '#888';
                lyricsSection.style.opacity = '.3'; lyricsSection.style.pointerEvents = 'none';
            });

            typeRow.appendChild(vocalsCard);
            typeRow.appendChild(instrumentalCard);
            voiceTypeSection.appendChild(typeRow);
            container.appendChild(voiceTypeSection);
            container._getSongType = () => songType;

            // Voz del artista
            if (currentArtist?.voiceId || currentArtist?.voiceStyle) {
                const voiceInfo = document.createElement('div');
                voiceInfo.style.cssText = 'background:#f59e0b11;border:1px solid #f59e0b33;border-radius:10px;padding:10px 14px;font-size:12px;color:#f59e0b';
                voiceInfo.innerHTML = currentArtist.voiceId
                    ? `🎤 Se usará la voz clonada de <strong>${currentArtist.name}</strong>`
                    : `🎤 Estilo vocal: "${currentArtist.voiceStyle}"`;
                container.appendChild(voiceInfo);
            }

            // Botón generar
            const genBtn = document.createElement('button');
            genBtn.style.cssText = 'width:100%;padding:13px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px';
            genBtn.innerHTML = `Crear canción <span style="background:rgba(0,0,0,.2);padding:2px 8px;border-radius:100px;font-size:11px;font-family:monospace">${cost} 🪙</span>`;

            genBtn.addEventListener('click', async () => {
                const style   = container._styleInput?.value?.trim();
                const title   = container._titleInput?.value?.trim();
                const lyrics  = container._lyricsTextarea?.value?.trim();
                const isInstrumental = container._getSongType?.() === 'instrumental';

                if (!style && !lyrics) return alert('Escribe el estilo musical o la letra.');
                if (!currentUser) return alert('Debes iniciar sesión.');

                genBtn.disabled = true;
                genBtn.innerHTML = '<div style="width:16px;height:16px;border:2px solid #00000033;border-top-color:#000;border-radius:50%;animation:spin 1s linear infinite"></div> Creando canción...';

                try {
                    const token = await currentUser.getIdToken();
                    const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);
                    const { isAdmin } = await checkCredits(userRef, cost);

                    const params = {
                        style:          style || `${currentArtist?.genre || ''} ${currentArtist?.style || ''}`.trim(),
                        title:          title || `${currentArtist?.name || 'Canción'} - Sin título`,
                        instrumental:   isInstrumental,
                    };
                    if (!isInstrumental && lyrics)          params.lyrics   = lyrics;
                    if (!isInstrumental && currentArtist?.voiceId) params.voice_id = currentArtist.voiceId;
                    if (!isInstrumental && currentArtist?.voiceStyle && !currentArtist?.voiceId) {
                        params.style = `${params.style}, ${currentArtist.voiceStyle}`;
                    }

                    const res = await callMuapi('suno-create-music', params, token);
                    const rid = res.request_id || res.id;
                    let resultUrl = res.url || res.audio_url || res.output?.outputs?.[0] || res.outputs?.[0];

                    if (!resultUrl && rid) {
                        genBtn.innerHTML = '<div style="width:16px;height:16px;border:2px solid #00000033;border-top-color:#000;border-radius:50%;animation:spin 1s linear infinite"></div> Procesando canción...';
                        const polled = await pollResult(rid, token, 90, 3000);
                        resultUrl = polled.url;
                    }

                    await deductCredits(userRef, cost, isAdmin);

                    const songData = {
                        title:     params.title,
                        style:     params.style,
                        lyrics:    lyrics || null,
                        tool:      'suno-create-music',
                        url:       resultUrl || null,
                        instrumental: isInstrumental,
                        artistId:  currentArtist.id,
                        createdAt: serverTimestamp()
                    };
                    await addDoc(
                        collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'songs'),
                        songData
                    );

                    if (resultUrl) showSongResult(resultUrl, params.title, container);
                    const sg = document.querySelector('#songs-grid');
                    if (sg) loadSongs(sg);

                } catch (err) {
                    console.error(err);
                    alert(`Error: ${err.message}`);
                } finally {
                    genBtn.disabled = false;
                    genBtn.innerHTML = `Crear canción <span style="background:rgba(0,0,0,.2);padding:2px 8px;border-radius:100px;font-size:11px;font-family:monospace">${cost} 🪙</span>`;
                }
            });

            container.appendChild(genBtn);
            return; // Salimos aquí para no ejecutar el panel genérico
        }

        // ── PANEL GENÉRICO para el resto de herramientas ──
        const promptWrap = document.createElement('div');
        promptWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';

        const promptLabels = {
            'suno-generate-lyrics':  'Tema de la letra',
            'suno-extend-music':     'Instrucciones para extender (opcional)',
            'suno-remix-music':      'Nuevo estilo del remix',
            'suno-add-vocals':       'Estilo vocal deseado',
            'suno-add-instrumental': 'Descripción del instrumental',
            'suno-generate-mashup':  'Descripción del mashup',
            'suno-generate-sounds':  'Describe el efecto de sonido',
        };

        const promptLabel = document.createElement('label');
        promptLabel.style.cssText = 'color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
        promptLabel.textContent = promptLabels[toolId] || 'Prompt';
        promptWrap.appendChild(promptLabel);

        const promptInput = document.createElement('textarea');
        promptInput.rows = 3;
        promptInput.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;outline:none;font-family:inherit;resize:none;transition:border-color .15s';
        promptInput.placeholder = promptLabels[toolId] || '';

        if (currentArtist?.style || currentArtist?.genre) {
            promptInput.value = `Estilo ${currentArtist.genre || ''} ${currentArtist.style || ''}`.trim();
        }

        promptInput.addEventListener('focus', () => promptInput.style.borderColor = '#f59e0b66');
        promptInput.addEventListener('blur',  () => promptInput.style.borderColor = '#2a2a2a');
        promptWrap.appendChild(promptInput);
        container.appendChild(promptWrap);

        // Upload de audio (para herramientas que lo requieren)
        const needsAudio = ['suno-extend-music','suno-remix-music','suno-add-vocals','suno-add-instrumental','suno-generate-mashup'];
        if (needsAudio.includes(toolId)) {
            const audioWrap = document.createElement('div');
            audioWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
            const audioLbl = document.createElement('label');
            audioLbl.style.cssText = 'color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
            audioLbl.textContent = toolId === 'suno-generate-mashup' ? 'Archivos de audio (hasta 5)' : 'Archivo de audio';
            audioWrap.appendChild(audioLbl);

            const audioInput = document.createElement('input');
            audioInput.type = 'file';
            audioInput.accept = 'audio/*';
            if (toolId === 'suno-generate-mashup') audioInput.multiple = true;
            audioInput.style.display = 'none';

            const audioBtn = document.createElement('button');
            audioBtn.style.cssText = 'background:#1a1a1a;border:1px dashed #2a2a2a;border-radius:10px;padding:14px;color:#888;font-size:12px;cursor:pointer;width:100%;text-align:center;transition:border-color .15s';
            audioBtn.textContent = '🎵 Seleccionar audio';
            audioBtn.addEventListener('click', () => audioInput.click());

            let audioUrls = [];
            audioInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files).slice(0, 5);
                audioBtn.textContent = '⏳ Subiendo...';
                try {
                    const token = await currentUser.getIdToken();
                    audioUrls = await Promise.all(files.map(async file => {
                        const fd = new FormData(); fd.append('file', file);
                        const resp = await fetch('/api/v1/upload_file', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
                        const data = await resp.json();
                        return data.url || data.file_url;
                    }));
                    audioBtn.textContent = `✓ ${files.map(f => f.name).join(', ').slice(0, 50)}`;
                    audioBtn.style.borderColor = '#f59e0b66';
                    audioBtn.style.color = '#f59e0b';
                } catch (err) {
                    audioBtn.textContent = '🎵 Seleccionar audio';
                    alert(`Error subiendo audio: ${err.message}`);
                }
            });

            audioWrap.appendChild(audioBtn);
            audioWrap.appendChild(audioInput);
            container.appendChild(audioWrap);
            container._audioUrls = () => audioUrls;
        }

        // Voz del artista info
        if ((toolId === 'suno-create-music' || toolId === 'suno-add-vocals') && (currentArtist?.voiceId || currentArtist?.voiceStyle)) {
            const voiceInfo = document.createElement('div');
            voiceInfo.style.cssText = 'background:#f59e0b11;border:1px solid #f59e0b33;border-radius:10px;padding:10px 14px;font-size:12px;color:#f59e0b';
            voiceInfo.innerHTML = currentArtist.voiceId
                ? `🎤 Se usará la voz clonada de <strong>${currentArtist.name}</strong>`
                : `🎤 Estilo vocal: "${currentArtist.voiceStyle}"`;
            container.appendChild(voiceInfo);
        }

        // Botón generar
        const genBtn = document.createElement('button');
        genBtn.style.cssText = 'width:100%;padding:13px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px';
        genBtn.innerHTML = `Generar <span style="background:rgba(0,0,0,.2);padding:2px 8px;border-radius:100px;font-size:11px;font-family:monospace">${cost} 🪙</span>`;

        genBtn.addEventListener('click', async () => {
            const prompt = promptInput.value.trim();
            if (!prompt) return alert('Escribe un prompt primero.');
            if (!currentUser) return alert('Debes iniciar sesión.');

            genBtn.disabled = true;
            genBtn.innerHTML = `<div style="width:16px;height:16px;border:2px solid #00000033;border-top-color:#000;border-radius:50%;animation:spin 1s linear infinite"></div> Generando...`;

            try {
                const token = await currentUser.getIdToken();
                const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);
                const { isAdmin } = await checkCredits(userRef, cost);

                // Construir params según herramienta
                let params = { prompt };

                // Añadir contexto del artista al prompt
                const artistContext = [
                    currentArtist.genre && `genre: ${currentArtist.genre}`,
                    currentArtist.style && `style: ${currentArtist.style}`,
                    currentArtist.voiceStyle && `voice style: ${currentArtist.voiceStyle}`,
                ].filter(Boolean).join(', ');

                if (artistContext && toolId === 'suno-create-music') {
                    params.style = artistContext;
                    if (currentArtist.voiceId) params.voice_id = currentArtist.voiceId;
                    if (container._titleInput?.value) params.title = container._titleInput.value;
                }

                if (toolId === 'suno-generate-lyrics') {
                    params.topic = prompt;
                    delete params.prompt;
                }

                const audioUrls = container._audioUrls ? container._audioUrls() : [];
                if (audioUrls.length > 0) {
                    if (toolId === 'suno-generate-mashup') params.audio_urls = audioUrls;
                    else params.audio_url = audioUrls[0];
                }

                // Llamada API
                const res = await callMuapi(toolId, params, token);
                const rid = res.request_id || res.id;
                let resultUrl = res.url || res.audio_url || res.output?.outputs?.[0] || res.outputs?.[0];
                let resultText = res.text || res.lyrics || res.output?.text;

                if (!resultUrl && !resultText && rid) {
                    genBtn.innerHTML = `<div style="width:16px;height:16px;border:2px solid #00000033;border-top-color:#000;border-radius:50%;animation:spin 1s linear infinite"></div> Procesando...`;
                    const polled = await pollResult(rid, token, 90, 3000);
                    resultUrl  = polled.url;
                    resultText = polled.data?.text || polled.data?.lyrics;
                }

                await deductCredits(userRef, cost, isAdmin);

                // Guardar en Firebase
                const songData = {
                    title:     container._titleInput?.value || prompt.slice(0, 40),
                    prompt,
                    tool:      toolId,
                    url:       resultUrl || null,
                    lyrics:    resultText || null,
                    artistId:  currentArtist.id,
                    createdAt: serverTimestamp()
                };
                await addDoc(
                    collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'songs'),
                    songData
                );

                // Mostrar resultado
                if (resultText && !resultUrl) {
                    // Solo texto (lyrics, boost)
                    const textResult = document.createElement('div');
                    textResult.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:16px;color:#fff;font-size:13px;line-height:1.6;white-space:pre-wrap;animation:fadeUp .3s ease';
                    textResult.textContent = resultText;
                    container.appendChild(textResult);
                } else if (resultUrl) {
                    showSongResult(resultUrl, songData.title, container);
                }

                // Recargar lista de canciones
                const sg = document.querySelector('#songs-grid');
                if (sg) loadSongs(sg);

            } catch (err) {
                console.error(err);
                alert(`Error: ${err.message}`);
            } finally {
                genBtn.disabled = false;
                genBtn.innerHTML = `Generar <span style="background:rgba(0,0,0,.2);padding:2px 8px;border-radius:100px;font-size:11px;font-family:monospace">${cost} 🪙</span>`;
            }
        });

        container.appendChild(genBtn);
    }

    function showSongResult(url, title, container) {
        const resultCard = document.createElement('div');
        resultCard.style.cssText = 'background:#1a1a1a;border:1px solid #f59e0b44;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;animation:fadeUp .3s ease';
        resultCard.innerHTML = `
            <p style="color:#f59e0b;font-size:13px;font-weight:700;margin:0">✓ ${title || 'Resultado generado'}</p>
            <audio controls src="${url}" style="width:100%;border-radius:8px;accent-color:#f59e0b"></audio>
        `;
        const dlBtn = document.createElement('button');
        dlBtn.style.cssText = 'background:#f59e0b;border:none;border-radius:100px;padding:8px 20px;color:#000;font-size:12px;font-weight:700;cursor:pointer;width:fit-content';
        dlBtn.textContent = '↓ Descargar';
        dlBtn.addEventListener('click', async () => {
            try {
                const blob = await fetch(url).then(r => r.blob());
                const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${title || 'kreatemusic'}.mp3` });
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
            } catch { window.open(url, '_blank'); }
        });
        resultCard.appendChild(dlBtn);
        container.insertBefore(resultCard, container.querySelector('button[style*="f59e0b"]') || container.lastChild);
    }

    async function loadSongs(container) {
        if (!currentArtist || !currentUser) return;
        container.innerHTML = '';
        try {
            const q    = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'songs'), orderBy('createdAt', 'desc'), limit(20));
            const snap = await getDocs(q);
            if (snap.empty) {
                container.innerHTML = `<p style="color:#555;font-size:12px;text-align:center;padding:16px">Sin canciones aún. ¡Crea la primera!</p>`;
                return;
            }
            snap.forEach(d => {
                const song = { id: d.id, ...d.data() };
                const card = document.createElement('div');
                card.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:12px 16px;display:flex;flex-direction:column;gap:8px;animation:fadeUp .3s ease';
                card.innerHTML = `<p style="color:#fff;font-size:13px;font-weight:700;margin:0">${song.title || song.prompt?.slice(0,40) || 'Canción'}</p>`;
                if (song.url) {
                    const audio = document.createElement('audio');
                    audio.controls = true;
                    audio.src = song.url;
                    audio.style.cssText = 'width:100%;accent-color:#f59e0b;border-radius:8px';
                    card.appendChild(audio);
                }
                if (song.lyrics) {
                    const lyr = document.createElement('pre');
                    lyr.style.cssText = 'color:#888;font-size:11px;white-space:pre-wrap;margin:0;max-height:80px;overflow:hidden;font-family:inherit';
                    lyr.textContent = song.lyrics.slice(0, 200) + (song.lyrics.length > 200 ? '...' : '');
                    card.appendChild(lyr);
                }
                container.appendChild(card);
            });
        } catch (e) { console.error('[KreateMusic] loadSongs:', e); }
    }

    // ============================================================
    // PANEL: FOTOS
    // ============================================================
    function buildPhotosPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'flex-direction:column;overflow-y:auto;padding:24px;gap:16px;height:100%';

        const desc = document.createElement('p');
        desc.style.cssText = 'color:#888;font-size:13px;margin:0';
        desc.textContent = 'Genera nuevas fotos del artista manteniendo consistencia de rostro y complexión.';
        panel.appendChild(desc);

        const SCENES = [
            { id: 'studio',   label: '🎙 Estudio de grabación', prompt: 'in a professional recording studio with microphone and mixing board, cinematic lighting' },
            { id: 'show',     label: '🎤 Show / Concierto',     prompt: 'on stage performing at a concert, crowd in background, dramatic stage lighting' },
            { id: 'social',   label: '📱 Redes sociales',       prompt: 'casual social media photo, selfie style, natural lighting, lifestyle' },
            { id: 'fashion',  label: '👗 Sesión de moda',       prompt: 'high fashion editorial photoshoot, luxury setting, professional photographer' },
            { id: 'street',   label: '🏙 Urbano / Calle',       prompt: 'urban street photography, city background, golden hour lighting, natural' },
            { id: 'coffee',   label: '☕ Cafetería / Casual',   prompt: 'sitting at a cafe, casual relaxed vibe, warm coffee shop lighting' },
            { id: 'custom',   label: '✏️ Personalizado',        prompt: '' },
        ];

        let selectedScene = SCENES[0];
        const sceneLabel = document.createElement('p');
        sceneLabel.style.cssText = 'color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0';
        sceneLabel.textContent = 'Escenario';
        panel.appendChild(sceneLabel);

        const sceneGrid = document.createElement('div');
        sceneGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px';

        SCENES.forEach(scene => {
            const card = document.createElement('div');
            const isActive = scene.id === selectedScene.id;
            card.style.cssText = `background:${isActive ? '#f59e0b22' : '#1a1a1a'};border:1px solid ${isActive ? '#f59e0b66' : '#2a2a2a'};border-radius:10px;padding:10px;cursor:pointer;font-size:12px;color:${isActive ? '#f59e0b' : '#888'};font-weight:700;transition:all .15s`;
            card.textContent = scene.label;
            card.addEventListener('click', () => {
                selectedScene = scene;
                sceneGrid.querySelectorAll('div').forEach(c => {
                    c.style.background = '#1a1a1a'; c.style.borderColor = '#2a2a2a'; c.style.color = '#888';
                });
                card.style.background = '#f59e0b22'; card.style.borderColor = '#f59e0b66'; card.style.color = '#f59e0b';
                customInput.style.display = scene.id === 'custom' ? 'block' : 'none';
            });
            sceneGrid.appendChild(card);
        });
        panel.appendChild(sceneGrid);

        const customInput = document.createElement('input');
        customInput.placeholder = 'Describe el escenario personalizado...';
        customInput.style.cssText = 'display:none;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;outline:none;font-family:inherit;width:100%';
        panel.appendChild(customInput);

        // Fotos existentes
        const photosLabel = document.createElement('p');
        photosLabel.style.cssText = 'color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0';
        photosLabel.textContent = 'Fotos generadas';
        panel.appendChild(photosLabel);

        const photosGrid = document.createElement('div');
        photosGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px';
        panel.appendChild(photosGrid);
        loadPhotos(photosGrid);

        // Botón generar foto
        const genPhotoBtn = document.createElement('button');
        genPhotoBtn.style.cssText = 'width:100%;padding:13px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:14px;font-weight:700;cursor:pointer;flex-shrink:0;margin-top:auto';
        genPhotoBtn.innerHTML = `Generar foto <span style="background:rgba(0,0,0,.2);padding:2px 8px;border-radius:100px;font-size:11px;font-family:monospace">${MUSIC_COSTS['nano-banana-2-edit']} 🪙</span>`;

        genPhotoBtn.addEventListener('click', async () => {
            if (!currentArtist?.referencePhotoUrl) return alert('El artista no tiene foto de referencia.');
            if (!currentUser) return alert('Debes iniciar sesión.');

            genPhotoBtn.disabled = true;
            genPhotoBtn.textContent = '⏳ Generando...';

            try {
                const token = await currentUser.getIdToken();
                const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);
                const { isAdmin } = await checkCredits(userRef, MUSIC_COSTS['nano-banana-2-edit']);

                const scenePrompt = selectedScene.id === 'custom' ? customInput.value : selectedScene.prompt;
                const editPrompt = `Same person as in the reference image, ${scenePrompt}, maintain exact facial features, body, hair, skin tone — only change the scene and background. Professional photography, 8K quality.`;

                const res = await callMuapi('nano-banana-2-edit', {
                    prompt: editPrompt,
                    images_list: [currentArtist.referencePhotoUrl],
                    aspect_ratio: '1:1'
                }, token);

                const rid = res.request_id || res.id;
                let photoUrl = res.url || res.output?.outputs?.[0] || res.outputs?.[0];

                if (!photoUrl && rid) {
                    genPhotoBtn.textContent = '⏳ Procesando...';
                    const result = await pollResult(rid, token, 60, 3000);
                    photoUrl = result.url;
                }

                if (!photoUrl) throw new Error('No se generó la foto.');

                await deductCredits(userRef, MUSIC_COSTS['nano-banana-2-edit'], isAdmin);

                await addDoc(
                    collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'photos'),
                    { url: photoUrl, scene: selectedScene.id, createdAt: serverTimestamp() }
                );

                // Añadir a la grid
                addPhotoCard(photoUrl, photosGrid);

            } catch (err) {
                console.error(err);
                alert(`Error: ${err.message}`);
            } finally {
                genPhotoBtn.disabled = false;
                genPhotoBtn.innerHTML = `Generar foto <span style="background:rgba(0,0,0,.2);padding:2px 8px;border-radius:100px;font-size:11px;font-family:monospace">${MUSIC_COSTS['nano-banana-2-edit']} 🪙</span>`;
            }
        });

        panel.appendChild(genPhotoBtn);
        return panel;
    }

    function addPhotoCard(url, grid) {
        const card = document.createElement('div');
        card.style.cssText = 'aspect-ratio:1;border-radius:12px;overflow:hidden;background:#1a1a1a;border:1px solid #2a2a2a;cursor:pointer;animation:fadeUp .3s ease;position:relative;group';
        card.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover">`;
        card.addEventListener('click', () => window.open(url, '_blank'));
        grid.prepend(card);
    }

    async function loadPhotos(grid) {
        if (!currentArtist || !currentUser) return;
        try {
            const q    = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'photos'), orderBy('createdAt', 'desc'), limit(30));
            const snap = await getDocs(q);
            snap.forEach(d => addPhotoCard(d.data().url, grid));
        } catch (e) { console.error('[KreateMusic] loadPhotos:', e); }
    }

    // ============================================================
    // PANEL: VOZ
    // ============================================================
    function buildVoicePanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'flex-direction:column;overflow-y:auto;padding:24px;gap:16px;height:100%';

        const info = document.createElement('div');
        info.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px';

        const currentVoice = document.createElement('div');
        currentVoice.innerHTML = `
            <p style="color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px">Configuración actual</p>
            ${currentArtist?.voiceId
                ? `<div style="background:#f59e0b11;border:1px solid #f59e0b33;border-radius:10px;padding:10px 14px;color:#f59e0b;font-size:13px">🎤 Voz clonada activa — ID: <code style="font-size:11px">${currentArtist.voiceId}</code></div>`
                : currentArtist?.voiceStyle
                    ? `<div style="background:#3b82f611;border:1px solid #3b82f633;border-radius:10px;padding:10px 14px;color:#60a5fa;font-size:13px">🎵 Estilo vocal: "${currentArtist.voiceStyle}"</div>`
                    : `<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 14px;color:#555;font-size:13px">Sin configuración de voz</div>`
            }
        `;
        info.appendChild(currentVoice);

        // Actualizar estilo vocal
        const styleSection = document.createElement('div');
        styleSection.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:8px';
        const styleLbl = document.createElement('p');
        styleLbl.style.cssText = 'color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0';
        styleLbl.textContent = 'Actualizar estilo vocal';
        const styleInput = document.createElement('input');
        styleInput.value = currentArtist?.voiceStyle || '';
        styleInput.placeholder = 'Ej: voz masculina, profunda, con acento caribeño...';
        styleInput.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;outline:none;font-family:inherit';
        const saveStyleBtn = document.createElement('button');
        saveStyleBtn.style.cssText = 'padding:8px 20px;background:#3b82f6;border:none;border-radius:100px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;width:fit-content';
        saveStyleBtn.textContent = 'Guardar estilo';
        saveStyleBtn.addEventListener('click', async () => {
            if (!currentUser || !currentArtist) return;
            try {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id), { voiceStyle: styleInput.value });
                currentArtist.voiceStyle = styleInput.value;
                saveStyleBtn.textContent = '✓ Guardado';
                setTimeout(() => { saveStyleBtn.textContent = 'Guardar estilo'; }, 2000);
            } catch (e) { alert('Error: ' + e.message); }
        });
        styleSection.appendChild(styleLbl);
        styleSection.appendChild(styleInput);
        styleSection.appendChild(saveStyleBtn);
        info.appendChild(styleSection);

        // Clonar nueva voz
        const cloneSection = document.createElement('div');
        cloneSection.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:8px;padding-top:16px;border-top:1px solid #1f1f1f';
        cloneSection.innerHTML = `<p style="color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0">Clonar nueva voz (10 segundos)</p>`;

        const voiceFileInput = document.createElement('input');
        voiceFileInput.type = 'file'; voiceFileInput.accept = 'audio/*'; voiceFileInput.style.display = 'none';
        let voiceFileUrl = null;

        const voiceUploadBtn = document.createElement('button');
        voiceUploadBtn.style.cssText = 'background:#1a1a1a;border:1px dashed #2a2a2a;border-radius:10px;padding:14px;color:#888;font-size:12px;cursor:pointer;width:100%;text-align:center';
        voiceUploadBtn.textContent = '🎙 Seleccionar audio de 10s';
        voiceUploadBtn.addEventListener('click', () => voiceFileInput.click());
        voiceFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0]; if (!file) return;
            voiceUploadBtn.textContent = '⏳ Subiendo...';
            try {
                const token = await currentUser.getIdToken();
                const fd = new FormData(); fd.append('file', file);
                const resp = await fetch('/api/v1/upload_file', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
                const data = await resp.json();
                voiceFileUrl = data.url || data.file_url;
                voiceUploadBtn.textContent = `✓ ${file.name}`;
                voiceUploadBtn.style.borderColor = '#f59e0b66';
                voiceUploadBtn.style.color = '#f59e0b';
            } catch (err) {
                voiceUploadBtn.textContent = '🎙 Seleccionar audio de 10s';
                alert('Error: ' + err.message);
            }
        });

        const cloneBtn = document.createElement('button');
        cloneBtn.style.cssText = 'padding:10px 20px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:12px;font-weight:700;cursor:pointer;width:fit-content';
        cloneBtn.textContent = 'Clonar voz (gratis)';
        cloneBtn.addEventListener('click', async () => {
            if (!voiceFileUrl) return alert('Sube un audio primero.');
            cloneBtn.textContent = '⏳ Clonando...';
            try {
                const token = await currentUser.getIdToken();
                const res = await callMuapi('suno-voice-clone', { audio_url: voiceFileUrl }, token);
                const voiceId = res.voice_id || res.id;
                if (!voiceId) throw new Error('No se obtuvo voice_id.');
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id), { voiceId });
                currentArtist.voiceId = voiceId;
                cloneBtn.textContent = '✓ Voz clonada';
                currentVoice.querySelector('div:last-child').style.cssText = 'background:#f59e0b11;border:1px solid #f59e0b33;border-radius:10px;padding:10px 14px;color:#f59e0b;font-size:13px';
                currentVoice.querySelector('div:last-child').textContent = `🎤 Voz clonada activa — ID: ${voiceId}`;
            } catch (err) {
                cloneBtn.textContent = 'Clonar voz (gratis)';
                alert('Error: ' + err.message);
            }
        });

        cloneSection.appendChild(voiceFileInput);
        cloneSection.appendChild(voiceUploadBtn);
        cloneSection.appendChild(cloneBtn);
        info.appendChild(cloneSection);
        panel.appendChild(info);

        return panel;
    }

    // ============================================================
    // CARGAR ARTISTAS DESDE FIREBASE
    // ============================================================
    async function loadArtists(user) {
        try {
            const q    = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'artists'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            artists = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) { console.error('[KreateMusic] loadArtists:', e); }
        renderArtistList();
        showView('artistList');
    }

    // ============================================================
    // AUTH LISTENER
    // ============================================================
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loadArtists(user);
        } else {
            currentUser = null;
            showView('auth');
        }
    });

    // Init
    showView('auth');
    renderCreateArtist(); // pre-render for speed

    return root;
}
