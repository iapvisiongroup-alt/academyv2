import { auth, db, APP_ID } from '../lib/firebase.js';
import {
    collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc,
    query, orderBy, limit, serverTimestamp, writeBatch
, increment } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { createControlBtn, createDropdownSystem } from './dropdowns.js';

// ============================================================
// ABRIR IMAGEN COMO BLOB (oculta URL de MuAPI)
// ============================================================
async function openAsBlob(url) {
    try {
        const blob    = await fetch(url).then(r => r.blob());
        const blobUrl = URL.createObjectURL(blob);
        // Abre en nueva pestaña sin descargar — URL oculta
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } catch {
        window.open(url, '_blank');
    }
}

// ============================================================
// PRECIOS — 1 CR = $0.01
// ============================================================
const COSTS = {
    CREATE_ARTIST:          30,   // foto inicial nano-banana-2
    CREATE_ARTIST_VOICE:    80,   // foto inicial + clonar voz
    CLONE_VOICE_LATER:      50,   // clonar voz dentro del perfil
    PHOTO_EXTRA:            12,   // foto adicional nano-banana-2-edit
    SONG_CREATE:            20,   // suno-create-music
    SONG_EXTEND:            20,
    SONG_REMIX:             20,
    SONG_ADD_VOCALS:        20,
    SONG_ADD_INSTRUMENTAL:  20,
    SONG_MASHUP:            20,
    LYRICS_GENERATE:        20,   // gpt-5-mini
    SOUNDS_GENERATE:         4,
};

// ============================================================
// HELPERS
// ============================================================

async function callMuapi(endpoint, params, token) {
    const resp = await fetch(`/api/v1/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(params)
    });
    if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Error (${resp.status}): ${t.slice(0, 300)}`);
    }
    return resp.json();
}

async function pollResult(requestId, token, onProgress, maxAttempts = 90, interval = 3000) {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, interval));
        const pct = Math.min(95, Math.round(((i + 1) / maxAttempts) * 100));
        if (onProgress) onProgress(pct, i * interval / 1000);
        try {
            const resp = await fetch(`/api/v1/predictions/${requestId}/result`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!resp.ok) {
                if (resp.status >= 500) continue;
                const errBody = await resp.json().catch(() => ({}));
                const errMsg = errBody?.detail?.error || errBody?.error || errBody?.message || '';
                // Detectar errores de copyright/contenido
                if (resp.status === 400 || resp.status === 422) {
                    if (errMsg.toLowerCase().includes('copyright') || errMsg.toLowerCase().includes('content') || errMsg.toLowerCase().includes('policy') || errMsg.toLowerCase().includes('violation')) {
                        throw new Error('⚠️ La letra contiene contenido protegido por copyright o infringe las políticas de Suno. Por favor edita la letra e inténtalo de nuevo.');
                    }
                    throw new Error(`Error de contenido: ${errMsg || resp.status}. Revisa la letra e inténtalo de nuevo.`);
                }
                throw new Error(`Poll ${resp.status}: ${errMsg}`);
            }
            const data = await resp.json();
            const status = (data.status || data.output?.status || data?.detail?.status || '').toLowerCase();
            const errDetail = data?.detail?.error || data.error || data.output?.error || '';
            if (errDetail.toLowerCase().includes('copyright') || errDetail.toLowerCase().includes('violation')) {
                throw new Error('⚠️ La letra contiene contenido protegido por copyright. Por favor edita la letra e inténtalo de nuevo.');
            }
            const url = data.output?.outputs?.[0] || data.outputs?.[0] || data.url
                     || data.audio_url || data.output?.url || data.image_url;
            if (url) return { url, data };
            if (status === 'failed' || status === 'error')
                throw new Error(errDetail || 'La generación falló. Revisa el contenido e inténtalo de nuevo.');
        } catch (e) { if (i >= maxAttempts - 1) throw e; }
    }
    throw new Error('Tiempo de espera agotado.');
}

async function checkAndDeduct(userRef, cost, isAdmin = false) {
    const snap = await getDoc(userRef);
    const credits = snap.exists() ? (snap.data().credits || 0) : 0;
    const admin   = snap.exists() && snap.data().role === 'admin';
    if (!admin && credits < cost) throw new Error(`Saldo insuficiente. Necesitas ${cost} 🪙 y tienes ${credits} 🪙.`);
    return admin;
}

async function deduct(userRef, cost, isAdmin) {
    if (!isAdmin && cost > 0) {
        await updateDoc(userRef, { credits: increment(-cost) });
    }
}

// Inject keyframes once
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


