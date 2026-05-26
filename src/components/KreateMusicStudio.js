import { auth, db, APP_ID } from '../lib/firebase.js';
import {
    collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc,
    query, orderBy, limit, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ============================================================
// ABRIR IMAGEN COMO BLOB
// ============================================================
async function openAsBlob(url) {
    try {
        const blob    = await fetch(url).then(r => r.blob());
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } catch {
        window.open(url, '_blank');
    }
}

// ============================================================
// PRECIOS
// ============================================================
const COSTS = {
    CREATE_ARTIST:          32,
    CREATE_ARTIST_VOICE:    32,
    CLONE_VOICE_LATER:       0,
    PHOTO_EXTRA:            16,
    SONG_CREATE:            20,
    SONG_EXTEND:            20,
    SONG_REMIX:             20,
    SONG_ADD_VOCALS:        20,
    SONG_ADD_INSTRUMENTAL:  20,
    SONG_MASHUP:            20,
    LYRICS_GENERATE:        20,
    SOUNDS_GENERATE:         4,
};

const getSongCreateCost = (duration = 120) => {
    const secs = parseInt(duration) || 120;
    return Math.max(5, Math.ceil((secs / 60) * 10));
};

// ============================================================
// HELPERS MUAPI
// ============================================================
const MUAPI_ROUTE_MAP = {
    'suno-create-music':      'generate/music/create',
    'suno-extend-music':      'generate/music/extend',
    'suno-remix-music':       'generate/music/remix',
    'suno-add-vocals':        'generate/music/vocals',
    'suno-add-instrumental':  'generate/music/instrumental',
    'suno-generate-mashup':   'generate/music/mashup',
    'suno-generate-sounds':   'generate/music/sounds',
    'suno-voice-clone':       'generate/music/clone-voice',
    'gpt-5-mini':             'generate/music/lyrics',
    'nano-banana-2':          'generate/artist/photo',
    'nano-banana-2-edit':     'generate/artist/photo-edit',
};

function getMuapiErrorMessage(data, fallback = '') {
    const raw = data?.detail?.error || data?.detail?.message || data?.error?.message
             || data?.error || data?.message || data?.output?.error || fallback;
    if (!raw) return '';
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

function isPolicyError(message) {
    const m = String(message || '').toLowerCase();
    return m.includes('copyright') || m.includes('policy') || m.includes('violation')
        || m.includes('protected') || m.includes('infringe') || m.includes('content');
}

function friendlyMuapiError(data, status) {
    const msg = getMuapiErrorMessage(data, `Error ${status}`);
    if (isPolicyError(msg)) {
        return 'La generación fue rechazada por copyright o políticas de contenido. Edita la letra/prompt y vuelve a intentarlo.';
    }
    return msg || `Error en el servidor: ${status}`;
}

function extractUrls(data) {
    const urls = [];
    const add  = (value) => { if (value && typeof value === 'string') urls.push(value); };

    if (Array.isArray(data?.output?.outputs)) data.output.outputs.forEach(add);
    if (Array.isArray(data?.outputs))         data.outputs.forEach(add);
    if (Array.isArray(data?.data?.outputs))   data.data.outputs.forEach(add);

    if (Array.isArray(data?.songs)) data.songs.forEach(s => add(s.url || s.audio_url));
    if (Array.isArray(data?.clips)) data.clips.forEach(c => add(c.url || c.audio_url));

    add(data?.url);
    add(data?.audio_url);
    add(data?.file_url);
    add(data?.output?.url);
    add(data?.data?.url);

    return [...new Set(urls.filter(Boolean))];
}

function extractUploadUrl(data) {
    return data?.url
        || data?.file_url
        || data?.fileUrl
        || data?.audio_url
        || data?.data?.url
        || data?.data?.file_url
        || data?.data?.fileUrl
        || data?.output?.url
        || data?.output?.file_url
        || data?.file?.url
        || null;
}

function getRequestId(data) {
    return data?.request_id
        || data?.requestId
        || data?.prediction_id
        || data?.predictionId
        || data?.output?.request_id
        || data?.data?.request_id
        || null;
}

function extractVoiceId(data) {
    return data?.voice_id
        || data?.voiceId
        || data?.persona_id
        || data?.personaId
        || data?.data?.voice_id
        || data?.data?.voiceId
        || data?.data?.persona_id
        || data?.data?.personaId
        || data?.output?.voice_id
        || data?.output?.voiceId
        || data?.output?.persona_id
        || data?.output?.personaId
        || data?.result?.voice_id
        || data?.result?.persona_id
        || null;
}

async function callMuapi(endpoint, params, token) {
    const route = MUAPI_ROUTE_MAP[endpoint] || endpoint;
    const resp  = await fetch(`/api/v1/${route}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify(params),
    });

    const text = await resp.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }

    if (!resp.ok) throw new Error(friendlyMuapiError(data, resp.status));
    return data;
}

async function pollResult(requestId, token, onProgress, maxAttempts = 90, interval = 3000) {
    let lastError = '';

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, interval));

        const pct = Math.min(95, Math.round(((i + 1) / maxAttempts) * 100));
        if (onProgress) onProgress(pct, i * interval / 1000);

        let resp;
        try {
            resp = await fetch(`/api/v1/predictions/${requestId}/result`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
        } catch(e) {
            lastError = e.message;
            continue;
        }

        const text = await resp.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }

        if (!resp.ok) {
            const msg = friendlyMuapiError(data, resp.status);
            if (resp.status < 500 || isPolicyError(msg)) throw new Error(msg);
            lastError = msg;
            continue;
        }

        const errMsg = getMuapiErrorMessage(data);
        const status = String(data.status || data.output?.status || data?.detail?.status || '').toLowerCase();

        if (errMsg && isPolicyError(errMsg)) throw new Error(friendlyMuapiError(data, 400));
        if (status === 'failed' || status === 'error') throw new Error(friendlyMuapiError(data, 400));

        const urls = extractUrls(data);
        if (urls.length) return { url: urls[0], urls, data };
    }

    throw new Error(lastError || 'Tiempo de espera agotado.');
}

async function pollVoiceClone(requestId, token, onProgress, maxAttempts = 80, interval = 3000) {
    let lastError = '';

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, interval));

        const pct = Math.min(95, Math.round(((i + 1) / maxAttempts) * 100));
        if (onProgress) onProgress(pct, i * interval / 1000);

        const resp = await fetch(`/api/v1/predictions/${requestId}/result`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        const text = await resp.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }

        if (!resp.ok) {
            lastError = friendlyMuapiError(data, resp.status);
            if (resp.status < 500) throw new Error(lastError);
            continue;
        }

        const errMsg = getMuapiErrorMessage(data);
        const status = String(data.status || data.output?.status || data?.detail?.status || '').toLowerCase();

        if (errMsg && isPolicyError(errMsg)) throw new Error(friendlyMuapiError(data, 400));
        if (status === 'failed' || status === 'error') throw new Error(friendlyMuapiError(data, 400));

        const voiceId = extractVoiceId(data);
        if (voiceId) return { voiceId, data };
    }

    throw new Error(lastError || 'Tiempo de espera agotado clonando la voz.');
}

async function cloneVoiceFromUrl(audioUrl, token, onProgress) {
    if (!audioUrl) throw new Error('No se recibió URL del audio subido.');

    const res = await callMuapi('suno-voice-clone', {
        audio_url: audioUrl,
        file_url: audioUrl,
        url: audioUrl,
    }, token);

    let voiceId = extractVoiceId(res);
    if (voiceId) return voiceId;

    const requestId = getRequestId(res) || res?.id;
    if (requestId) {
        const polled = await pollVoiceClone(requestId, token, onProgress);
        voiceId = polled.voiceId;
    }

    if (!voiceId) {
        console.warn('[KreateMusic] Respuesta voice clone sin voice_id:', res);
        throw new Error('No se obtuvo voice_id. La clonación no devolvió una voz válida.');
    }

    return voiceId;
}

async function uploadAudioFile(file, token) {
    if (!file) throw new Error('No se seleccionó ningún archivo.');
    if (file.type && !file.type.startsWith('audio/')) {
        throw new Error('El archivo debe ser de audio.');
    }

    const fd = new FormData();
    fd.append('file', file);

    const resp = await fetch('/api/v1/upload_file', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
        throw new Error(data.error || data.message || 'No se pudo subir el audio.');
    }

    const url = extractUploadUrl(data);

    if (!url) {
        console.warn('[KreateMusic] Upload sin URL:', data);
        throw new Error('El audio se subió, pero no se recibió URL del archivo.');
    }

    return url;
}

function setupAudioDropZone({ dropEl, inputEl, onFile }) {
    const setActive = (active) => {
        dropEl.style.borderColor = active ? '#f59e0b' : '#2a2a2a';
        dropEl.style.background = active ? '#f59e0b11' : '#0a0a0a';
        dropEl.style.color = active ? '#f59e0b' : '#888';
    };

    ['dragenter', 'dragover'].forEach(evt => {
        dropEl.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            setActive(true);
        });
    });

    ['dragleave', 'dragend'].forEach(evt => {
        dropEl.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            setActive(false);
        });
    });

    dropEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setActive(false);

        const files = Array.from(e.dataTransfer?.files || []);
        const file = files.find(f => !f.type || f.type.startsWith('audio/')) || files[0];
        if (file) await onFile(file);
    });

    inputEl.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (file) await onFile(file);
    });
}

async function checkBalanceForUx(userRef, cost) {
    try {
        const snap    = await getDoc(userRef);
        const credits = snap.exists() ? (snap.data().credits || 0) : 0;

        if (credits < cost) {
            throw new Error(`Saldo insuficiente. Necesitas ${cost} 🪙 y tienes ${credits} 🪙.`);
        }

        return false;
    } catch(e) {
        if (e.message.includes('Saldo insuficiente')) throw e;
        return false;
    }
}

async function deduct() {
    // Créditos descontados por backend.
}

// ============================================================
// ESTILOS
// ============================================================
if (!document.querySelector('#km-styles')) {
    const st = document.createElement('style');
    st.id = 'km-styles';
    st.textContent = `
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0;transform:translateY(10px) } to { opacity:1;transform:translateY(0) } }
        @keyframes pulse-ring { 0%,100%{opacity:.4;transform:scale(1)} 50%{opacity:1;transform:scale(1.05)} }
        .km-card { animation: fadeUp .3s ease; }
    `;
    document.head.appendChild(st);
}

function extractTextResult(res) {
    if (!res) return null;
    const fromOutput = res?.output?.outputs?.[0] || res?.outputs?.[0];
    if (fromOutput && typeof fromOutput === 'string') return fromOutput;

    return res?.text
        || res?.result
        || res?.output?.text
        || res?.output?.result
        || res?.content
        || res?.message
        || res?.choices?.[0]?.message?.content
        || res?.choices?.[0]?.text
        || null;
}

// ============================================================
// PROGRESS OVERLAY
// ============================================================
function createProgressOverlay({ title, steps }) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.92);backdrop-filter:blur(20px);
        z-index:99999;display:flex;flex-direction:column;align-items:center;
        justify-content:center;gap:28px;padding:32px;
    `;

    const rings = document.createElement('div');
    rings.style.cssText = 'position:relative;width:100px;height:100px;flex-shrink:0';
    rings.innerHTML = `
        <div style="position:absolute;inset:0;border-radius:50%;border:2px solid #f59e0b22;animation:spin 4s linear infinite"></div>
        <div style="position:absolute;inset:8px;border-radius:50%;border:2px solid #f59e0b44;animation:spin 3s linear infinite reverse"></div>
        <div style="position:absolute;inset:16px;border-radius:50%;border:2px solid #f59e0b88;animation:spin 2s linear infinite"></div>
        <div id="km-prog-icon" style="position:absolute;inset:22px;border-radius:50%;background:#f59e0b11;border:1px solid #f59e0b;display:flex;align-items:center;justify-content:center;font-size:22px">✨</div>
    `;

    const info = document.createElement('div');
    info.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;max-width:320px';
    info.innerHTML = `
        <p style="color:#fff;font-size:18px;font-weight:900;margin:0">${title}</p>
        <p id="km-prog-label" style="color:#f59e0b;font-size:13px;margin:0;min-height:18px">${steps[0]?.label || ''}</p>
    `;

    const barWrap = document.createElement('div');
    barWrap.style.cssText = 'width:300px;background:#1a1a1a;border-radius:100px;height:6px;overflow:hidden;border:1px solid #2a2a2a;position:relative';
    barWrap.innerHTML = `<div id="km-prog-bar" style="height:100%;background:linear-gradient(90deg,#f59e0b,#fbbf24);border-radius:100px;width:0%;transition:width .6s ease"></div>`;

    const pctLabel = document.createElement('p');
    pctLabel.id = 'km-prog-pct';
    pctLabel.style.cssText = 'color:#555;font-size:12px;margin:0;font-family:monospace';
    pctLabel.textContent = '0%';

    const preview = document.createElement('div');
    preview.id = 'km-prog-preview';
    preview.style.cssText = 'width:120px;height:120px;border-radius:14px;background:#1a1a1a;border:2px dashed #2a2a2a;overflow:hidden;display:flex;align-items:center;justify-content:center;transition:all .5s';
    preview.innerHTML = '<p style="color:#333;font-size:10px;text-align:center;padding:8px">Vista previa</p>';

    overlay.appendChild(rings);
    overlay.appendChild(info);
    overlay.appendChild(barWrap);
    overlay.appendChild(pctLabel);
    overlay.appendChild(preview);

    let stepIdx = 0;
    const stepInterval = setInterval(() => {
        if (stepIdx < steps.length) {
            const icon  = overlay.querySelector('#km-prog-icon');
            const label = overlay.querySelector('#km-prog-label');
            if (icon)  icon.textContent  = steps[stepIdx].icon;
            if (label) label.textContent = steps[stepIdx].label;
            stepIdx++;
        }
    }, 12000);

    const update = (pct, label) => {
        const bar     = overlay.querySelector('#km-prog-bar');
        const pctEl   = overlay.querySelector('#km-prog-pct');
        const labelEl = overlay.querySelector('#km-prog-label');
        if (bar)    bar.style.width = `${pct}%`;
        if (pctEl)  pctEl.textContent = `${pct}%`;
        if (label && labelEl) labelEl.textContent = label;
    };

    const complete = (previewUrl) => {
        clearInterval(stepInterval);
        update(100, '¡Completado!');
        const icon = overlay.querySelector('#km-prog-icon');
        if (icon) icon.textContent = '✅';

        if (previewUrl) {
            const prev = overlay.querySelector('#km-prog-preview');
            if (prev) {
                prev.innerHTML = `<img src="${previewUrl}" style="width:100%;height:100%;object-fit:cover">`;
                prev.style.border = '2px solid #f59e0b';
            }
        }
    };

    const remove = () => {
        clearInterval(stepInterval);
        overlay.remove();
    };

    return { el: overlay, update, complete, remove };
}

// ============================================================
// CONFIRM DIALOG
// ============================================================
function confirmDialog(title, message, confirmLabel = 'Confirmar', danger = false) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(10px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:24px';

        const box = document.createElement('div');
        box.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:20px;padding:28px;max-width:380px;width:100%;display:flex;flex-direction:column;gap:16px;animation:fadeUp .2s ease';
        box.innerHTML = `
            <p style="color:#fff;font-size:16px;font-weight:900;margin:0">${title}</p>
            <p style="color:#888;font-size:13px;margin:0;line-height:1.5">${message}</p>
        `;

        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

        const cancelBtn = document.createElement('button');
        cancelBtn.style.cssText = 'padding:9px 20px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:100px;color:#888;font-size:13px;font-weight:600;cursor:pointer';
        cancelBtn.textContent = 'Cancelar';
        cancelBtn.addEventListener('click', () => { overlay.remove(); resolve(false); });

        const confirmBtn = document.createElement('button');
        confirmBtn.style.cssText = `padding:9px 20px;background:${danger ? '#ef4444' : '#f59e0b'};border:none;border-radius:100px;color:${danger ? '#fff' : '#000'};font-size:13px;font-weight:700;cursor:pointer`;
        confirmBtn.textContent = confirmLabel;
        confirmBtn.addEventListener('click', () => { overlay.remove(); resolve(true); });

        btns.appendChild(cancelBtn);
        btns.appendChild(confirmBtn);
        box.appendChild(btns);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    });
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export function KreateMusicStudio() {
    const root = document.createElement('div');
    root.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;background:#050505;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif;position:relative';

    let currentUser   = null;
    let currentArtist = null;
    let artists       = [];

    const views = {};
    const showView = (name) => {
        Object.values(views).forEach(v => {
            v.style.display = 'none';
            v.style.flex = '';
        });

        if (views[name]) {
            views[name].style.display = 'flex';
            views[name].style.flex = '1';
            views[name].style.flexDirection = 'column';
            views[name].style.minHeight = '0';
        }
    };

    // ============================================================
    // AUTH
    // ============================================================
    const authGuard = document.createElement('div');
    authGuard.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#fff';
    authGuard.innerHTML = `<div style="font-size:40px">🎵</div><p style="color:#888;font-size:14px">Inicia sesión para usar KreateMusic</p>`;
    views.auth = authGuard;
    root.appendChild(authGuard);

    // ============================================================
    // LISTA ARTISTAS
    // ============================================================
    const artistListView = document.createElement('div');
    artistListView.style.cssText = 'flex-direction:column;overflow-y:auto;padding:24px;gap:24px;display:none';
    views.artistList = artistListView;
    root.appendChild(artistListView);

    const artistListHeader = document.createElement('div');
    artistListHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;flex-shrink:0';
    artistListHeader.innerHTML = '<div><h1 style="color:#fff;font-size:22px;font-weight:900;margin:0">KreateMusic</h1><p style="color:#555;font-size:12px;margin:4px 0 0">Tus artistas de IA</p></div>';

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.id = 'km-new-artist-btn';
    newBtn.style.cssText = 'display:flex;align-items:center;gap:6px;padding:10px 18px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:13px;font-weight:700;cursor:pointer;position:relative;z-index:10';
    newBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg> Nuevo artista';
    newBtn.onclick = function() {
        renderCreateArtist();
        showView('createArtist');
    };
    artistListHeader.appendChild(newBtn);
    artistListView.appendChild(artistListHeader);

    const artistGridContainer = document.createElement('div');
    artistGridContainer.style.cssText = 'display:flex;flex-direction:column;gap:24px;flex:1';
    artistListView.appendChild(artistGridContainer);

    function renderArtistList() {
        artistGridContainer.innerHTML = '';

        if (artists.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center';
            empty.innerHTML = '<div style="font-size:56px;opacity:.2">🎤</div><p style="color:#fff;font-size:16px;font-weight:700;margin:0">Sin artistas aún</p><p style="color:#555;font-size:13px;margin:0">Crea tu primer artista de IA</p>';
            artistGridContainer.appendChild(empty);
            return;
        }

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px';

        artists.forEach(artist => {
            const card = document.createElement('div');
            card.className = 'km-card';
            card.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:14px;overflow:hidden;cursor:pointer;transition:border-color .15s;position:relative';
            card.addEventListener('mouseenter', () => card.style.borderColor = '#f59e0b66');
            card.addEventListener('mouseleave', () => card.style.borderColor = '#2a2a2a');

            card.innerHTML = `
                <div style="aspect-ratio:1;overflow:hidden;background:#1a1a1a">
                    ${artist.referencePhotoUrl
                        ? `<img src="${artist.referencePhotoUrl}" style="width:100%;height:100%;object-fit:cover">`
                        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:40px">🎤</div>`}
                </div>
                <div style="padding:10px 12px">
                    <p style="color:#fff;font-size:13px;font-weight:700;margin:0 0 2px">${artist.name}</p>
                    <p style="color:#555;font-size:11px;margin:0">${[artist.genre, artist.style].filter(Boolean).join(' · ')}</p>
                    <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
                        ${artist.voiceId ? '<span style="background:#f59e0b22;color:#f59e0b;font-size:9px;font-weight:700;padding:1px 5px;border-radius:100px">VOZ ✓</span>' : ''}
                    </div>
                </div>
            `;

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.style.cssText = 'position:absolute;top:8px;right:8px;width:26px;height:26px;background:rgba(0,0,0,.7);border:1px solid #333;border-radius:8px;color:#888;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;backdrop-filter:blur(4px);transition:all .15s;opacity:0';
            delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`;
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const ok = await confirmDialog(
                    `Eliminar a ${artist.name}`,
                    'Esta acción eliminará permanentemente el perfil del artista, todas sus fotos y todas sus canciones. Esta acción no se puede deshacer.',
                    'Eliminar todo',
                    true
                );
                if (!ok) return;
                await deleteArtist(artist);
            });

            card.addEventListener('mouseenter', () => delBtn.style.opacity = '1');
            card.addEventListener('mouseleave', () => delBtn.style.opacity = '0');
            card.appendChild(delBtn);

            card.addEventListener('click', () => {
                currentArtist = artist;
                renderArtistDashboard();
                showView('artistDashboard');
            });

            grid.appendChild(card);
        });

        artistGridContainer.appendChild(grid);
    }

    async function deleteArtist(artist) {
        if (!currentUser) return;

        const prog = createProgressOverlay({
            title: `Eliminando a ${artist.name}...`,
            steps: [
                { icon: '🗑️', label: 'Eliminando canciones...' },
                { icon: '📸', label: 'Eliminando fotos...' },
                { icon: '💀', label: 'Eliminando perfil...' },
            ],
        });

        document.body.appendChild(prog.el);

        try {
            const uid = currentUser.uid;
            const artistRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', uid, 'artists', artist.id);

            prog.update(20, 'Eliminando canciones...');
            const songsSnap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', uid, 'artists', artist.id, 'songs'));
            const batch1 = writeBatch(db);
            songsSnap.forEach(d => batch1.delete(d.ref));
            await batch1.commit();

            prog.update(60, 'Eliminando fotos...');
            const photosSnap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', uid, 'artists', artist.id, 'photos'));
            const batch2 = writeBatch(db);
            photosSnap.forEach(d => batch2.delete(d.ref));
            await batch2.commit();

            prog.update(90, 'Eliminando perfil...');
            await deleteDoc(artistRef);

            prog.complete(null);
            await new Promise(r => setTimeout(r, 800));
            prog.remove();

            artists = artists.filter(a => a.id !== artist.id);
            renderArtistList();
        } catch (err) {
            prog.remove();
            alert('Error al eliminar: ' + err.message);
        }
    }

    // ============================================================
    // CREAR ARTISTA
    // ============================================================
    const createArtistView = document.createElement('div');
    createArtistView.style.cssText = 'flex-direction:column;overflow-y:auto;padding:24px;gap:16px;display:none;max-width:600px;margin:0 auto;width:100%';
    views.createArtist = createArtistView;
    root.appendChild(createArtistView);

    function renderCreateArtist() {
        createArtistView.innerHTML = '';

        const back = document.createElement('button');
        back.type = 'button';
        back.style.cssText = 'display:flex;align-items:center;gap:6px;background:none;border:none;color:#666;font-size:12px;cursor:pointer;padding:0;width:fit-content';
        back.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg> Mis artistas`;
        back.addEventListener('click', (e) => { e.stopPropagation(); showView('artistList'); });
        createArtistView.appendChild(back);

        const titleEl = document.createElement('div');
        titleEl.innerHTML = '<h2 style="color:#fff;font-size:18px;font-weight:900;margin:0">Crear nuevo artista</h2><p style="color:#555;font-size:12px;margin:4px 0 0">Crea un artista con foto y voz opcional.</p>';
        createArtistView.appendChild(titleEl);

        const formData = {};

        const fields = [
            { id: 'name',      label: 'Nombre del artista *',    placeholder: 'Ej: Luna Reyes', required: true },
            { id: 'genre',     label: 'Género musical',          placeholder: 'Ej: Reggaeton, Pop, R&B...' },
            { id: 'style',     label: 'Estilo / Vibe',           placeholder: 'Ej: Oscuro y elegante, Urbano, Fresco...' },
            { id: 'ethnicity', label: 'Etnia / Origen',          placeholder: 'Ej: Latina, Africana, Asiática...' },
            { id: 'age',       label: 'Edad aproximada',         placeholder: 'Ej: 25' },
            { id: 'gender',    label: 'Género',                  placeholder: 'Ej: Mujer, Hombre...' },
            { id: 'build',     label: 'Complexión',              placeholder: 'Ej: Atlética, Delgada, Curvilínea...' },
            { id: 'outfit',    label: 'Vestimenta / Estética',   placeholder: 'Ej: Streetwear, Elegante...' },
            { id: 'extra',     label: 'Detalles extra',          placeholder: 'Tatuajes, color de pelo, accesorios...', textarea: true },
        ];

        fields.forEach(f => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px';

            const lbl = document.createElement('label');
            lbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
            lbl.textContent = f.label;
            wrap.appendChild(lbl);

            const input = f.textarea ? document.createElement('textarea') : document.createElement('input');
            if (!f.textarea) input.type = 'text';
            input.placeholder = f.placeholder;
            input.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:9px 13px;color:#fff;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s';

            if (f.textarea) {
                input.rows = 2;
                input.style.resize = 'none';
            }

            input.addEventListener('focus', () => input.style.borderColor = '#f59e0b66');
            input.addEventListener('blur',  () => input.style.borderColor = '#2a2a2a');
            input.addEventListener('input', () => { formData[f.id] = input.value; });

            wrap.appendChild(input);
            createArtistView.appendChild(wrap);
        });

        const voiceBox = document.createElement('div');
        voiceBox.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px';
        voiceBox.innerHTML = '<p style="color:#fff;font-size:13px;font-weight:700;margin:0">🎤 Configuración de voz</p>';

        let voiceMode = 'style';

        const vtRow = document.createElement('div');
        vtRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px';

        const makeVoiceCard = (icon, title, desc, cost, mode) => {
            const card = document.createElement('div');
            card.style.cssText = `background:${mode === 'style' ? '#f59e0b22' : '#1a1a1a'};border:${mode === 'style' ? '2px solid #f59e0b66' : '1px solid #2a2a2a'};border-radius:12px;padding:10px;cursor:pointer;text-align:center;transition:all .15s`;
            card.innerHTML = `<div style="font-size:18px">${icon}</div><div style="color:${mode === 'style' ? '#f59e0b' : '#888'};font-size:11px;font-weight:700;margin-top:3px">${title}</div><div style="color:#555;font-size:10px">${desc}</div><div style="color:#f59e0b;font-size:10px;font-weight:700;margin-top:4px">${cost}</div>`;
            return card;
        };

        const styleCard = makeVoiceCard('✍️', 'Estilo textual', 'Describe la voz', 'incluido', 'style');
        const cloneCard = makeVoiceCard('🎙', 'Clonar voz real', 'Click o arrastra audio', 'incluido', 'clone');

        const stylePanel = document.createElement('div');
        stylePanel.style.cssText = 'display:flex;flex-direction:column;gap:6px';

        const styleInput = document.createElement('input');
        styleInput.placeholder = 'Ej: voz femenina, grave, sensual, acento latino...';
        styleInput.style.cssText = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;padding:9px 13px;color:#fff;font-size:13px;outline:none;font-family:inherit';
        styleInput.addEventListener('input', () => { formData.voiceStyle = styleInput.value; });
        stylePanel.appendChild(styleInput);

        const clonePanel = document.createElement('div');
        clonePanel.style.cssText = 'display:none;flex-direction:column;gap:6px';

        const voiceFileInput = document.createElement('input');
        voiceFileInput.type = 'file';
        voiceFileInput.accept = 'audio/*';
        voiceFileInput.style.display = 'none';

        let voiceFileUrl = null;

        const voiceUploadBtn = document.createElement('button');
        voiceUploadBtn.type = 'button';
        voiceUploadBtn.style.cssText = 'background:#0a0a0a;border:1px dashed #2a2a2a;border-radius:10px;padding:14px;color:#888;font-size:12px;cursor:pointer;width:100%;text-align:center;line-height:1.45';
        voiceUploadBtn.innerHTML = '🎙 Seleccionar audio o arrastrarlo aquí<br><span style="font-size:10px;color:#555">Recomendado: 10-30 segundos, voz clara y sin música</span>';
        voiceUploadBtn.addEventListener('click', () => voiceFileInput.click());

        const handleCreateVoiceFile = async (file) => {
            if (!currentUser) return alert('Debes iniciar sesión.');
            voiceUploadBtn.textContent = 'Subiendo audio...';

            try {
                const token = await currentUser.getIdToken();
                voiceFileUrl = await uploadAudioFile(file, token);
                voiceUploadBtn.textContent = `✓ ${file.name}`;
                voiceUploadBtn.style.borderColor = '#f59e0b66';
                voiceUploadBtn.style.color = '#f59e0b';
            } catch (err) {
                voiceFileUrl = null;
                voiceUploadBtn.innerHTML = '🎙 Seleccionar audio o arrastrarlo aquí<br><span style="font-size:10px;color:#555">Recomendado: 10-30 segundos, voz clara y sin música</span>';
                voiceUploadBtn.style.borderColor = '#2a2a2a';
                voiceUploadBtn.style.color = '#888';
                alert(err.message);
            }
        };

        setupAudioDropZone({
            dropEl: voiceUploadBtn,
            inputEl: voiceFileInput,
            onFile: handleCreateVoiceFile,
        });

        clonePanel.appendChild(voiceFileInput);
        clonePanel.appendChild(voiceUploadBtn);

        const setVoiceMode = (mode) => {
            voiceMode = mode;

            [styleCard, cloneCard].forEach((c, i) => {
                const m = i === 0 ? 'style' : 'clone';
                const active = m === mode;
                c.style.background = active ? '#f59e0b22' : '#1a1a1a';
                c.style.border = active ? '2px solid #f59e0b66' : '1px solid #2a2a2a';
                c.querySelector('div:nth-child(2)').style.color = active ? '#f59e0b' : '#888';
            });

            stylePanel.style.display = mode === 'style' ? 'flex' : 'none';
            clonePanel.style.display = mode === 'clone' ? 'flex' : 'none';
            totalCostEl.textContent = mode === 'clone' ? `${COSTS.CREATE_ARTIST_VOICE} 🪙` : `${COSTS.CREATE_ARTIST} 🪙`;
        };

        styleCard.addEventListener('click', () => setVoiceMode('style'));
        cloneCard.addEventListener('click', () => setVoiceMode('clone'));

        vtRow.appendChild(styleCard);
        vtRow.appendChild(cloneCard);
        voiceBox.appendChild(vtRow);
        voiceBox.appendChild(stylePanel);
        voiceBox.appendChild(clonePanel);
        createArtistView.appendChild(voiceBox);

        const totalCostEl = document.createElement('p');
        totalCostEl.style.cssText = 'color:#555;font-size:12px;text-align:center;margin:0';
        totalCostEl.textContent = `${COSTS.CREATE_ARTIST} 🪙`;

        const createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.style.cssText = 'width:100%;padding:13px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:40px';
        createBtn.textContent = 'Crear artista y generar foto';

        createBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            if (!formData.name?.trim()) return alert('El nombre del artista es obligatorio.');
            if (!currentUser) return alert('Debes iniciar sesión.');

            const cost = voiceMode === 'clone' ? COSTS.CREATE_ARTIST_VOICE : COSTS.CREATE_ARTIST;
            const token = await currentUser.getIdToken();
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);

            let isAdmin;
            try {
                isAdmin = await checkBalanceForUx(userRef, cost);
            } catch (e) {
                return alert(e.message);
            }

            createBtn.disabled = true;

            const STEPS = [
                { icon: '🎨', label: 'Analizando descripción...' },
                { icon: '📸', label: 'Generando foto de estudio...' },
                { icon: '✨', label: 'Procesando detalles visuales...' },
                { icon: '🎤', label: 'Configurando voz...' },
                { icon: '🚀', label: 'Últimos retoques...' },
            ];

            const prog = createProgressOverlay({ title: `Creando a ${formData.name}`, steps: STEPS });
            document.body.appendChild(prog.el);

            try {
                const desc = [
                    formData.gender,
                    formData.age && `aged ${formData.age}`,
                    formData.ethnicity && `${formData.ethnicity} ethnicity`,
                    formData.build && `${formData.build} build`,
                    formData.outfit && `wearing ${formData.outfit}`,
                    formData.extra,
                ].filter(Boolean).join(', ');

                const studioPrompt = `Hyperrealistic professional music artist reference sheet, pure white seamless studio background, ${desc}, ${formData.style || 'contemporary'} aesthetic, photorealistic skin pores and texture, natural hair strands, true-to-life eye reflections, multiple poses: close-up portrait front, three-quarter body, full body standing, left profile, right profile, white studio, Sony A7R V 85mm f/1.4, 8K, Vogue editorial, no CGI, 100% photographic realism`;

                prog.update(5, 'Enviando al generador...');
                const initRes = await callMuapi('nano-banana-2', {
                    prompt: studioPrompt,
                    aspect_ratio: '1:1',
                    resolution: '2k',
                    output_format: 'jpg',
                }, token);

                const rid = getRequestId(initRes) || initRes.id;
                let refPhotoUrl = initRes.url || initRes.output?.outputs?.[0];

                if (!refPhotoUrl && rid) {
                    const result = await pollResult(rid, token, (pct, secs) => {
                        prog.update(5 + Math.round(pct * 0.7), `Generando foto... ${Math.round(secs)}s`);
                    }, 60, 3000);
                    refPhotoUrl = result.url;
                }

                if (!refPhotoUrl) throw new Error('No se generó la foto de referencia.');

                prog.update(80, 'Foto generada');

                let voiceId = null;

                if (voiceMode === 'clone') {
                    if (!voiceFileUrl) {
                        throw new Error('Has elegido clonar voz, pero no has subido ningún audio.');
                    }

                    prog.update(84, 'Clonando voz...');

                    voiceId = await cloneVoiceFromUrl(voiceFileUrl, token, (pct) => {
                        prog.update(84 + Math.round(pct * 0.12), 'Clonando voz...');
                    });
                }

                prog.update(94, 'Guardando en Firebase...');

                const artistData = {
                    name: formData.name.trim(),
                    genre: formData.genre || '',
                    style: formData.style || '',
                    ethnicity: formData.ethnicity || '',
                    age: formData.age || '',
                    gender: formData.gender || '',
                    build: formData.build || '',
                    outfit: formData.outfit || '',
                    extra: formData.extra || '',
                    voiceStyle: voiceMode === 'style' ? (formData.voiceStyle || '') : '',
                    voiceId,
                    referencePhotoUrl: refPhotoUrl,
                    studioPrompt,
                    createdAt: serverTimestamp(),
                };

                const artistsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists');
                const docRef = await addDoc(artistsRef, artistData);

                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', docRef.id, 'photos'), {
                    url: refPhotoUrl,
                    scene: 'studio_reference',
                    aspect_ratio: '1:1',
                    createdAt: serverTimestamp(),
                });

                prog.complete(refPhotoUrl);
                await deduct(userRef, cost, isAdmin);
                await new Promise(r => setTimeout(r, 1200));
                prog.remove();

                currentArtist = { id: docRef.id, ...artistData };
                artists.unshift(currentArtist);
                renderArtistDashboard();
                showView('artistDashboard');
            } catch (err) {
                prog.remove();
                createBtn.disabled = false;
                alert('Error: ' + err.message);
            }
        });

        createArtistView.appendChild(totalCostEl);
        createArtistView.appendChild(createBtn);
    }

    // ============================================================
    // DASHBOARD ARTISTA
    // ============================================================
    const artistDashboardView = document.createElement('div');
    artistDashboardView.style.cssText = 'flex-direction:column;overflow:hidden;display:none';
    views.artistDashboard = artistDashboardView;
    root.appendChild(artistDashboardView);

    function renderArtistDashboard() {
        if (!currentArtist) return;
        artistDashboardView.innerHTML = '';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 20px;background:#111;border-bottom:1px solid #1f1f1f;flex-shrink:0';

        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;padding:4px;display:flex;align-items:center';
        backBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`;
        backBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderArtistList();
            showView('artistList');
        });

        const thumb = document.createElement('div');
        thumb.style.cssText = 'width:44px;height:44px;border-radius:10px;overflow:hidden;background:#1a1a1a;flex-shrink:0;border:2px solid #f59e0b44';
        thumb.innerHTML = currentArtist.referencePhotoUrl
            ? `<img src="${currentArtist.referencePhotoUrl}" style="width:100%;height:100%;object-fit:cover">`
            : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px">🎤</div>';

        const info = document.createElement('div');
        info.innerHTML = `<p style="color:#fff;font-size:15px;font-weight:900;margin:0">${currentArtist.name}</p><p style="color:#555;font-size:11px;margin:2px 0 0">${[currentArtist.genre, currentArtist.style].filter(Boolean).join(' · ')}</p>`;

        const TABS = [
            { id: 'music',  icon: '🎵', label: 'Música' },
            { id: 'photos', icon: '📸', label: 'Fotos' },
            { id: 'voice',  icon: '🎤', label: 'Voz' },
        ];

        const tabBar = document.createElement('div');
        tabBar.style.cssText = 'display:flex;gap:4px;margin-left:auto';

        const panels = {};

        TABS.forEach(tab => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = `padding:6px 12px;border-radius:100px;font-size:12px;font-weight:700;cursor:pointer;border:none;transition:all .15s;${tab.id === 'music' ? 'background:#f59e0b;color:#000' : 'background:#1a1a1a;color:#888'}`;
            btn.textContent = `${tab.icon} ${tab.label}`;

            btn.addEventListener('click', () => {
                tabBar.querySelectorAll('button').forEach((b, i) => {
                    b.style.background = TABS[i].id === tab.id ? '#f59e0b' : '#1a1a1a';
                    b.style.color = TABS[i].id === tab.id ? '#000' : '#888';
                });

                Object.entries(panels).forEach(([id, p]) => {
                    p.style.display = id === tab.id ? 'flex' : 'none';
                });
            });

            tabBar.appendChild(btn);
        });

        header.appendChild(backBtn);
        header.appendChild(thumb);
        header.appendChild(info);
        header.appendChild(tabBar);
        artistDashboardView.appendChild(header);

        const panelsContainer = document.createElement('div');
        panelsContainer.style.cssText = 'flex:1;overflow:hidden;position:relative';

        panels.music  = buildMusicPanel();
        panels.photos = buildPhotosPanel();
        panels.voice  = buildVoicePanel();

        panels.music.style.display  = 'flex';
        panels.photos.style.display = 'none';
        panels.voice.style.display  = 'none';

        Object.values(panels).forEach(p => panelsContainer.appendChild(p));
        artistDashboardView.appendChild(panelsContainer);
    }

    // ============================================================
    // PANEL MÚSICA
    // ============================================================
    function buildMusicPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'flex-direction:column;overflow-y:auto;padding:20px;gap:16px;height:100%';

        const toolPanelContainer = document.createElement('div');
        toolPanelContainer.style.cssText = 'display:flex;flex-direction:column;gap:12px';
        panel.appendChild(toolPanelContainer);
        buildCreateSongPanel(toolPanelContainer);

        const songsLabel = document.createElement('p');
        songsLabel.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0;flex-shrink:0';
        songsLabel.textContent = 'Canciones guardadas';
        panel.appendChild(songsLabel);

        const songsGrid = document.createElement('div');
        songsGrid.id = 'km-songs-grid';
        songsGrid.style.cssText = 'display:flex;flex-direction:column;gap:8px';
        panel.appendChild(songsGrid);
        loadSongs(songsGrid);

        return panel;
    }

    function appendField(container, label, placeholder, id, textarea = false, defaultVal = '') {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px';

        const lbl = document.createElement('label');
        lbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
        lbl.textContent = label;

        const input = textarea ? document.createElement('textarea') : document.createElement('input');
        input.id = id;
        input.placeholder = placeholder;

        if (defaultVal) input.value = defaultVal;

        input.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:9px 13px;color:#fff;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s';

        if (textarea) {
            input.rows = 3;
            input.style.resize = 'none';
        }

        input.addEventListener('focus', () => input.style.borderColor = '#f59e0b66');
        input.addEventListener('blur',  () => input.style.borderColor = '#2a2a2a');

        wrap.appendChild(lbl);
        wrap.appendChild(input);
        container.appendChild(wrap);
    }

    function appendGenBtn(container, label, cost, onGenerate) {
        const getCost = typeof cost === 'function' ? cost : () => cost;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'width:100%;padding:12px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .15s';
        btn.innerHTML = `${label} <span style="background:rgba(0,0,0,.2);padding:2px 7px;border-radius:100px;font-size:11px;font-family:monospace">${getCost()} 🪙</span>`;
        btn.addEventListener('mouseenter', () => btn.style.background = '#fbbf24');
        btn.addEventListener('mouseleave', () => btn.style.background = '#f59e0b');

        const progressWrap = document.createElement('div');
        progressWrap.style.cssText = 'display:none;flex-direction:column;gap:6px';

        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'width:100%;background:#1a1a1a;border-radius:100px;height:4px;overflow:hidden;border:1px solid #2a2a2a';
        progressBar.innerHTML = '<div id="inline-bar" style="height:100%;background:linear-gradient(90deg,#f59e0b,#fbbf24);border-radius:100px;width:0%;transition:width .5s ease"></div>';

        const progressLabel = document.createElement('p');
        progressLabel.style.cssText = 'color:#888;font-size:11px;margin:0;text-align:center;font-family:monospace';

        progressWrap.appendChild(progressBar);
        progressWrap.appendChild(progressLabel);

        btn.addEventListener('click', async () => {
            if (!currentUser) return alert('Debes iniciar sesión.');

            const currentCost = getCost();
            btn.disabled = true;
            btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid #00000033;border-top-color:#000;border-radius:50%;animation:spin 1s linear infinite"></div> Generando...';
            progressWrap.style.display = 'flex';

            const token   = await currentUser.getIdToken();
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);

            try {
                const isAdmin = await checkBalanceForUx(userRef, currentCost);

                container._progressCallback = (pct, secs) => {
                    const bar = progressWrap.querySelector('#inline-bar');
                    if (bar) bar.style.width = `${pct}%`;
                    progressLabel.textContent = `${pct}% · ${Math.round(secs)}s`;
                };

                await onGenerate(token, userRef, isAdmin, currentCost);
            } catch (err) {
                alert('Error: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = `${label} <span style="background:rgba(0,0,0,.2);padding:2px 7px;border-radius:100px;font-size:11px;font-family:monospace">${getCost()} 🪙</span>`;
                progressWrap.style.display = 'none';

                const bar = progressWrap.querySelector('#inline-bar');
                if (bar) bar.style.width = '0%';
            }
        });

        container.appendChild(btn);
        container.appendChild(progressWrap);
    }

    function buildCreateSongPanel(container) {
        let selectedDur = 120;
        let songType = 'vocals';

        const getCurrentSongCost = () => getSongCreateCost(selectedDur);

        appendField(container, 'Título de la canción', `Ej: ${currentArtist?.name || 'Mi artista'} - Sin título`, 'song-title-input');
        appendField(container, 'Estilo musical', 'Ej: Reggaeton, trap, melódico...', 'song-style-input', false, [currentArtist?.genre, currentArtist?.style].filter(Boolean).join(', '));

        const durWrap = document.createElement('div');
        durWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';

        const durLbl = document.createElement('label');
        durLbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
        durLbl.textContent = 'Duración';

        const durRow = document.createElement('div');
        durRow.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px';

        const DURATIONS = [
            { val: 30, label: '30s' },
            { val: 60, label: '1 min' },
            { val: 120, label: '2 min' },
            { val: 180, label: '3 min' },
        ];

        const durSelect = document.createElement('select');
        durSelect.id = 'song-duration-select';
        durSelect.style.display = 'none';
        durSelect.value = '120';

        DURATIONS.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.val;
            opt.textContent = d.label;
            if (d.val === 120) opt.selected = true;
            durSelect.appendChild(opt);
        });

        DURATIONS.forEach(d => {
            const card = document.createElement('div');
            const active = d.val === selectedDur;
            card.className = 'km-dur-card';
            card.dataset.val = d.val;
            card.style.cssText = `background:${active ? '#f59e0b22' : '#1a1a1a'};border:${active ? '2px solid #f59e0b' : '1px solid #2a2a2a'};border-radius:10px;padding:8px;cursor:pointer;text-align:center;font-size:12px;font-weight:700;color:${active ? '#f59e0b' : '#888'};transition:all .15s`;
            card.textContent = d.label;

            card.addEventListener('click', () => {
                selectedDur = d.val;
                durSelect.value = d.val;

                durRow.querySelectorAll('.km-dur-card').forEach(c => {
                    const a = parseInt(c.dataset.val) === d.val;
                    c.style.background = a ? '#f59e0b22' : '#1a1a1a';
                    c.style.border     = a ? '2px solid #f59e0b' : '1px solid #2a2a2a';
                    c.style.color      = a ? '#f59e0b' : '#888';
                });

                const genBtn = container.querySelector('button[style*="border-radius:100px"][style*="f59e0b"]');
                if (genBtn) {
                    const span = genBtn.querySelector('span');
                    if (span) span.textContent = `${getSongCreateCost(selectedDur)} 🪙`;
                }
            });

            durRow.appendChild(card);
        });

        durWrap.appendChild(durLbl);
        durWrap.appendChild(durRow);
        durWrap.appendChild(durSelect);
        container.appendChild(durWrap);

        const typeWrap = document.createElement('div');
        typeWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';

        const typeLbl = document.createElement('label');
        typeLbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
        typeLbl.textContent = 'Tipo de canción';
        typeWrap.appendChild(typeLbl);

        const typeRow = document.createElement('div');
        typeRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px';

        const lyricsSection = document.createElement('div');

        const makeTypeCard = (icon, title, sub, mode) => {
            const c = document.createElement('div');
            const active = mode === songType;
            c.className = 'km-type-card';
            c.dataset.mode = mode;
            c.style.cssText = `background:${active ? '#f59e0b22' : '#1a1a1a'};border:${active ? '2px solid #f59e0b' : '1px solid #2a2a2a'};border-radius:12px;padding:10px;cursor:pointer;text-align:center;transition:all .15s;box-shadow:${active ? '0 0 12px rgba(245,158,11,.2)' : 'none'}`;
            c.innerHTML = `<div class="type-icon" style="font-size:18px">${icon}</div><div class="type-label" style="color:${active ? '#f59e0b' : '#888'};font-size:11px;font-weight:700;margin-top:3px">${title}</div><div style="color:#555;font-size:10px">${sub}</div>`;

            c.addEventListener('click', () => {
                songType = mode;

                typeRow.querySelectorAll('.km-type-card').forEach(card => {
                    const a = card.dataset.mode === mode;
                    card.style.background = a ? '#f59e0b22' : '#1a1a1a';
                    card.style.border     = a ? '2px solid #f59e0b' : '1px solid #2a2a2a';
                    card.style.boxShadow  = a ? '0 0 12px rgba(245,158,11,.2)' : 'none';

                    const lbl = card.querySelector('.type-label');
                    if (lbl) lbl.style.color = a ? '#f59e0b' : '#888';
                });

                lyricsSection.style.opacity = mode === 'vocals' ? '1' : '.3';
                lyricsSection.style.pointerEvents = mode === 'vocals' ? 'auto' : 'none';
            });

            return c;
        };

        typeRow.appendChild(makeTypeCard('🎤', 'Con voz', 'El artista canta', 'vocals'));
        typeRow.appendChild(makeTypeCard('🎸', 'Instrumental', 'Solo música', 'instrumental'));
        typeWrap.appendChild(typeRow);
        container.appendChild(typeWrap);

        lyricsSection.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;transition:opacity .2s';

        const lyricsTitle = document.createElement('p');
        lyricsTitle.style.cssText = 'color:#fff;font-size:12px;font-weight:700;margin:0';
        lyricsTitle.textContent = '✍️ Letra de la canción';
        lyricsSection.appendChild(lyricsTitle);

        const lyricsTextarea = document.createElement('textarea');
        lyricsTextarea.id = 'song-lyrics-input';
        lyricsTextarea.rows = 5;
        lyricsTextarea.placeholder = 'Escribe la letra de tu canción aquí...';
        lyricsTextarea.style.cssText = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;padding:9px 13px;color:#fff;font-size:12px;outline:none;font-family:monospace;resize:vertical;line-height:1.6;transition:border-color .15s';
        lyricsTextarea.addEventListener('focus', () => lyricsTextarea.style.borderColor = '#f59e0b66');
        lyricsTextarea.addEventListener('blur',  () => lyricsTextarea.style.borderColor = '#2a2a2a');
        lyricsSection.appendChild(lyricsTextarea);

        const aiPanel = document.createElement('div');
        aiPanel.style.cssText = 'display:flex;gap:8px;align-items:center';

        const aiTheme = document.createElement('input');
        aiTheme.placeholder = 'Tema: amor, fiesta, éxito...';
        aiTheme.style.cssText = 'flex:1;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;padding:8px 12px;color:#fff;font-size:12px;outline:none;font-family:inherit;transition:border-color .15s';
        aiTheme.addEventListener('focus', () => aiTheme.style.borderColor = '#f59e0b66');
        aiTheme.addEventListener('blur',  () => aiTheme.style.borderColor = '#2a2a2a');

        const genLyricsBtn = document.createElement('button');
        genLyricsBtn.type = 'button';
        genLyricsBtn.style.cssText = 'padding:8px 14px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0';
        genLyricsBtn.innerHTML = 'Generar Letra <span style="opacity:.6;font-size:10px">20 🪙</span>';

        genLyricsBtn.addEventListener('click', async () => {
            if (!aiTheme.value.trim()) return alert('Escribe el tema de la letra.');

            genLyricsBtn.disabled = true;
            genLyricsBtn.textContent = 'Generando...';

            try {
                const token = await currentUser.getIdToken();
                const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);
                const isAdmin = await checkBalanceForUx(userRef, COSTS.LYRICS_GENERATE);

                const lyricsPrompt = `You are a professional songwriter. Write song lyrics in Spanish for a ${currentArtist?.genre || 'pop'} song. Theme: ${aiTheme.value}. Style: ${currentArtist?.style || ''}. Structure: [Verso 1], [Coro], [Verso 2], [Coro], [Bridge], [Outro]. IMPORTANT: Output ONLY the song lyrics. No introductions, no explanations, no apologies, no comments before or after. Start directly with [Verso 1].`;

                const res = await callMuapi('gpt-5-mini', { prompt: lyricsPrompt }, token);

                const rid = getRequestId(res) || res.id;
                let text = extractTextResult(res);

                if (!text && rid) {
                    const p = await pollResult(rid, token, null, 60, 3000);
                    text = extractTextResult(p.data) || extractTextResult(p) || p.url;
                }

                if (!text) throw new Error('No se pudo generar la letra.');

                lyricsTextarea.value = text;
                await deduct(userRef, COSTS.LYRICS_GENERATE, isAdmin);
                lyricsTextarea.style.borderColor = '#f59e0b';
                lyricsTextarea.style.boxShadow = '0 0 12px rgba(245,158,11,.2)';
                setTimeout(() => {
                    lyricsTextarea.style.borderColor = '#2a2a2a';
                    lyricsTextarea.style.boxShadow = 'none';
                }, 3000);
            } catch (e) {
                alert(e.message);
            } finally {
                genLyricsBtn.disabled = false;
                genLyricsBtn.innerHTML = 'Generar Letra <span style="opacity:.6;font-size:10px">20 🪙</span>';
            }
        });

        aiPanel.appendChild(aiTheme);
        aiPanel.appendChild(genLyricsBtn);
        lyricsSection.appendChild(aiPanel);
        container.appendChild(lyricsSection);

        if (currentArtist?.voiceId || currentArtist?.voiceStyle) {
            const vi = document.createElement('div');
            vi.style.cssText = 'background:#f59e0b11;border:1px solid #f59e0b33;border-radius:10px;padding:9px 13px;font-size:12px;color:#f59e0b';
            vi.innerHTML = currentArtist.voiceId ? `🎤 Voz clonada de <strong>${currentArtist.name}</strong>` : `🎤 Estilo vocal: "${currentArtist.voiceStyle}"`;
            container.appendChild(vi);
        }

        appendGenBtn(container, 'Crear canción', getCurrentSongCost, async (token, userRef, isAdmin, currentCost) => {
            const title  = container.querySelector('#song-title-input')?.value?.trim();
            const style  = container.querySelector('#song-style-input')?.value?.trim() || `${currentArtist?.genre || ''} ${currentArtist?.style || ''}`.trim();
            const lyrics = container.querySelector('#song-lyrics-input')?.value?.trim();
            const isInstrumental = songType === 'instrumental';

            const durationSel = container.querySelector('#song-duration-select');
            const duration = durationSel ? parseInt(durationSel.value) : 120;

            let songPrompt = '';

            if (!isInstrumental && lyrics) {
                songPrompt = lyrics;
            } else {
                songPrompt = isInstrumental ? `${style} instrumental track` : `${style} song`;
            }

            const params = {
                model: 'V5',
                custom_mode: true,
                prompt: songPrompt,
                style: style || `${currentArtist?.genre || ''} ${currentArtist?.style || ''}`.trim(),
                title: title || `${currentArtist?.name || 'Canción'} - Sin título`,
                instrumental: isInstrumental,
                style_weight: 0.65,
                weirdness_constraint: 0.5,
                audio_weight: 0.65,
            };

            if (duration) params.duration = duration;

            if (!isInstrumental) {
                if (currentArtist?.voiceId) {
                    params.persona_id = currentArtist.voiceId;
                } else if (currentArtist?.sunoSongId) {
                    params.song_id = currentArtist.sunoSongId;
                }

                if (currentArtist?.voiceStyle && !currentArtist?.voiceId) {
                    params.style += `, ${currentArtist.voiceStyle}`;
                }
            }

            if (currentArtist?._refSongUrl) {
                params.audio_url = currentArtist._refSongUrl;
                if (!lyrics && currentArtist._refSongLyrics) {
                    params.prompt = currentArtist._refSongLyrics;
                }
                delete currentArtist._refSongUrl;
                delete currentArtist._refSongLyrics;
            }

            const res = await callMuapi('suno-create-music', params, token);
            const rid = getRequestId(res) || res.id;

            let urls = extractUrls(res);
            let pollData = null;

            if (!urls.length && rid) {
                const cb = container._progressCallback;
                const p  = await pollResult(rid, token, cb, 90, 3000);
                urls     = p.urls || (p.url ? [p.url] : []);
                pollData = p.data;
            }

            if (!urls.length) throw new Error('No se recibió URL de la canción.');

            await deduct(userRef, currentCost, isAdmin);

            const sunoSongId = res?.id || res?.song_id || pollData?.id || pollData?.song_id || null;

            if (sunoSongId && !currentArtist.sunoSongId) {
                try {
                    await updateDoc(
                        doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id),
                        { sunoSongId }
                    );
                    currentArtist.sunoSongId = sunoSongId;
                } catch {}
            }

            await saveSongResults(urls, params.title, 'suno-create-music', lyrics);
            showSongResult(urls, params.title, container);

            const sg = document.querySelector('#km-songs-grid');
            if (sg) loadSongs(sg);
        });
    }

    async function saveSong(url, title, tool, lyrics) {
        if (!currentArtist || !currentUser) return;

        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'songs'), {
            title: title || 'Canción',
            url,
            tool,
            lyrics: lyrics || null,
            createdAt: serverTimestamp(),
        });
    }

    async function saveSongResults(urls, title, tool, lyrics) {
        const list = Array.isArray(urls) ? urls : [urls];

        for (let i = 0; i < list.length; i++) {
            const suffix = list.length > 1 ? ` - opción ${i + 1}` : '';
            await saveSong(list[i], `${title || 'Canción'}${suffix}`, tool, lyrics);
        }
    }

    function showSongResult(urlOrUrls, title, container) {
        const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];

        const card = document.createElement('div');
        card.className = 'km-card';
        card.style.cssText = 'background:#1a1a1a;border:1px solid #f59e0b44;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px';
        card.innerHTML = `<p style="color:#f59e0b;font-size:12px;font-weight:700;margin:0">✓ ${urls.length > 1 ? `${urls.length} opciones generadas` : (title || 'Resultado')}</p>`;

        urls.forEach((url, index) => {
            if (urls.length > 1) {
                const lbl = document.createElement('p');
                lbl.style.cssText = 'color:#888;font-size:10px;font-weight:700;margin:0';
                lbl.textContent = `Opción ${index + 1}`;
                card.appendChild(lbl);
            }

            const audio = document.createElement('audio');
            audio.controls = true;
            audio.src = url;
            audio.style.cssText = 'width:100%;accent-color:#f59e0b;border-radius:8px';
            card.appendChild(audio);

            const dlBtn = document.createElement('button');
            dlBtn.type = 'button';
            dlBtn.style.cssText = 'background:#f59e0b;border:none;border-radius:100px;padding:7px 16px;color:#000;font-size:11px;font-weight:700;cursor:pointer;width:fit-content';
            dlBtn.textContent = `↓ Descargar${urls.length > 1 ? ` opción ${index + 1}` : ''}`;

            dlBtn.addEventListener('click', async () => {
                try {
                    const blob = await fetch(url).then(r => r.blob());
                    const a = Object.assign(document.createElement('a'), {
                        href: URL.createObjectURL(blob),
                        download: `${title || 'kreatemusic'}-${index + 1}.mp3`,
                    });
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } catch {
                    window.open(url, '_blank');
                }
            });

            card.appendChild(dlBtn);
        });

        const genBtn = container.querySelector('button[style*="f59e0b"]');
        if (genBtn) container.insertBefore(card, genBtn);
        else container.appendChild(card);
    }

    async function loadSongs(container) {
        if (!currentArtist || !currentUser) return;

        container.innerHTML = '';

        try {
            const q = query(
                collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'songs'),
                orderBy('createdAt', 'desc'),
                limit(20)
            );

            const snap = await getDocs(q);

            if (snap.empty) {
                container.innerHTML = '<p style="color:#555;font-size:12px;text-align:center;padding:16px">Sin canciones aún</p>';
                return;
            }

            snap.forEach(d => {
                const song = { id: d.id, ...d.data() };

                const card = document.createElement('div');
                card.className = 'km-card';
                card.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px';

                const titleRow = document.createElement('div');
                titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';

                const titleEl = document.createElement('p');
                titleEl.style.cssText = 'color:#fff;font-size:12px;font-weight:700;margin:0;flex:1';
                titleEl.textContent = song.title || 'Canción';
                titleRow.appendChild(titleEl);
                card.appendChild(titleRow);

                if (song.url) {
                    const audio = document.createElement('audio');
                    audio.controls = true;
                    audio.src = song.url;
                    audio.style.cssText = 'width:100%;accent-color:#f59e0b;border-radius:8px';
                    card.appendChild(audio);

                    if (song.lyrics) {
                        const lyricsBox = document.createElement('div');
                        lyricsBox.style.cssText = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden';

                        const lyricsToggleBtn = document.createElement('button');
                        lyricsToggleBtn.type = 'button';
                        lyricsToggleBtn.style.cssText = 'width:100%;padding:7px 12px;background:none;border:none;color:#888;font-size:10px;font-weight:700;cursor:pointer;text-align:left;display:flex;align-items:center;justify-content:space-between';
                        lyricsToggleBtn.innerHTML = '<span>✍️ Ver / editar letra</span><span id="lyr-arrow">▼</span>';

                        const lyricsContent = document.createElement('div');
                        lyricsContent.style.cssText = 'display:none;padding:10px 12px;flex-direction:column;gap:8px';

                        const lyricsTA = document.createElement('textarea');
                        lyricsTA.value = song.lyrics;
                        lyricsTA.rows = 8;
                        lyricsTA.style.cssText = 'width:100%;background:transparent;border:none;color:#ccc;font-size:11px;font-family:monospace;line-height:1.6;resize:vertical;outline:none;box-sizing:border-box';

                        const saveLyricsBtn = document.createElement('button');
                        saveLyricsBtn.type = 'button';
                        saveLyricsBtn.style.cssText = 'padding:5px 12px;background:#f59e0b22;border:1px solid #f59e0b66;border-radius:100px;color:#f59e0b;font-size:10px;font-weight:700;cursor:pointer;width:fit-content';
                        saveLyricsBtn.textContent = '💾 Guardar letra';

                        saveLyricsBtn.addEventListener('click', async () => {
                            try {
                                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'songs', song.id), { lyrics: lyricsTA.value });
                                song.lyrics = lyricsTA.value;
                                saveLyricsBtn.textContent = '✓ Guardada';
                                setTimeout(() => { saveLyricsBtn.textContent = '💾 Guardar letra'; }, 2000);
                            } catch(e) {
                                alert('Error: ' + e.message);
                            }
                        });

                        lyricsContent.appendChild(lyricsTA);
                        lyricsContent.appendChild(saveLyricsBtn);
                        lyricsBox.appendChild(lyricsToggleBtn);
                        lyricsBox.appendChild(lyricsContent);
                        card.appendChild(lyricsBox);

                        let lyricsOpen = false;
                        lyricsToggleBtn.addEventListener('click', () => {
                            lyricsOpen = !lyricsOpen;
                            lyricsContent.style.display = lyricsOpen ? 'flex' : 'none';
                            const arrow = lyricsToggleBtn.querySelector('#lyr-arrow');
                            if (arrow) arrow.textContent = lyricsOpen ? '▲' : '▼';
                        });
                    }

                    const actionsRow = document.createElement('div');
                    actionsRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';

                    const dlBtn2 = document.createElement('button');
                    dlBtn2.type = 'button';
                    dlBtn2.style.cssText = 'padding:5px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:100px;color:#888;font-size:10px;font-weight:700;cursor:pointer';
                    dlBtn2.textContent = '↓ Descargar';

                    dlBtn2.addEventListener('click', async () => {
                        try {
                            const blob = await fetch(song.url).then(r => r.blob());
                            const a = Object.assign(document.createElement('a'), {
                                href: URL.createObjectURL(blob),
                                download: `${song.title || 'kreatemusic'}.mp3`,
                            });
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        } catch {
                            window.open(song.url, '_blank');
                        }
                    });

                    const extBtn = document.createElement('button');
                    extBtn.type = 'button';
                    extBtn.style.cssText = 'padding:5px 12px;background:#f59e0b22;border:1px solid #f59e0b66;border-radius:100px;color:#f59e0b;font-size:10px;font-weight:700;cursor:pointer';
                    extBtn.innerHTML = '➕ Extender <span style="opacity:.7">20 🪙</span>';

                    const extPanel = document.createElement('div');
                    extPanel.style.cssText = 'display:none;flex-direction:column;gap:8px;padding:10px;background:#111;border:1px solid #2a2a2a;border-radius:10px';
                    extPanel.innerHTML = '<p style="color:#888;font-size:10px;margin:0">¿Qué quieres añadir en la extensión?</p>';

                    const extPromptInput = document.createElement('input');
                    extPromptInput.placeholder = 'Ej: añade un puente con más energía, termina con fade out...';
                    extPromptInput.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:8px 12px;color:#fff;font-size:12px;outline:none;font-family:inherit;transition:border-color .15s';

                    const extConfirmBtn = document.createElement('button');
                    extConfirmBtn.type = 'button';
                    extConfirmBtn.style.cssText = 'padding:7px 16px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:11px;font-weight:700;cursor:pointer;width:fit-content';
                    extConfirmBtn.textContent = 'Extender canción';

                    extConfirmBtn.addEventListener('click', async () => {
                        extConfirmBtn.disabled = true;
                        extConfirmBtn.textContent = 'Generando...';

                        try {
                            const token = await currentUser.getIdToken();
                            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);
                            const isAdmin = await checkBalanceForUx(userRef, COSTS.SONG_EXTEND);

                            const extPrompt = extPromptInput.value.trim() || 'Continue the song maintaining the same style and energy';

                            const res = await callMuapi('suno-extend-music', {
                                audio_url: song.url,
                                prompt: extPrompt,
                                model: 'V5',
                            }, token);

                            const rid = getRequestId(res) || res.id;
                            let url = res.url || res.audio_url;

                            if (!url && rid) {
                                const p = await pollResult(rid, token, null, 90, 3000);
                                url = p.url;
                            }

                            if (!url) throw new Error('No se recibió URL.');

                            await deduct(userRef, COSTS.SONG_EXTEND, isAdmin);
                            await saveSong(url, `${song.title || 'Canción'} (ext.)`, 'suno-extend-music', null);

                            const extAudio = document.createElement('audio');
                            extAudio.controls = true;
                            extAudio.src = url;
                            extAudio.style.cssText = 'width:100%;accent-color:#f59e0b;border-radius:8px';
                            extPanel.parentNode.insertBefore(extAudio, extPanel);

                            extConfirmBtn.textContent = '✓ Extendida';
                            extPanel.style.display = 'none';
                            extBtn.style.opacity = '.4';

                            const sg = document.querySelector('#km-songs-grid');
                            if (sg) setTimeout(() => loadSongs(sg), 1000);
                        } catch(err) {
                            extConfirmBtn.disabled = false;
                            extConfirmBtn.textContent = 'Extender canción';
                            alert('Error: ' + err.message);
                        }
                    });

                    extPanel.appendChild(extPromptInput);
                    extPanel.appendChild(extConfirmBtn);

                    extBtn.addEventListener('click', () => {
                        const open = extPanel.style.display === 'flex';
                        extPanel.style.display = open ? 'none' : 'flex';
                        extBtn.style.borderColor = open ? '#f59e0b66' : '#f59e0b';
                    });

                    const refBtn = document.createElement('button');
                    refBtn.type = 'button';
                    refBtn.style.cssText = 'padding:5px 12px;background:#3b82f622;border:1px solid #3b82f666;border-radius:100px;color:#60a5fa;font-size:10px;font-weight:700;cursor:pointer';
                    refBtn.textContent = '🔁 Crear variación';

                    refBtn.addEventListener('click', () => {
                        if (currentArtist) {
                            currentArtist._refSongUrl = song.url;
                            currentArtist._refSongLyrics = song.lyrics || '';
                        }
                        alert('Baja al formulario de Crear canción. La canción seleccionada se usará como referencia de voz y estilo.');
                    });

                    actionsRow.appendChild(dlBtn2);
                    actionsRow.appendChild(extBtn);
                    actionsRow.appendChild(refBtn);
                    card.appendChild(actionsRow);
                    card.appendChild(extPanel);
                }

                container.appendChild(card);
            });
        } catch (e) {
            console.error('[KreateMusic] loadSongs:', e);
        }
    }

    // ============================================================
    // PANEL FOTOS
    // ============================================================
    function buildPhotosPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'flex-direction:column;overflow-y:auto;padding:20px;gap:14px;height:100%';

        const desc = document.createElement('p');
        desc.style.cssText = 'color:#888;font-size:12px;margin:0;flex-shrink:0';
        desc.textContent = 'Genera fotos del artista manteniendo el mismo rostro.';
        panel.appendChild(desc);

        let selectedAr = '1:1';

        const arLbl = document.createElement('p');
        arLbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0;flex-shrink:0';
        arLbl.textContent = 'Formato';
        panel.appendChild(arLbl);

        const arRow = document.createElement('div');
        arRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;flex-shrink:0';

        const AR_OPTIONS = [
            { value: '1:1', label: '1:1', sub: 'Cuadrado' },
            { value: '9:16', label: '9:16', sub: 'Vertical' },
            { value: '16:9', label: '16:9', sub: 'Landscape' },
        ];

        AR_OPTIONS.forEach(ar => {
            const card = document.createElement('div');
            const active = ar.value === selectedAr;
            card.className = 'km-ar-card';
            card.dataset.val = ar.value;
            card.style.cssText = `background:${active ? '#f59e0b22' : '#1a1a1a'};border:${active ? '2px solid #f59e0b' : '1px solid #2a2a2a'};border-radius:10px;padding:10px;cursor:pointer;text-align:center;transition:all .15s;box-shadow:${active ? '0 0 10px rgba(245,158,11,.15)' : 'none'}`;
            card.innerHTML = `<div style="color:${active ? '#f59e0b' : '#fff'};font-size:13px;font-weight:700">${ar.label}</div><div style="color:#555;font-size:10px">${ar.sub}</div>`;

            card.addEventListener('click', () => {
                selectedAr = ar.value;
                arRow.querySelectorAll('.km-ar-card').forEach(c => {
                    const a = c.dataset.val === ar.value;
                    c.style.background = a ? '#f59e0b22' : '#1a1a1a';
                    c.style.border     = a ? '2px solid #f59e0b' : '1px solid #2a2a2a';
                    c.style.boxShadow  = a ? '0 0 10px rgba(245,158,11,.15)' : 'none';
                    const lbl = c.querySelector('div:first-child');
                    if (lbl) lbl.style.color = a ? '#f59e0b' : '#fff';
                });
            });

            arRow.appendChild(card);
        });

        panel.appendChild(arRow);

        const SCENES = [
            { id: 'studio',  label: '🎙 Estudio',   prompt: 'in a professional recording studio with microphone, cinematic lighting' },
            { id: 'show',    label: '🎤 Concierto', prompt: 'performing on stage at a concert, dramatic stage lighting, crowd' },
            { id: 'social',  label: '📱 Redes',     prompt: 'casual lifestyle photo, natural light, social media style' },
            { id: 'fashion', label: '👗 Moda',      prompt: 'high fashion editorial photoshoot, luxury setting' },
            { id: 'street',  label: '🏙 Urbano',    prompt: 'urban street photography, city background, golden hour' },
            { id: 'coffee',  label: '☕ Cafetería', prompt: 'sitting at a cozy cafe, warm coffee shop lighting' },
            { id: 'custom',  label: '✏️ Custom',    prompt: '' },
        ];

        let selectedScene = SCENES[0];

        const sceneLbl = document.createElement('p');
        sceneLbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0;flex-shrink:0';
        sceneLbl.textContent = 'Escenario';
        panel.appendChild(sceneLbl);

        const sceneGrid = document.createElement('div');
        sceneGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px;flex-shrink:0';

        const customInput = document.createElement('input');
        customInput.placeholder = 'Describe el escenario...';
        customInput.style.cssText = 'display:none;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:9px 13px;color:#fff;font-size:12px;outline:none;font-family:inherit;flex-shrink:0';

        SCENES.forEach(scene => {
            const card = document.createElement('div');
            const active = scene.id === selectedScene.id;
            card.className = 'km-scene-card';
            card.dataset.sceneId = scene.id;
            card.style.cssText = `background:${active ? '#f59e0b22' : '#1a1a1a'};border:${active ? '2px solid #f59e0b' : '1px solid #2a2a2a'};border-radius:10px;padding:8px;cursor:pointer;font-size:10px;font-weight:700;color:${active ? '#f59e0b' : '#888'};text-align:center;transition:all .15s;box-shadow:${active ? '0 0 10px rgba(245,158,11,.15)' : 'none'}`;
            card.textContent = scene.label;

            card.addEventListener('click', () => {
                selectedScene = scene;

                sceneGrid.querySelectorAll('.km-scene-card').forEach(c => {
                    const a = c.dataset.sceneId === scene.id;
                    c.style.background = a ? '#f59e0b22' : '#1a1a1a';
                    c.style.border     = a ? '2px solid #f59e0b' : '1px solid #2a2a2a';
                    c.style.color      = a ? '#f59e0b' : '#888';
                    c.style.boxShadow  = a ? '0 0 10px rgba(245,158,11,.15)' : 'none';
                });

                customInput.style.display = scene.id === 'custom' ? 'block' : 'none';
            });

            sceneGrid.appendChild(card);
        });

        panel.appendChild(sceneGrid);
        panel.appendChild(customInput);

        const photosLbl = document.createElement('p');
        photosLbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0;flex-shrink:0';
        photosLbl.textContent = 'Fotos generadas';
        panel.appendChild(photosLbl);

        const photosGrid = document.createElement('div');
        photosGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px';
        panel.appendChild(photosGrid);
        loadPhotos(photosGrid);

        const photoProgressWrap = document.createElement('div');
        photoProgressWrap.style.cssText = 'display:none;flex-direction:column;gap:6px;flex-shrink:0';
        photoProgressWrap.innerHTML = '<div style="width:100%;background:#1a1a1a;border-radius:100px;height:4px;overflow:hidden;border:1px solid #2a2a2a"><div id="photo-prog-bar" style="height:100%;background:linear-gradient(90deg,#f59e0b,#fbbf24);border-radius:100px;width:0%;transition:width .5s ease"></div></div><p id="photo-prog-label" style="color:#888;font-size:11px;margin:0;text-align:center;font-family:monospace"></p>';

        const genPhotoBtn = document.createElement('button');
        genPhotoBtn.type = 'button';
        genPhotoBtn.style.cssText = 'width:100%;padding:12px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .15s';
        genPhotoBtn.innerHTML = 'Generar foto 2K <span style="background:rgba(0,0,0,.2);padding:2px 7px;border-radius:100px;font-size:11px;font-family:monospace">' + COSTS.PHOTO_EXTRA + ' 🪙</span>';

        genPhotoBtn.addEventListener('click', async () => {
            if (!currentArtist?.referencePhotoUrl) return alert('El artista no tiene foto de referencia.');
            if (!currentUser) return alert('Debes iniciar sesión.');

            genPhotoBtn.disabled = true;
            genPhotoBtn.innerHTML = '<div style="width:14px;height:14px;border:2px solid #00000033;border-top-color:#000;border-radius:50%;animation:spin 1s linear infinite"></div> Generando...';
            photoProgressWrap.style.display = 'flex';

            try {
                const token   = await currentUser.getIdToken();
                const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);
                const isAdmin = await checkBalanceForUx(userRef, COSTS.PHOTO_EXTRA);

                const scenePrompt = selectedScene.id === 'custom' ? customInput.value : selectedScene.prompt;
                const prompt = `Same person as in the reference image, ${scenePrompt}, maintain exact facial features, hair, skin tone, body. Only change background and scene. Hyperrealistic photography, 8K, Sony A7R V.`;

                const res = await callMuapi('nano-banana-2-edit', {
                    prompt,
                    images_list: [currentArtist.referencePhotoUrl],
                    aspect_ratio: selectedAr,
                    resolution: '2k',
                    output_format: 'jpg',
                }, token);

                const rid = getRequestId(res) || res.id;
                let photoUrl = res.url || res.output?.outputs?.[0];

                if (!photoUrl && rid) {
                    const result = await pollResult(rid, token, (pct, secs) => {
                        const bar   = photoProgressWrap.querySelector('#photo-prog-bar');
                        const label = photoProgressWrap.querySelector('#photo-prog-label');
                        if (bar) bar.style.width = pct + '%';
                        if (label) label.textContent = pct + '% · ' + Math.round(secs) + 's';
                    }, 60, 3000);
                    photoUrl = result.url;
                }

                if (!photoUrl) throw new Error('No se generó la foto.');

                await deduct(userRef, COSTS.PHOTO_EXTRA, isAdmin);

                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'photos'), {
                    url: photoUrl,
                    scene: selectedScene.id,
                    aspect_ratio: selectedAr,
                    createdAt: serverTimestamp(),
                });

                addPhotoCard(photoUrl, photosGrid, selectedAr);
            } catch (err) {
                alert('Error: ' + err.message);
            } finally {
                genPhotoBtn.disabled = false;
                genPhotoBtn.innerHTML = 'Generar foto 2K <span style="background:rgba(0,0,0,.2);padding:2px 7px;border-radius:100px;font-size:11px;font-family:monospace">' + COSTS.PHOTO_EXTRA + ' 🪙</span>';
                photoProgressWrap.style.display = 'none';
                const bar = photoProgressWrap.querySelector('#photo-prog-bar');
                if (bar) bar.style.width = '0%';
            }
        });

        panel.appendChild(photoProgressWrap);
        panel.appendChild(genPhotoBtn);

        return panel;
    }

    // ============================================================
    // PANEL VOZ
    // ============================================================
    function buildVoicePanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'flex-direction:column;overflow-y:auto;padding:20px;gap:14px;height:100%';

        const currentVoiceBox = document.createElement('div');
        currentVoiceBox.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px';
        currentVoiceBox.innerHTML = '<p style="color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0">Configuración actual</p>'
            + (currentArtist?.voiceId
                ? '<div style="background:#f59e0b11;border:1px solid #f59e0b33;border-radius:10px;padding:10px 13px;color:#f59e0b;font-size:12px">🎤 Voz clonada activa</div>'
                : currentArtist?.voiceStyle
                    ? '<div style="background:#3b82f611;border:1px solid #3b82f633;border-radius:10px;padding:10px 13px;color:#60a5fa;font-size:12px">🎵 Estilo vocal: "' + currentArtist.voiceStyle + '"</div>'
                    : '<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 13px;color:#555;font-size:12px">Sin voz configurada</div>');
        panel.appendChild(currentVoiceBox);

        const styleWrap = document.createElement('div');
        styleWrap.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px';
        styleWrap.innerHTML = '<p style="color:#fff;font-size:12px;font-weight:700;margin:0">Actualizar estilo vocal</p>';

        const styleInput = document.createElement('input');
        styleInput.value = currentArtist?.voiceStyle || '';
        styleInput.placeholder = 'Ej: voz femenina, grave, sensual, acento caribeño...';
        styleInput.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:9px 13px;color:#fff;font-size:12px;outline:none;font-family:inherit';

        const saveStyleBtn = document.createElement('button');
        saveStyleBtn.type = 'button';
        saveStyleBtn.style.cssText = 'padding:8px 18px;background:#3b82f6;border:none;border-radius:100px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;width:fit-content';
        saveStyleBtn.textContent = 'Guardar';

        saveStyleBtn.addEventListener('click', async () => {
            if (!currentUser || !currentArtist) return;

            try {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id), { voiceStyle: styleInput.value });
                currentArtist.voiceStyle = styleInput.value;
                saveStyleBtn.textContent = '✓ Guardado';
                setTimeout(() => { saveStyleBtn.textContent = 'Guardar'; }, 2000);
            } catch(e) {
                alert(e.message);
            }
        });

        styleWrap.appendChild(styleInput);
        styleWrap.appendChild(saveStyleBtn);
        panel.appendChild(styleWrap);

        const cloneWrap = document.createElement('div');
        cloneWrap.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px';
        cloneWrap.innerHTML = '<p style="color:#fff;font-size:12px;font-weight:700;margin:0">Clonar nueva voz <span style="background:#f59e0b22;color:#f59e0b;font-size:10px;padding:2px 7px;border-radius:100px;font-family:monospace">' + COSTS.CLONE_VOICE_LATER + ' 🪙</span></p><p style="color:#555;font-size:11px;margin:0">Sube o arrastra un audio de 10 a 30 segundos con voz clara.</p>';

        const vFileInput = document.createElement('input');
        vFileInput.type = 'file';
        vFileInput.accept = 'audio/*';
        vFileInput.style.display = 'none';

        let vFileUrl = null;

        const vUploadBtn = document.createElement('button');
        vUploadBtn.type = 'button';
        vUploadBtn.style.cssText = 'background:#0a0a0a;border:1px dashed #2a2a2a;border-radius:10px;padding:14px;color:#888;font-size:12px;cursor:pointer;width:100%;text-align:center;line-height:1.45';
        vUploadBtn.innerHTML = '🎙 Seleccionar audio o arrastrarlo aquí<br><span style="font-size:10px;color:#555">Recomendado: voz clara, sin música de fondo</span>';
        vUploadBtn.addEventListener('click', () => vFileInput.click());

        const handleLaterVoiceFile = async (file) => {
            if (!currentUser) return alert('Debes iniciar sesión.');
            vUploadBtn.textContent = 'Subiendo audio...';

            try {
                const token = await currentUser.getIdToken();
                vFileUrl = await uploadAudioFile(file, token);
                vUploadBtn.textContent = '✓ ' + file.name;
                vUploadBtn.style.borderColor = '#f59e0b66';
                vUploadBtn.style.color = '#f59e0b';
            } catch (err) {
                vFileUrl = null;
                vUploadBtn.innerHTML = '🎙 Seleccionar audio o arrastrarlo aquí<br><span style="font-size:10px;color:#555">Recomendado: voz clara, sin música de fondo</span>';
                vUploadBtn.style.borderColor = '#2a2a2a';
                vUploadBtn.style.color = '#888';
                alert(err.message);
            }
        };

        setupAudioDropZone({
            dropEl: vUploadBtn,
            inputEl: vFileInput,
            onFile: handleLaterVoiceFile,
        });

        const cloneBtn = document.createElement('button');
        cloneBtn.type = 'button';
        cloneBtn.style.cssText = 'padding:10px 20px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:12px;font-weight:700;cursor:pointer;width:fit-content';
        cloneBtn.textContent = 'Clonar voz';

        cloneBtn.addEventListener('click', async () => {
            if (!vFileUrl) return alert('Sube o arrastra un audio primero.');

            cloneBtn.disabled = true;
            cloneBtn.textContent = 'Clonando...';

            try {
                const token = await currentUser.getIdToken();
                const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);
                const isAdmin = await checkBalanceForUx(userRef, COSTS.CLONE_VOICE_LATER);

                const voiceId = await cloneVoiceFromUrl(vFileUrl, token);
                if (!voiceId) throw new Error('No se obtuvo voice_id.');

                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id), { voiceId });
                await deduct(userRef, COSTS.CLONE_VOICE_LATER, isAdmin);

                currentArtist.voiceId = voiceId;
                cloneBtn.textContent = '✓ Voz clonada';

                currentVoiceBox.innerHTML = '<p style="color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0">Configuración actual</p><div style="background:#f59e0b11;border:1px solid #f59e0b33;border-radius:10px;padding:10px 13px;color:#f59e0b;font-size:12px">🎤 Voz clonada activa</div>';
            } catch(err) {
                cloneBtn.disabled = false;
                cloneBtn.textContent = 'Clonar voz';
                alert('Error: ' + err.message);
            }
        });

        cloneWrap.appendChild(vFileInput);
        cloneWrap.appendChild(vUploadBtn);
        cloneWrap.appendChild(cloneBtn);
        panel.appendChild(cloneWrap);

        return panel;
    }

    function addPhotoCard(url, grid, ar) {
        const arMap = { '9:16': 'aspect-ratio:9/16', '16:9': 'aspect-ratio:16/9' };
        const arStyle = arMap[ar] || 'aspect-ratio:1';

        const card = document.createElement('div');
        card.className = 'km-card';
        card.style.cssText = arStyle + ';border-radius:10px;overflow:hidden;background:#1a1a1a;border:1px solid #2a2a2a;cursor:pointer';
        card.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover">';
        card.addEventListener('click', () => openAsBlob(url, 'kreateia-photo'));
        grid.prepend(card);
    }

    async function loadPhotos(grid) {
        if (!currentArtist || !currentUser) return;

        try {
            const q = query(
                collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'photos'),
                orderBy('createdAt', 'desc'),
                limit(30)
            );

            const snap = await getDocs(q);
            snap.forEach(d => addPhotoCard(d.data().url, grid, d.data().aspect_ratio || '1:1'));
        } catch (e) {
            console.error('[KreateMusic] loadPhotos:', e);
        }
    }

    async function loadArtists(user) {
        try {
            const q = query(
                collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'artists'),
                orderBy('createdAt', 'desc')
            );

            const snap = await getDocs(q);
            artists = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error('[KreateMusic] loadArtists:', e);
        }

        renderArtistList();
        showView('artistList');
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loadArtists(user);
        } else {
            currentUser = null;
            showView('auth');
        }
    });

    showView('auth');
    return root;
}