// Extrae texto de la respuesta de suno-generate-lyrics (cubre todas las estructuras posibles)
function extractTextResult(res) {
    if (!res) return null;
    // Schema real suno-generate-lyrics: output.outputs[0] contiene el texto
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
// PROGRESS OVERLAY — visual estilo Higgsfield
// ============================================================
function createProgressOverlay({ title, steps }) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.92);backdrop-filter:blur(20px);
        z-index:99999;display:flex;flex-direction:column;align-items:center;
        justify-content:center;gap:28px;padding:32px;
    `;

    // Animated rings
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

    // Progress bar
    const barWrap = document.createElement('div');
    barWrap.style.cssText = 'width:300px;background:#1a1a1a;border-radius:100px;height:6px;overflow:hidden;border:1px solid #2a2a2a;position:relative';
    barWrap.innerHTML = `<div id="km-prog-bar" style="height:100%;background:linear-gradient(90deg,#f59e0b,#fbbf24);border-radius:100px;width:0%;transition:width .6s ease"></div>`;

    const pctLabel = document.createElement('p');
    pctLabel.id = 'km-prog-pct';
    pctLabel.style.cssText = 'color:#555;font-size:12px;margin:0;font-family:monospace';
    pctLabel.textContent = '0%';

    // Preview image slot
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
    root.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;background:#050505;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif';

    let currentUser   = null;
    let currentArtist = null;
    let artists       = [];

    const dd = createDropdownSystem();

    // Views map
    const views = {};
    const showView = (name) => {
        Object.values(views).forEach(v => { v.style.display = 'none'; });
        if (views[name]) views[name].style.display = 'flex';
    };

    // ── AUTH GUARD ──
    const authGuard = document.createElement('div');
    authGuard.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#fff';
    authGuard.innerHTML = `<div style="font-size:40px">🎵</div><p style="color:#888;font-size:14px">Inicia sesión para usar KreateMusic</p>`;
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

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;flex-shrink:0';
        const titleEl = document.createElement('div');
        titleEl.innerHTML = '<h1 style="color:#fff;font-size:22px;font-weight:900;margin:0">KreateMusic</h1><p style="color:#555;font-size:12px;margin:4px 0 0">Tus artistas de IA</p>';

        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.style.cssText = 'display:flex;align-items:center;gap:6px;padding:10px 18px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:13px;font-weight:700;cursor:pointer';
        newBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg> Nuevo artista`;
        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            renderCreateArtist();
            showView('createArtist');
        });
        header.appendChild(titleEl);
        header.appendChild(newBtn);
        artistListView.appendChild(header);

        if (artists.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center';
            empty.innerHTML = '<div style="font-size:56px;opacity:.2">🎤</div><p style="color:#fff;font-size:16px;font-weight:700;margin:0">Sin artistas aún</p><p style="color:#555;font-size:13px;margin:0">Crea tu primer artista de IA</p>';
            artistListView.appendChild(empty);
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

            // Delete button
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.style.cssText = 'position:absolute;top:8px;right:8px;width:26px;height:26px;background:rgba(0,0,0,.7);border:1px solid #333;border-radius:8px;color:#888;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;backdrop-filter:blur(4px);transition:all .15s;opacity:0';
            delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`;
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const ok = await confirmDialog(
                    `Eliminar a ${artist.name}`,
                    '⚠️ Esta acción eliminará permanentemente el perfil del artista, todas sus fotos y todas sus canciones. Esta acción no se puede deshacer.',
                    'Eliminar todo', true
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

        artistListView.appendChild(grid);
    }

    async function deleteArtist(artist) {
        if (!currentUser) return;
        const prog = createProgressOverlay({ title: `Eliminando a ${artist.name}...`, steps: [{ icon: '🗑️', label: 'Eliminando canciones...' }, { icon: '📸', label: 'Eliminando fotos...' }, { icon: '💀', label: 'Eliminando perfil...' }] });
        document.body.appendChild(prog.el);
        try {
            const uid     = currentUser.uid;
            const artistRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', uid, 'artists', artist.id);

            // Delete songs
            prog.update(20, 'Eliminando canciones...');
            const songsSnap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', uid, 'artists', artist.id, 'songs'));
            const batch1 = writeBatch(db);
            songsSnap.forEach(d => batch1.delete(d.ref));
            await batch1.commit();

            // Delete photos
            prog.update(60, 'Eliminando fotos...');
            const photosSnap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', uid, 'artists', artist.id, 'photos'));
            const batch2 = writeBatch(db);
            photosSnap.forEach(d => batch2.delete(d.ref));
            await batch2.commit();

            // Delete artist doc
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
    // VIEW: CREAR ARTISTA
    // ============================================================
    const createArtistView = document.createElement('div');
    createArtistView.style.cssText = 'flex:1;flex-direction:column;overflow-y:auto;padding:24px;gap:16px;display:none;max-width:600px;margin:0 auto;width:100%';
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
        titleEl.innerHTML = '<h2 style="color:#fff;font-size:18px;font-weight:900;margin:0">Crear nuevo artista</h2><p style="color:#555;font-size:12px;margin:4px 0 0">Cuesta <strong style="color:#f59e0b">30 🪙</strong> (o <strong style="color:#f59e0b">80 🪙</strong> si clonas voz)</p>';
        createArtistView.appendChild(titleEl);

        const formData = {};

        const fields = [
            { id: 'name',      label: 'Nombre del artista *',    placeholder: 'Ej: Luna Reyes',                         required: true },
            { id: 'genre',     label: 'Género musical',          placeholder: 'Ej: Reggaeton, Pop, R&B...' },
            { id: 'style',     label: 'Estilo / Vibe',           placeholder: 'Ej: Oscuro y elegante, Urbano, Fresco...' },
            { id: 'ethnicity', label: 'Etnia / Origen',          placeholder: 'Ej: Latina, Africana, Asiática...' },
            { id: 'age',       label: 'Edad aproximada',         placeholder: 'Ej: 25' },
            { id: 'gender',    label: 'Género',                  placeholder: 'Ej: Mujer, Hombre...' },
            { id: 'build',     label: 'Complexión',              placeholder: 'Ej: Atlética, Delgada, Curvilínea...' },
            { id: 'outfit',    label: 'Vestimenta / Estética',   placeholder: 'Ej: Streetwear, Elegante...' },
            { id: 'extra',     label: 'Detalles extra',          placeholder: 'Tatuajes, color de pelo, accesorios...',  textarea: true },
        ];

        fields.forEach(f => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px';
            const lbl = document.createElement('label');
            lbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
            lbl.textContent = f.label;
            wrap.appendChild(lbl);
            const input = f.textarea ? document.createElement('textarea') : document.createElement('input');
            input.type = 'text';
            input.placeholder = f.placeholder;
            input.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:9px 13px;color:#fff;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s';
            if (f.textarea) { input.rows = 2; input.style.resize = 'none'; }
            input.addEventListener('focus', () => input.style.borderColor = '#f59e0b66');
            input.addEventListener('blur',  () => input.style.borderColor = '#2a2a2a');
            input.addEventListener('input', () => { formData[f.id] = input.value; });
            wrap.appendChild(input);
            createArtistView.appendChild(wrap);
        });

        // VOZ
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

        const styleCard = makeVoiceCard('✍️', 'Estilo textual', 'Describe la voz', '+0 🪙', 'style');
        const cloneCard = makeVoiceCard('🎙', 'Clonar voz real', 'Audio de 10s', '+50 🪙', 'clone');

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
        };

        styleCard.addEventListener('click', () => setVoiceMode('style'));
        cloneCard.addEventListener('click', () => setVoiceMode('clone'));
        vtRow.appendChild(styleCard);
        vtRow.appendChild(cloneCard);
        voiceBox.appendChild(vtRow);

        const stylePanel = document.createElement('div');
        stylePanel.style.cssText = 'display:flex;flex-direction:column;gap:6px';
        const styleInput = document.createElement('input');
        styleInput.placeholder = 'Ej: voz femenina, grave, sensual, acento latino...';
        styleInput.style.cssText = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;padding:9px 13px;color:#fff;font-size:13px;outline:none;font-family:inherit';
        styleInput.addEventListener('input', () => { formData.voiceStyle = styleInput.value; });
        stylePanel.appendChild(styleInput);
        voiceBox.appendChild(stylePanel);

        const clonePanel = document.createElement('div');
        clonePanel.style.cssText = 'display:none;flex-direction:column;gap:6px';
        const voiceFileInput = document.createElement('input');
        voiceFileInput.type = 'file'; voiceFileInput.accept = 'audio/*'; voiceFileInput.style.display = 'none';
        let voiceFileUrl = null;
        const voiceUploadBtn = document.createElement('button');
        voiceUploadBtn.type = 'button';
        voiceUploadBtn.style.cssText = 'background:#0a0a0a;border:1px dashed #2a2a2a;border-radius:10px;padding:12px;color:#888;font-size:12px;cursor:pointer;width:100%;text-align:center';
        voiceUploadBtn.textContent = '🎙 Seleccionar audio (10s)';
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
            } catch (err) { voiceUploadBtn.textContent = '🎙 Seleccionar audio (10s)'; alert(err.message); }
        });
        clonePanel.appendChild(voiceFileInput);
        clonePanel.appendChild(voiceUploadBtn);
        voiceBox.appendChild(clonePanel);
        createArtistView.appendChild(voiceBox);

        // CREATE BUTTON
        const totalCostEl = document.createElement('p');
        totalCostEl.style.cssText = 'color:#555;font-size:12px;text-align:center;margin:0';
        totalCostEl.textContent = 'Coste total: 30 🪙';

        // Update cost display when voice mode changes
        const origSetVoiceMode = setVoiceMode;
        styleCard.addEventListener('click', () => { totalCostEl.textContent = 'Coste total: 30 🪙'; });
        cloneCard.addEventListener('click', () => { totalCostEl.textContent = 'Coste total: 80 🪙'; });

        const createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.style.cssText = 'width:100%;padding:13px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:40px';
        createBtn.textContent = 'Crear artista y generar fotos ✨';

        createBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!formData.name?.trim()) return alert('El nombre del artista es obligatorio.');
            if (!currentUser) return alert('Debes iniciar sesión.');

            const cost = voiceMode === 'clone' ? COSTS.CREATE_ARTIST_VOICE : COSTS.CREATE_ARTIST;
            const token = await currentUser.getIdToken();
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);

            let isAdmin;
            try { isAdmin = await checkAndDeduct(userRef, cost); } catch (e) { return alert(e.message); }

            createBtn.disabled = true;

            const STEPS = [
                { icon: '🎨', label: 'Analizando descripción...' },
                { icon: '📸', label: 'Generando foto de estudio...' },
                { icon: '✨', label: 'Procesando detalles visuales...' },
                { icon: '🎤', label: 'Configurando perfil...' },
                { icon: '🚀', label: 'Últimos retoques...' },
            ];
            const prog = createProgressOverlay({ title: `Creando a ${formData.name}`, steps: STEPS });
            document.body.appendChild(prog.el);

            try {
                // Build hyperrealistic prompt
                const desc = [
                    formData.gender,
                    formData.age && `aged ${formData.age}`,
                    formData.ethnicity && `${formData.ethnicity} ethnicity`,
                    formData.build && `${formData.build} build`,
                    formData.outfit && `wearing ${formData.outfit}`,
                    formData.extra,
                ].filter(Boolean).join(', ');

                const studioPrompt = `Hyperrealistic professional music artist reference sheet, pure white seamless studio background, ${desc}, ${formData.style || 'contemporary'} aesthetic — photorealistic skin pores and texture, natural hair strands, true-to-life eye reflections, multiple poses: close-up portrait front, three-quarter body, full body standing, left profile, right profile — white studio, Sony A7R V 85mm f/1.4, 8K, Vogue editorial, no CGI, 100% photographic realism`;

                prog.update(5, 'Enviando al generador...');
                const initRes = await callMuapi('nano-banana-2', { prompt: studioPrompt, aspect_ratio: '1:1', resolution: '2k', output_format: 'jpg' }, token);
                const rid = initRes.request_id || initRes.id;
                let refPhotoUrl = initRes.url || initRes.output?.outputs?.[0];

                if (!refPhotoUrl && rid) {
                    const result = await pollResult(rid, token, (pct, secs) => {
                        prog.update(5 + Math.round(pct * 0.7), `Generando foto... ${Math.round(secs)}s`);
                    }, 60, 3000);
                    refPhotoUrl = result.url;
                }
                if (!refPhotoUrl) throw new Error('No se generó la foto de referencia.');

                prog.update(80, 'Foto generada ✓');

                // Clone voice if needed
                let voiceId = null;
                if (voiceMode === 'clone' && voiceFileUrl) {
                    prog.update(85, 'Clonando voz...');
                    try {
                        const cloneRes = await callMuapi('suno-voice-clone', { audio_url: voiceFileUrl }, token);
                        voiceId = cloneRes.voice_id || cloneRes.id;
                    } catch (e) { console.warn('Voice clone failed:', e.message); }
                }

                prog.update(92, 'Guardando en Firebase...');

                const artistData = {
                    name: formData.name.trim(), genre: formData.genre || '',
                    style: formData.style || '', ethnicity: formData.ethnicity || '',
                    age: formData.age || '', gender: formData.gender || '',
                    build: formData.build || '', outfit: formData.outfit || '',
                    extra: formData.extra || '', voiceStyle: voiceMode === 'style' ? (formData.voiceStyle || '') : '',
                    voiceId, referencePhotoUrl: refPhotoUrl, studioPrompt,
                    createdAt: serverTimestamp()
                };

                const artistsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists');
                const docRef = await addDoc(artistsRef, artistData);

                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', docRef.id, 'photos'), {
                    url: refPhotoUrl, scene: 'studio_reference', aspect_ratio: '1:1', createdAt: serverTimestamp()
                });

                await deduct(userRef, cost, isAdmin);

                prog.complete(refPhotoUrl);
                await new Promise(r => setTimeout(r, 1500));
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
    // VIEW: DASHBOARD DEL ARTISTA
    // ============================================================
    const artistDashboardView = document.createElement('div');
    artistDashboardView.style.cssText = 'flex:1;flex-direction:column;overflow:hidden;display:none';
    views.artistDashboard = artistDashboardView;
    root.appendChild(artistDashboardView);

    function renderArtistDashboard() {
        if (!currentArtist) return;
        artistDashboardView.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 20px;background:#111;border-bottom:1px solid #1f1f1f;flex-shrink:0';

        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;padding:4px;display:flex;align-items:center';
        backBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>`;
        backBtn.addEventListener('click', (e) => { e.stopPropagation(); renderArtistList(); showView('artistList'); });

        const thumb = document.createElement('div');
        thumb.style.cssText = 'width:44px;height:44px;border-radius:10px;overflow:hidden;background:#1a1a1a;flex-shrink:0;border:2px solid #f59e0b44';
        thumb.innerHTML = currentArtist.referencePhotoUrl
            ? `<img src="${currentArtist.referencePhotoUrl}" style="width:100%;height:100%;object-fit:cover">`
            : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px">🎤</div>';

        const info = document.createElement('div');
        info.innerHTML = `<p style="color:#fff;font-size:15px;font-weight:900;margin:0">${currentArtist.name}</p><p style="color:#555;font-size:11px;margin:2px 0 0">${[currentArtist.genre, currentArtist.style].filter(Boolean).join(' · ')}</p>`;

        // Tabs
        const TABS = [
            { id: 'music',  icon: '🎵', label: 'Música' },
            { id: 'photos', icon: '📸', label: 'Fotos' },
            { id: 'voice',  icon: '🎤', label: 'Voz' },
        ];
        let activeTab = 'music';
        const tabBar = document.createElement('div');
        tabBar.style.cssText = 'display:flex;gap:4px;margin-left:auto';

        const panels = {};
        TABS.forEach(tab => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = `padding:6px 12px;border-radius:100px;font-size:12px;font-weight:700;cursor:pointer;border:none;transition:all .15s;${tab.id === 'music' ? 'background:#f59e0b;color:#000' : 'background:#1a1a1a;color:#888'}`;
            btn.textContent = `${tab.icon} ${tab.label}`;
            btn.addEventListener('click', () => {
                activeTab = tab.id;
                tabBar.querySelectorAll('button').forEach((b, i) => {
                    b.style.background = TABS[i].id === tab.id ? '#f59e0b' : '#1a1a1a';
                    b.style.color      = TABS[i].id === tab.id ? '#000'    : '#888';
                });
                Object.entries(panels).forEach(([id, p]) => { p.style.display = id === tab.id ? 'flex' : 'none'; });
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
    // PANEL: MÚSICA
    // ============================================================
    function buildMusicPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = 'flex-direction:column;overflow-y:auto;padding:20px;gap:16px;height:100%';

        // Panel fijo — solo crear canción
        const toolPanelContainer = document.createElement('div');
        toolPanelContainer.style.cssText = 'display:flex;flex-direction:column;gap:12px';
        panel.appendChild(toolPanelContainer);
        buildCreateSongPanel(toolPanelContainer);

        // Songs history
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

    function renderToolPanel(toolId, container) {
        container.innerHTML = '';

        // ── CREAR CANCIÓN ──
        if (toolId === 'suno-create-music') {
            buildCreateSongPanel(container);
            return;
        }

        // ── GENERAR LETRA ──
        if (toolId === 'suno-generate-lyrics') {
            const cost = COSTS.LYRICS_GENERATE;
            appendField(container, 'Tema de la letra', 'Ej: amor, desamor, éxito, calle...', 'theme-input');
            appendGenBtn(container, `Generar letra`, cost, async (token, userRef, isAdmin) => {
                const theme = container.querySelector('#theme-input')?.value?.trim();
                if (!theme) throw new Error('Escribe el tema de la letra.');
                const prompt = `You are a professional songwriter. Write song lyrics in Spanish for a ${currentArtist?.genre || 'pop'} song. Theme: ${theme}. Style: ${currentArtist?.style || ''}. Structure: [Verso 1], [Coro], [Verso 2], [Coro], [Bridge], [Outro]. IMPORTANT: Output ONLY the lyrics. No introductions, no explanations, no apologies, no comments. Start directly with [Verso 1].`;
                const res = await callMuapi('gpt-5-mini', { prompt }, token);
                console.log('[suno-generate-lyrics] respuesta:', JSON.stringify(res).slice(0, 300));
                const rid = res.request_id || res.id;
                let text  = extractTextResult(res);
                if (!text && rid) {
                    const p = await pollResult(rid, token, null, 60, 3000);
                    text = extractTextResult(p.data) || extractTextResult(p) || p.url;
                }
                if (!text) throw new Error('No se generó la letra.');
                await deduct(userRef, cost, isAdmin);
                const box = document.createElement('pre');
                box.style.cssText = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;padding:12px;color:#fff;font-size:12px;white-space:pre-wrap;font-family:monospace;line-height:1.6;animation:fadeUp .3s ease';
                box.textContent = text;
                container.insertBefore(box, container.lastChild);
            });
            return;
        }

        // ── HERRAMIENTAS CON AUDIO ──
        const costMap = {
            'suno-extend-music':     COSTS.SONG_EXTEND,
            'suno-remix-music':      COSTS.SONG_REMIX,
            'suno-add-vocals':       COSTS.SONG_ADD_VOCALS,
            'suno-add-instrumental': COSTS.SONG_ADD_INSTRUMENTAL,
            'suno-generate-mashup':  COSTS.SONG_MASHUP,
            'suno-generate-sounds':  COSTS.SOUNDS_GENERATE,
        };
        const promptMap = {
            'suno-extend-music':     'Instrucciones para extender',
            'suno-remix-music':      'Nuevo estilo del remix',
            'suno-add-vocals':       'Estilo vocal deseado',
            'suno-add-instrumental': 'Descripción del instrumental',
            'suno-generate-mashup':  'Descripción del mashup',
            'suno-generate-sounds':  'Describe el efecto de sonido',
        };
        const cost = costMap[toolId] || 20;
        appendField(container, promptMap[toolId] || 'Prompt', '', 'generic-prompt', false, currentArtist ? `${currentArtist.genre || ''} ${currentArtist.style || ''}`.trim() : '');

        const needsAudio = ['suno-extend-music','suno-remix-music','suno-add-vocals','suno-add-instrumental','suno-generate-mashup'];
        let audioUrls = [];
        if (needsAudio.includes(toolId)) {
            const audioWrap = document.createElement('div');
            audioWrap.style.cssText = 'display:flex;flex-direction:column;gap:5px';
            const audioLbl = document.createElement('label');
            audioLbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
            audioLbl.textContent = toolId === 'suno-generate-mashup' ? 'Archivos de audio (hasta 5)' : 'Archivo de audio';
            const audioInput = document.createElement('input');
            audioInput.type = 'file'; audioInput.accept = 'audio/*';
            if (toolId === 'suno-generate-mashup') audioInput.multiple = true;
            audioInput.style.display = 'none';
            const audioBtn = document.createElement('button');
            audioBtn.type = 'button';
            audioBtn.style.cssText = 'background:#1a1a1a;border:1px dashed #2a2a2a;border-radius:10px;padding:12px;color:#888;font-size:12px;cursor:pointer;width:100%;text-align:center;transition:border-color .15s';
            audioBtn.textContent = '🎵 Seleccionar audio';
            audioBtn.addEventListener('click', () => audioInput.click());
            audioInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files).slice(0, 5);
                audioBtn.textContent = '⏳ Subiendo...';
                try {
                    const token = await currentUser.getIdToken();
                    audioUrls = await Promise.all(files.map(async f => {
                        const fd = new FormData(); fd.append('file', f);
                        const r = await fetch('/api/v1/upload_file', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
                        const d = await r.json(); return d.url || d.file_url;
                    }));
                    audioBtn.textContent = `✓ ${files.length} archivo(s)`;
                    audioBtn.style.borderColor = '#f59e0b66'; audioBtn.style.color = '#f59e0b';
                } catch (err) { audioBtn.textContent = '🎵 Seleccionar audio'; alert(err.message); }
            });
            audioWrap.appendChild(audioLbl); audioWrap.appendChild(audioBtn); audioWrap.appendChild(audioInput);
            container.appendChild(audioWrap);
        }

        appendGenBtn(container, 'Generar', cost, async (token, userRef, isAdmin) => {
            const prompt = container.querySelector('#generic-prompt')?.value?.trim() || '';
            const params = { prompt };
            if (audioUrls.length > 0) {
                if (toolId === 'suno-generate-mashup') params.audio_urls = audioUrls;
                else params.audio_url = audioUrls[0];
            }
            const res = await callMuapi(toolId, params, token);
            const rid = res.request_id || res.id;
            let url = res.url || res.audio_url;
            if (!url && rid) {
                const p = await pollResult(rid, token, null, 90, 3000);
                url = p.url;
            }
            if (!url) throw new Error('No se recibió URL del resultado.');
            await deduct(userRef, cost, isAdmin);
            await saveSong(url, prompt, toolId, null);
            showSongResult(url, prompt, container);
        });
    }

    // Helper: append text field
    function appendField(container, label, placeholder, id, textarea = false, defaultVal = '') {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px';
        const lbl = document.createElement('label');
        lbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
        lbl.textContent = label;
        const input = textarea ? document.createElement('textarea') : document.createElement('input');
        input.id = id; input.placeholder = placeholder;
        if (defaultVal) input.value = defaultVal;
        input.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:9px 13px;color:#fff;font-size:13px;outline:none;font-family:inherit;transition:border-color .15s';
        if (textarea) { input.rows = 3; input.style.resize = 'none'; }
        input.addEventListener('focus', () => input.style.borderColor = '#f59e0b66');
        input.addEventListener('blur',  () => input.style.borderColor = '#2a2a2a');
        wrap.appendChild(lbl); wrap.appendChild(input); container.appendChild(wrap);
    }

    // Helper: append generate button with inline progress
    function appendGenBtn(container, label, cost, onGenerate) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'width:100%;padding:12px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .15s';
        btn.innerHTML = `${label} <span style="background:rgba(0,0,0,.2);padding:2px 7px;border-radius:100px;font-size:11px;font-family:monospace">${cost} 🪙</span>`;
        btn.addEventListener('mouseenter', () => btn.style.background = '#fbbf24');
        btn.addEventListener('mouseleave', () => btn.style.background = '#f59e0b');

        // Inline progress bar under button
        const progressWrap = document.createElement('div');
        progressWrap.style.cssText = 'display:none;flex-direction:column;gap:6px';
        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'width:100%;background:#1a1a1a;border-radius:100px;height:4px;overflow:hidden;border:1px solid #2a2a2a';
        progressBar.innerHTML = '<div id="inline-bar" style="height:100%;background:linear-gradient(90deg,#f59e0b,#fbbf24);border-radius:100px;width:0%;transition:width .5s ease"></div>';
        const progressLabel = document.createElement('p');
        progressLabel.style.cssText = 'color:#888;font-size:11px;margin:0;text-align:center;font-family:monospace';
        progressLabel.textContent = '';
        progressWrap.appendChild(progressBar);
        progressWrap.appendChild(progressLabel);

        btn.addEventListener('click', async () => {
            if (!currentUser) return alert('Debes iniciar sesión.');
            btn.disabled = true;
            btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid #00000033;border-top-color:#000;border-radius:50%;animation:spin 1s linear infinite"></div> Generando...';
            progressWrap.style.display = 'flex';

            const token   = await currentUser.getIdToken();
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);

            try {
                const isAdmin = await checkAndDeduct(userRef, cost);
                // Inject progress callback into pollResult via onGenerate
                container._progressCallback = (pct, secs) => {
                    const bar = progressWrap.querySelector('#inline-bar');
                    if (bar) bar.style.width = `${pct}%`;
                    progressLabel.textContent = `${pct}% · ${Math.round(secs)}s`;
                };
                await onGenerate(token, userRef, isAdmin);
            } catch (err) {
                alert('Error: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = `${label} <span style="background:rgba(0,0,0,.2);padding:2px 7px;border-radius:100px;font-size:11px;font-family:monospace">${cost} 🪙</span>`;
                progressWrap.style.display = 'none';
                const bar = progressWrap.querySelector('#inline-bar');
                if (bar) bar.style.width = '0%';
            }
        });

        container.appendChild(btn);
        container.appendChild(progressWrap);
    }

    // ── BUILD CREATE SONG PANEL ──
    function buildCreateSongPanel(container) {
        const cost = COSTS.SONG_CREATE;

        appendField(container, 'Título de la canción', `Ej: ${currentArtist?.name || 'Mi artista'} - Sin título`, 'song-title-input');
        appendField(container, 'Estilo musical', 'Ej: Reggaeton, trap, melódico...', 'song-style-input', false,
            [currentArtist?.genre, currentArtist?.style].filter(Boolean).join(', '));

        // Duración
        const durWrap = document.createElement('div');
        durWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
        const durLbl = document.createElement('label');
        durLbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
        durLbl.textContent = 'Duración';
        const durRow = document.createElement('div');
        durRow.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px';
        const DURATIONS = [{val:30,label:'30s'},{val:60,label:'1 min'},{val:120,label:'2 min'},{val:180,label:'3 min'}];
        let selectedDur = 120;
        const durSelect = document.createElement('select');
        durSelect.id = 'song-duration-select';
        durSelect.style.display = 'none';
        durSelect.value = '120';
        DURATIONS.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.val; opt.textContent = d.label;
            if (d.val === 120) opt.selected = true;
            durSelect.appendChild(opt);
        });
        DURATIONS.forEach(d => {
            const card = document.createElement('div');
            const active = d.val === selectedDur;
            card.className = 'km-dur-card';
            card.dataset.val = d.val;
            card.style.cssText = `background:${active?'#f59e0b22':'#1a1a1a'};border:${active?'2px solid #f59e0b':'1px solid #2a2a2a'};border-radius:10px;padding:8px;cursor:pointer;text-align:center;font-size:12px;font-weight:700;color:${active?'#f59e0b':'#888'};transition:all .15s`;
            card.textContent = d.label;
            card.addEventListener('click', () => {
                selectedDur = d.val;
                durSelect.value = d.val;
                durRow.querySelectorAll('.km-dur-card').forEach(c => {
                    const a = parseInt(c.dataset.val) === d.val;
                    c.style.background = a?'#f59e0b22':'#1a1a1a';
                    c.style.border     = a?'2px solid #f59e0b':'1px solid #2a2a2a';
                    c.style.color      = a?'#f59e0b':'#888';
                });
            });
            durRow.appendChild(card);
        });
        durWrap.appendChild(durLbl);
        durWrap.appendChild(durRow);
        durWrap.appendChild(durSelect);
        container.appendChild(durWrap);

        // Song type
        const typeWrap = document.createElement('div');
        typeWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
        const typeLbl = document.createElement('label');
        typeLbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em';
        typeLbl.textContent = 'Tipo de canción';
        typeWrap.appendChild(typeLbl);

        let songType = 'vocals';
        const typeRow = document.createElement('div');
        typeRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px';

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

        const vocalsCard = makeTypeCard('🎤', 'Con voz', 'El artista canta', 'vocals');
        const instrCard  = makeTypeCard('🎸', 'Instrumental', 'Solo música', 'instrumental');
        typeRow.appendChild(vocalsCard);
        typeRow.appendChild(instrCard);
        typeWrap.appendChild(typeRow);
        container.appendChild(typeWrap);

        // Lyrics section
        const lyricsSection = document.createElement('div');
        lyricsSection.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;transition:opacity .2s';

        const lyricsHeader = document.createElement('div');
        lyricsHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between';

        const lyricsTitle = document.createElement('p');
        lyricsTitle.style.cssText = 'color:#fff;font-size:12px;font-weight:700;margin:0';
        lyricsTitle.textContent = '✍️ Letra de la canción';
        lyricsHeader.appendChild(lyricsTitle);
        lyricsSection.appendChild(lyricsHeader);

        // Variables necesarias para compatibilidad con el código de generación
        let lyricsMode = 'manual';
        const manualBtn = { style: { cssText: '' } }; // dummy
        const aiBtn = { style: { cssText: '' } };     // dummy

        const lyricsTextarea = document.createElement('textarea');
        lyricsTextarea.id = 'song-lyrics-input';
        lyricsTextarea.rows = 5;
        lyricsTextarea.placeholder = 'Escribe la letra de tu canción aquí...';
        lyricsTextarea.style.cssText = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;padding:9px 13px;color:#fff;font-size:12px;outline:none;font-family:monospace;resize:vertical;line-height:1.6;transition:border-color .15s';
        lyricsTextarea.addEventListener('focus', () => lyricsTextarea.style.borderColor = '#f59e0b66');
        lyricsTextarea.addEventListener('blur',  () => lyricsTextarea.style.borderColor = '#2a2a2a');

        // Fila: tema + botón generar letra (siempre visible)
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
            genLyricsBtn.textContent = '⏳ Generando...';
            try {
                const token = await currentUser.getIdToken();
                const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);
                const isAdmin = await checkAndDeduct(userRef, COSTS.LYRICS_GENERATE);
                const lyricsPrompt = `You are a professional songwriter. Write song lyrics in Spanish for a ${currentArtist?.genre || 'pop'} song. Theme: ${aiTheme.value}. Style: ${currentArtist?.style || ''}. Structure: [Verso 1], [Coro], [Verso 2], [Coro], [Bridge], [Outro]. IMPORTANT: Output ONLY the song lyrics. No introductions, no explanations, no apologies, no comments before or after. Start directly with [Verso 1].`;
                const res = await callMuapi('gpt-5-mini', { prompt: lyricsPrompt }, token);
                console.log('[suno-generate-lyrics lyrics] respuesta:', JSON.stringify(res).slice(0, 300));
                const rid = res.request_id || res.id;
                let text = extractTextResult(res);
                if (!text && rid) { const p = await pollResult(rid, token, null, 60, 3000); text = extractTextResult(p.data) || extractTextResult(p) || p.url; }
                if (text) {
                    // Rellenar textarea y mostrar panel manual
                    lyricsTextarea.value = text;
                    await deduct(userRef, COSTS.LYRICS_GENERATE, isAdmin);
                    lyricsMode = 'manual';
                    manualBtn.style.cssText = 'padding:3px 9px;background:#f59e0b22;border:1px solid #f59e0b66;border-radius:8px;color:#f59e0b;font-size:10px;font-weight:700;cursor:pointer';
                    aiBtn.style.cssText = 'padding:3px 9px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;color:#888;font-size:10px;font-weight:700;cursor:pointer';
                    // Mostrar textarea y ocultar panel IA
                    lyricsTextarea.style.display = 'block';
                    aiPanel.style.display = 'none';
                    // Resaltar recuadro para que el usuario vea que se llenó
                    lyricsTextarea.style.borderColor = '#f59e0b';
                    lyricsTextarea.style.boxShadow = '0 0 12px rgba(245,158,11,.2)';
                    setTimeout(() => {
                        lyricsTextarea.style.borderColor = '#2a2a2a';
                        lyricsTextarea.style.boxShadow = 'none';
                    }, 3000);
                    lyricsTextarea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else {
                    alert('No se pudo generar la letra. Inténtalo de nuevo.');
                }
            } catch (e) { alert(e.message); }
            finally { genLyricsBtn.disabled = false; genLyricsBtn.textContent = '✨ Generar letra'; }
        });

        aiPanel.appendChild(aiTheme);
        aiPanel.appendChild(genLyricsBtn);

        // toggle removed — aiPanel siempre visible

        lyricsSection.appendChild(lyricsTextarea);
        lyricsSection.appendChild(aiPanel);  // fila tema + botón
        container.appendChild(lyricsSection);

        // Voice info
        if (currentArtist?.voiceId || currentArtist?.voiceStyle) {
            const vi = document.createElement('div');
            vi.style.cssText = 'background:#f59e0b11;border:1px solid #f59e0b33;border-radius:10px;padding:9px 13px;font-size:12px;color:#f59e0b';
            vi.innerHTML = currentArtist.voiceId ? `🎤 Voz clonada de <strong>${currentArtist.name}</strong>` : `🎤 Estilo vocal: "${currentArtist.voiceStyle}"`;
            container.appendChild(vi);
        }

        // Generate button
        appendGenBtn(container, 'Crear canción', cost, async (token, userRef, isAdmin) => {
            const title  = container.querySelector('#song-title-input')?.value?.trim();
            const style  = container.querySelector('#song-style-input')?.value?.trim() || `${currentArtist?.genre || ''} ${currentArtist?.style || ''}`.trim();
            const lyrics = container.querySelector('#song-lyrics-input')?.value?.trim();
            const isInstrumental = songType === 'instrumental';

            const durationSel = container.querySelector('#song-duration-select');
            const duration = durationSel ? parseInt(durationSel.value) : 120;

            // En Suno V5 con custom_mode, la letra va en el campo prompt
            // y el estilo en el campo style. duration en segundos.
            let songPrompt = '';
            if (!isInstrumental && lyrics) {
                // Letra en prompt para que Suno la use
                songPrompt = lyrics;
            } else {
                songPrompt = isInstrumental
                    ? `${style} instrumental track`
                    : `${style} song`;
            }

            const params = {
                model:                'V5',
                custom_mode:          true,
                prompt:               songPrompt,
                style:                style || `${currentArtist?.genre || ''} ${currentArtist?.style || ''}`.trim(),
                title:                title || `${currentArtist?.name || 'Canción'} - Sin título`,
                instrumental:         isInstrumental,
                style_weight:         0.65,
                weirdness_constraint: 0.5,
                audio_weight:         0.65,
            };
            // duration solo si > 30s para no limitar
            if (duration && duration > 30) params.duration = duration;
            // Usar voiceId clonado o sunoSongId como referencia de voz
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
            // Si viene de "Crear variación", usar audio de referencia
            if (currentArtist?._refSongUrl) {
                params.audio_url = currentArtist._refSongUrl;
                // Pre-rellenar letra de referencia si no hay letra nueva
                if (!lyrics && currentArtist._refSongLyrics) {
                    params.prompt = currentArtist._refSongLyrics;
                }
                delete currentArtist._refSongUrl;
                delete currentArtist._refSongLyrics;
            }

            const res = await callMuapi('suno-create-music', params, token);
            const rid = res.request_id || res.id;
            let url = res.url || res.audio_url;
            let pollData = null;
            if (!url && rid) {
                const cb = container._progressCallback;
                const p  = await pollResult(rid, token, cb, 90, 3000);
                url = p.url;
                pollData = p.data;
            }
            if (!url) throw new Error('No se recibió URL de la canción.');
            await deduct(userRef, cost, isAdmin);

            // Guardar song_id de Suno en el perfil del artista para consistencia de voz
            const sunoSongId = res?.id || res?.song_id || pollData?.id || pollData?.song_id || null;
            if (sunoSongId && !currentArtist.sunoSongId) {
                try {
                    await updateDoc(
                        doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id),
                        { sunoSongId }
                    );
                    currentArtist.sunoSongId = sunoSongId;
                    console.log('[KreateMusic] sunoSongId guardado:', sunoSongId);
                } catch(e) { console.warn('No se pudo guardar sunoSongId:', e.message); }
            }

            await saveSong(url, params.title, 'suno-create-music', lyrics);
            showSongResult(url, params.title, container);
            const sg = document.querySelector('#km-songs-grid');
            if (sg) loadSongs(sg);
        });
    }

    async function saveSong(url, title, tool, lyrics) {
        if (!currentArtist || !currentUser) return;
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'songs'), {
            title: title || 'Canción', url, tool, lyrics: lyrics || null, createdAt: serverTimestamp()
        });
    }

    function showSongResult(url, title, container) {
        const card = document.createElement('div');
        card.className = 'km-card';
        card.style.cssText = 'background:#1a1a1a;border:1px solid #f59e0b44;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px';
        card.innerHTML = `<p style="color:#f59e0b;font-size:12px;font-weight:700;margin:0">✓ ${title || 'Resultado'}</p>`;
        const audio = document.createElement('audio');
        audio.controls = true; audio.src = url;
        audio.style.cssText = 'width:100%;accent-color:#f59e0b;border-radius:8px';
        const dlBtn = document.createElement('button');
        dlBtn.type = 'button';
        dlBtn.style.cssText = 'background:#f59e0b;border:none;border-radius:100px;padding:7px 16px;color:#000;font-size:11px;font-weight:700;cursor:pointer;width:fit-content';
        dlBtn.textContent = '↓ Descargar';
        dlBtn.addEventListener('click', async () => {
            try {
                const blob = await fetch(url).then(r => r.blob());
                const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${title || 'kreatemusic'}.mp3` });
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
            } catch { window.open(url, '_blank'); }
        });
        card.appendChild(audio);
        card.appendChild(dlBtn);
        const genBtn = container.querySelector('button[style*="f59e0b"]');
        if (genBtn) container.insertBefore(card, genBtn);
        else container.appendChild(card);
    }

    async function loadSongs(container) {
        if (!currentArtist || !currentUser) return;
        container.innerHTML = '';
        try {
            const q    = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'songs'), orderBy('createdAt', 'desc'), limit(20));
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

                // Cabecera con título
                const titleRow = document.createElement('div');
                titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';
                const titleEl = document.createElement('p');
                titleEl.style.cssText = 'color:#fff;font-size:12px;font-weight:700;margin:0;flex:1';
                titleEl.textContent = song.title || 'Canción';
                titleRow.appendChild(titleEl);
                card.appendChild(titleRow);

                if (song.url) {
                    const audio = document.createElement('audio');
                    audio.controls = true; audio.src = song.url;
                    audio.style.cssText = 'width:100%;accent-color:#f59e0b;border-radius:8px';
                    card.appendChild(audio);

                    // ── LETRA guardada ──
                    if (song.lyrics) {
                        const lyricsBox = document.createElement('div');
                        lyricsBox.style.cssText = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden';

                        const lyricsToggleBtn = document.createElement('button');
                        lyricsToggleBtn.type = 'button';
                        lyricsToggleBtn.style.cssText = 'width:100%;padding:7px 12px;background:none;border:none;color:#888;font-size:10px;font-weight:700;cursor:pointer;text-align:left;display:flex;align-items:center;justify-content:space-between';
                        lyricsToggleBtn.innerHTML = '<span>✍️ Ver / editar letra</span><span id="lyr-arrow">▼</span>';

                        const lyricsContent = document.createElement('div');
                        lyricsContent.style.cssText = 'display:none;padding:10px 12px;display:none;flex-direction:column;gap:8px';

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
                            } catch(e) { alert('Error: ' + e.message); }
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

                    // ── ACCIONES ──
                    const actionsRow = document.createElement('div');
                    actionsRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';

                    // Descargar
                    const dlBtn2 = document.createElement('button');
                    dlBtn2.type = 'button';
                    dlBtn2.style.cssText = 'padding:5px 12px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:100px;color:#888;font-size:10px;font-weight:700;cursor:pointer';
                    dlBtn2.textContent = '↓ Descargar';
                    dlBtn2.addEventListener('click', async () => {
                        try {
                            const blob = await fetch(song.url).then(r => r.blob());
                            const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${song.title || 'kreatemusic'}.mp3` });
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        } catch { window.open(song.url, '_blank'); }
                    });

                    // Extender — con panel de instrucciones
                    const extBtn = document.createElement('button');
                    extBtn.type = 'button';
                    extBtn.style.cssText = 'padding:5px 12px;background:#f59e0b22;border:1px solid #f59e0b66;border-radius:100px;color:#f59e0b;font-size:10px;font-weight:700;cursor:pointer';
                    extBtn.innerHTML = '➕ Extender <span style="opacity:.7">20 🪙</span>';

                    // Panel extender (oculto hasta click)
                    const extPanel = document.createElement('div');
                    extPanel.style.cssText = 'display:none;flex-direction:column;gap:8px;padding:10px;background:#111;border:1px solid #2a2a2a;border-radius:10px';
                    extPanel.innerHTML = '<p style="color:#888;font-size:10px;margin:0">¿Qué quieres añadir en la extensión?</p>';

                    const extPromptInput = document.createElement('input');
                    extPromptInput.placeholder = 'Ej: añade un puente con más energía, termina con fade out...';
                    extPromptInput.style.cssText = 'background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:8px 12px;color:#fff;font-size:12px;outline:none;font-family:inherit;transition:border-color .15s';
                    extPromptInput.addEventListener('focus', () => extPromptInput.style.borderColor = '#f59e0b66');
                    extPromptInput.addEventListener('blur',  () => extPromptInput.style.borderColor = '#2a2a2a');

                    const extConfirmBtn = document.createElement('button');
                    extConfirmBtn.type = 'button';
                    extConfirmBtn.style.cssText = 'padding:7px 16px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:11px;font-weight:700;cursor:pointer;width:fit-content';
                    extConfirmBtn.textContent = 'Extender canción';
                    extConfirmBtn.addEventListener('click', async () => {
                        extConfirmBtn.disabled = true; extConfirmBtn.textContent = '⏳ Generando...';
                        try {
                            const token = await currentUser.getIdToken();
                            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid);
                            const isAdmin = await checkAndDeduct(userRef, COSTS.SONG_EXTEND);
                            const extPrompt = extPromptInput.value.trim() || 'Continue the song maintaining the same style and energy';
                            const res = await callMuapi('suno-extend-music', {
                                audio_url: song.url,
                                prompt: extPrompt,
                                model: 'V5',
                            }, token);
                            const rid = res.request_id || res.id;
                            let url = res.url || res.audio_url;
                            if (!url && rid) {
                                const p = await pollResult(rid, token, null, 90, 3000);
                                url = p.url;
                            }
                            if (!url) throw new Error('No se recibió URL.');
                            await deduct(userRef, COSTS.SONG_EXTEND, isAdmin);
                            await saveSong(url, `${song.title || 'Canción'} (ext.)`, 'suno-extend-music', null);
                            const extAudio = document.createElement('audio');
                            extAudio.controls = true; extAudio.src = url;
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

                    // Usar como referencia
                    const refBtn = document.createElement('button');
                    refBtn.type = 'button';
                    refBtn.style.cssText = 'padding:5px 12px;background:#3b82f622;border:1px solid #3b82f666;border-radius:100px;color:#60a5fa;font-size:10px;font-weight:700;cursor:pointer';
                    refBtn.textContent = '🔁 Crear variación';
                    refBtn.addEventListener('click', () => {
                        // Scroll al panel de crear canción y pre-rellenar song_id
                        if (currentArtist) {
                            currentArtist._refSongUrl = song.url;
                            currentArtist._refSongLyrics = song.lyrics || '';
                        }
                        // Recargar panel de creación con referencia
                        const tp = document.querySelector('[id="km-songs-grid"]')?.closest('[style*="overflow-y"]');
                        alert('Baja al formulario de Crear canción — la canción seleccionada se usará como referencia de voz y estilo. Puedes modificar la letra antes de generar.');
                    });

                    actionsRow.appendChild(dlBtn2);
                    actionsRow.appendChild(extBtn);
                    actionsRow.appendChild(refBtn);
                    card.appendChild(actionsRow);
                    card.appendChild(extPanel);
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
        panel.style.cssText = 'flex-direction:column;overflow-y:auto;padding:20px;gap:14px;height:100%';

        const desc = document.createElement('p');
        desc.style.cssText = 'color:#888;font-size:12px;margin:0;flex-shrink:0';
        desc.textContent = 'Genera fotos del artista manteniendo el mismo rostro.';
        panel.appendChild(desc);

        // Aspect ratio
        let selectedAr = '1:1';
        const arLbl = document.createElement('p');
        arLbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0;flex-shrink:0';
        arLbl.textContent = 'Formato';
        panel.appendChild(arLbl);

        const arRow = document.createElement('div');
        arRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;flex-shrink:0';
        const AR_OPTIONS = [{ value:'1:1',label:'1:1',sub:'Cuadrado'},{ value:'9:16',label:'9:16',sub:'Vertical'},{ value:'16:9',label:'16:9',sub:'Landscape'}];
        AR_OPTIONS.forEach(ar => {
            const card = document.createElement('div');
            const active = ar.value === selectedAr;
            card.className = 'km-ar-card';
            card.dataset.val = ar.value;
            card.style.cssText = `background:${active?'#f59e0b22':'#1a1a1a'};border:${active?'2px solid #f59e0b':'1px solid #2a2a2a'};border-radius:10px;padding:10px;cursor:pointer;text-align:center;transition:all .15s;box-shadow:${active?'0 0 10px rgba(245,158,11,.15)':'none'}`;
            card.innerHTML = `<div style="color:${active?'#f59e0b':'#fff'};font-size:13px;font-weight:700">${ar.label}</div><div style="color:#555;font-size:10px">${ar.sub}</div>`;
            card.addEventListener('click', () => {
                selectedAr = ar.value;
                arRow.querySelectorAll('.km-ar-card').forEach(c => {
                    const a = c.dataset.val === ar.value;
                    c.style.background = a?'#f59e0b22':'#1a1a1a';
                    c.style.border     = a?'2px solid #f59e0b':'1px solid #2a2a2a';
                    c.style.boxShadow  = a?'0 0 10px rgba(245,158,11,.15)':'none';
                    const lbl = c.querySelector('div:first-child');
                    if (lbl) lbl.style.color = a?'#f59e0b':'#fff';
                });
            });
            arRow.appendChild(card);
        });
        panel.appendChild(arRow);

        // Scene
        const SCENES = [
            { id:'studio',   label:'🎙 Estudio',   prompt:'in a professional recording studio with microphone, cinematic lighting' },
            { id:'show',     label:'🎤 Concierto',  prompt:'performing on stage at a concert, dramatic stage lighting, crowd' },
            { id:'social',   label:'📱 Redes',      prompt:'casual lifestyle photo, natural light, social media style' },
            { id:'fashion',  label:'👗 Moda',       prompt:'high fashion editorial photoshoot, luxury setting' },
            { id:'street',   label:'🏙 Urbano',     prompt:'urban street photography, city background, golden hour' },
            { id:'coffee',   label:'☕ Cafetería',  prompt:'sitting at a cozy cafe, warm coffee shop lighting' },
            { id:'custom',   label:'✏️ Custom',     prompt:'' },
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
            card.style.cssText = `background:${active?'#f59e0b22':'#1a1a1a'};border:${active?'2px solid #f59e0b':'1px solid #2a2a2a'};border-radius:10px;padding:8px;cursor:pointer;font-size:10px;font-weight:700;color:${active?'#f59e0b':'#888'};text-align:center;transition:all .15s;box-shadow:${active?'0 0 10px rgba(245,158,11,.15)':'none'}`;
            card.textContent = scene.label;
            card.addEventListener('click', () => {
                selectedScene = scene;
                sceneGrid.querySelectorAll('.km-scene-card').forEach(c => {
                    const a = c.dataset.sceneId === scene.id;
                    c.style.background = a?'#f59e0b22':'#1a1a1a';
                    c.style.border     = a?'2px solid #f59e0b':'1px solid #2a2a2a';
                    c.style.color      = a?'#f59e0b':'#888';
                    c.style.boxShadow  = a?'0 0 10px rgba(245,158,11,.15)':'none';
                });
                customInput.style.display = scene.id === 'custom' ? 'block' : 'none';
            });
            sceneGrid.appendChild(card);
        });
        panel.appendChild(sceneGrid);
        panel.appendChild(customInput);

        // Photos grid
        const photosLbl = document.createElement('p');
        photosLbl.style.cssText = 'color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0;flex-shrink:0';
        photosLbl.textContent = 'Fotos generadas';
        panel.appendChild(photosLbl);

        const photosGrid = document.createElement('div');
        photosGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px';
        panel.appendChild(photosGrid);
        loadPhotos(photosGrid);

        // Progress
        const photoProgressWrap = document.createElement('div');
        photoProgressWrap.style.cssText = 'display:none;flex-direction:column;gap:6px;flex-shrink:0';
        photoProgressWrap.innerHTML = '<div style="width:100%;background:#1a1a1a;border-radius:100px;height:4px;overflow:hidden;border:1px solid #2a2a2a"><div id="photo-prog-bar" style="height:100%;background:linear-gradient(90deg,#f59e0b,#fbbf24);border-radius:100px;width:0%;transition:width .5s ease"></div></div><p id="photo-prog-label" style="color:#888;font-size:11px;margin:0;text-align:center;font-family:monospace"></p>';

        // Generate button
        const genPhotoBtn = document.createElement('button');
        genPhotoBtn.type = 'button';
        genPhotoBtn.style.cssText = 'width:100%;padding:12px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .15s';
        genPhotoBtn.innerHTML = 'Generar foto 2K <span style="background:rgba(0,0,0,.2);padding:2px 7px;border-radius:100px;font-size:11px;font-family:monospace">'+COSTS.PHOTO_EXTRA+' 🪙</span>';
        genPhotoBtn.addEventListener('mouseenter', () => genPhotoBtn.style.background = '#fbbf24');
        genPhotoBtn.addEventListener('mouseleave', () => genPhotoBtn.style.background = '#f59e0b');

        genPhotoBtn.addEventListener('click', async () => {
            if (!currentArtist?.referencePhotoUrl) return alert('El artista no tiene foto de referencia.');
            if (!currentUser) return alert('Debes iniciar sesión.');
            genPhotoBtn.disabled = true;
            genPhotoBtn.innerHTML = '<div style="width:14px;height:14px;border:2px solid #00000033;border-top-color:#000;border-radius:50%;animation:spin 1s linear infinite"></div> Generando...';
            photoProgressWrap.style.display = 'flex';
            try {
                const token   = await currentUser.getIdToken();
                const userRef = doc(db,'artifacts',APP_ID,'public','data','users',currentUser.uid);
                const isAdmin = await checkAndDeduct(userRef, COSTS.PHOTO_EXTRA);

                const scenePrompt = selectedScene.id === 'custom' ? customInput.value : selectedScene.prompt;
                const prompt = `Same person as in the reference image, ${scenePrompt}, maintain exact facial features, hair, skin tone, body. Only change background and scene. Hyperrealistic photography, 8K, Sony A7R V.`;

                const res = await callMuapi('nano-banana-2-edit', {
                    prompt,
                    images_list: [currentArtist.referencePhotoUrl],
                    aspect_ratio: selectedAr,
                    resolution: '2k',
                    output_format: 'jpg'
                }, token);

                const rid = res.request_id || res.id;
                let photoUrl = res.url || res.output?.outputs?.[0];

                if (!photoUrl && rid) {
                    const result = await pollResult(rid, token, (pct, secs) => {
                        const bar   = photoProgressWrap.querySelector('#photo-prog-bar');
                        const label = photoProgressWrap.querySelector('#photo-prog-label');
                        if (bar)   bar.style.width = pct+'%';
                        if (label) label.textContent = pct+'% · '+Math.round(secs)+'s';
                    }, 60, 3000);
                    photoUrl = result.url;
                }

                if (!photoUrl) throw new Error('No se generó la foto.');
                await deduct(userRef, COSTS.PHOTO_EXTRA, isAdmin);
                await addDoc(collection(db,'artifacts',APP_ID,'public','data','users',currentUser.uid,'artists',currentArtist.id,'photos'), {
                    url: photoUrl, scene: selectedScene.id, aspect_ratio: selectedAr, createdAt: serverTimestamp()
                });
                addPhotoCard(photoUrl, photosGrid, selectedAr);
            } catch (err) {
                alert('Error: '+err.message);
            } finally {
                genPhotoBtn.disabled = false;
                genPhotoBtn.innerHTML = 'Generar foto 2K <span style="background:rgba(0,0,0,.2);padding:2px 7px;border-radius:100px;font-size:11px;font-family:monospace">'+COSTS.PHOTO_EXTRA+' 🪙</span>';
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
    // PANEL: VOZ
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
                    ? '<div style="background:#3b82f611;border:1px solid #3b82f633;border-radius:10px;padding:10px 13px;color:#60a5fa;font-size:12px">🎵 Estilo vocal: "'+currentArtist.voiceStyle+'"</div>'
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
                await updateDoc(doc(db,'artifacts',APP_ID,'public','data','users',currentUser.uid,'artists',currentArtist.id), { voiceStyle: styleInput.value });
                currentArtist.voiceStyle = styleInput.value;
                saveStyleBtn.textContent = '✓ Guardado';
                setTimeout(() => { saveStyleBtn.textContent = 'Guardar'; }, 2000);
            } catch(e) { alert(e.message); }
        });
        styleWrap.appendChild(styleInput);
        styleWrap.appendChild(saveStyleBtn);
        panel.appendChild(styleWrap);

        const cloneWrap = document.createElement('div');
        cloneWrap.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px';
        cloneWrap.innerHTML = '<p style="color:#fff;font-size:12px;font-weight:700;margin:0">Clonar nueva voz <span style="background:#f59e0b22;color:#f59e0b;font-size:10px;padding:2px 7px;border-radius:100px;font-family:monospace">'+COSTS.CLONE_VOICE_LATER+' 🪙</span></p><p style="color:#555;font-size:11px;margin:0">Sube un audio de 10 segundos con la voz a clonar.</p>';

        const vFileInput = document.createElement('input');
        vFileInput.type = 'file'; vFileInput.accept = 'audio/*'; vFileInput.style.display = 'none';
        let vFileUrl = null;

        const vUploadBtn = document.createElement('button');
        vUploadBtn.type = 'button';
        vUploadBtn.style.cssText = 'background:#1a1a1a;border:1px dashed #2a2a2a;border-radius:10px;padding:12px;color:#888;font-size:12px;cursor:pointer;width:100%;text-align:center';
        vUploadBtn.textContent = '🎙 Seleccionar audio (10s)';
        vUploadBtn.addEventListener('click', () => vFileInput.click());
        vFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0]; if (!file) return;
            vUploadBtn.textContent = '⏳ Subiendo...';
            try {
                const token = await currentUser.getIdToken();
                const fd = new FormData(); fd.append('file', file);
                const resp = await fetch('/api/v1/upload_file', { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:fd });
                const data = await resp.json();
                vFileUrl = data.url || data.file_url;
                vUploadBtn.textContent = '✓ '+file.name;
                vUploadBtn.style.borderColor = '#f59e0b66'; vUploadBtn.style.color = '#f59e0b';
            } catch(err) { vUploadBtn.textContent = '🎙 Seleccionar audio (10s)'; alert(err.message); }
        });

        const cloneBtn = document.createElement('button');
        cloneBtn.type = 'button';
        cloneBtn.style.cssText = 'padding:10px 20px;background:#f59e0b;border:none;border-radius:100px;color:#000;font-size:12px;font-weight:700;cursor:pointer;width:fit-content';
        cloneBtn.textContent = 'Clonar voz';
        cloneBtn.addEventListener('click', async () => {
            if (!vFileUrl) return alert('Sube un audio primero.');
            cloneBtn.disabled = true; cloneBtn.textContent = '⏳ Clonando...';
            try {
                const token = await currentUser.getIdToken();
                const userRef = doc(db,'artifacts',APP_ID,'public','data','users',currentUser.uid);
                const isAdmin = await checkAndDeduct(userRef, COSTS.CLONE_VOICE_LATER);
                const res = await callMuapi('suno-voice-clone', { audio_url: vFileUrl }, token);
                const voiceId = res.voice_id || res.id;
                if (!voiceId) throw new Error('No se obtuvo voice_id.');
                await updateDoc(doc(db,'artifacts',APP_ID,'public','data','users',currentUser.uid,'artists',currentArtist.id), { voiceId });
                await deduct(userRef, COSTS.CLONE_VOICE_LATER, isAdmin);
                currentArtist.voiceId = voiceId;
                cloneBtn.textContent = '✓ Voz clonada';
                currentVoiceBox.innerHTML = '<p style="color:#666;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0">Configuración actual</p><div style="background:#f59e0b11;border:1px solid #f59e0b33;border-radius:10px;padding:10px 13px;color:#f59e0b;font-size:12px">🎤 Voz clonada activa</div>';
            } catch(err) { cloneBtn.disabled = false; cloneBtn.textContent = 'Clonar voz'; alert('Error: '+err.message); }
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
            const q    = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentUser.uid, 'artists', currentArtist.id, 'photos'), orderBy('createdAt', 'desc'), limit(30));
            const snap = await getDocs(q);
            snap.forEach(d => addPhotoCard(d.data().url, grid, d.data().aspect_ratio || '1:1'));
        } catch (e) { console.error('[KreateMusic] loadPhotos:', e); }
    }

    async function loadArtists(user) {
        try {
            const q    = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'artists'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            artists    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) { console.error('[KreateMusic] loadArtists:', e); }
        renderArtistList();
        showView('artistList');
    }

    onAuthStateChanged(auth, (user) => {
        if (user) { currentUser = user; loadArtists(user); }
        else { currentUser = null; showView('auth'); }
    });

    showView('auth');
    return root;
}
