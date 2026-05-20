import { auth, db, APP_ID } from '../lib/firebase.js';
import {
    collection, query, where, orderBy, onSnapshot,
    updateDoc, doc, serverTimestamp, addDoc, deleteDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const extractUrl = (d) => {
    if (!d) return null;
    return d.url || d.image_url || d.audio_url || d.video_url
        || d.output?.url || d.output?.outputs?.[0]
        || d.outputs?.[0] || d.images?.[0]?.url || null;
};

// Inyectar keyframes si no existen
if (!document.querySelector('#gc-styles')) {
    const st = document.createElement('style');
    st.id = 'gc-styles';
    st.textContent = `
        @keyframes gc-spin { to { transform: rotate(360deg) } }
        @keyframes gc-fadein { from { opacity:0;transform:translateY(8px) } to { opacity:1;transform:translateY(0) } }
        .gc-card { animation: gc-fadein .25s ease; }
        .gc-spinner { width:16px;height:16px;border:2px solid #f59e0b33;border-top-color:#f59e0b;border-radius:50%;animation:gc-spin 1s linear infinite;flex-shrink:0 }
    `;
    document.head.appendChild(st);
}

export function GenerationCenter() {
    const root = document.createElement('div');
    root.style.cssText = `
        position:fixed;right:16px;bottom:16px;z-index:99999;
        display:flex;flex-direction:column;gap:8px;width:300px;
        pointer-events:none;
    `;

    let unsub = null;
    const polling = new Set();
    const cards   = new Map(); // taskId → card element

    const startPolling = async (task) => {
        if (!auth.currentUser)            return;
        if (polling.has(task.id))         return;
        if (task.status !== 'running')    return;
        if (!task.request_id)             return;

        polling.add(task.id);
        let token = await auth.currentUser.getIdToken();

        try {
            for (let i = 0; i < 150; i++) {
                await new Promise(r => setTimeout(r, 2500));

                // Refrescar token cada 30 min
                if (i % 240 === 0 && i > 0) {
                    token = await auth.currentUser.getIdToken(true);
                }

                const resp = await fetch(`/api/v1/predictions/${task.request_id}/result`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (!resp.ok) { if (resp.status >= 500) continue; throw new Error(`Poll ${resp.status}`); }

                const data   = await resp.json();
                const url    = extractUrl(data);
                const status = String(data.status || data.output?.status || '').toLowerCase();

                if (url) {
                    await updateDoc(task.ref, {
                        status: 'completed', result_url: url,
                        updatedAt: serverTimestamp()
                    });
                    return;
                }

                if (status === 'failed' || status === 'error') {
                    throw new Error(data.error || data.output?.error || 'La generación falló.');
                }
            }
            throw new Error('Tiempo de espera agotado.');
        } catch (e) {
            await updateDoc(task.ref, {
                status: 'failed', error: e.message, updatedAt: serverTimestamp()
            });
        } finally {
            polling.delete(task.id);
        }
    };

    const renderCard = (task) => {
        const existing = cards.get(task.id);
        if (existing) {
            // Actualizar estado sin recrear
            const statusEl = existing.querySelector('.gc-status');
            const spinEl   = existing.querySelector('.gc-spinner-wrap');
            const resultEl = existing.querySelector('.gc-result');

            if (task.status === 'completed') {
                if (statusEl) statusEl.textContent = '✓ Completado';
                if (spinEl)   spinEl.style.display = 'none';
                if (resultEl) {
                    resultEl.style.display = 'flex';
                    if (task.type === 'image' && task.result_url) {
                        resultEl.innerHTML = `<img src="${task.result_url}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid #f59e0b44">`;
                    } else if (task.type === 'video' && task.result_url) {
                        resultEl.innerHTML = `<video src="${task.result_url}" style="width:64px;height:36px;object-fit:cover;border-radius:8px;border:1px solid #f59e0b44" muted autoplay loop></video>`;
                    } else if (task.type === 'music' && task.result_url) {
                        resultEl.innerHTML = `<audio src="${task.result_url}" controls style="width:100%;accent-color:#f59e0b;border-radius:8px;margin-top:4px"></audio>`;
                    }
                }
                // Auto-eliminar card completada tras 8s
                setTimeout(async () => {
                    existing.style.opacity = '0';
                    existing.style.transition = 'opacity .4s';
                    await new Promise(r => setTimeout(r, 400));
                    existing.remove();
                    cards.delete(task.id);
                    try { await deleteDoc(task.ref); } catch {}
                }, 8000);

            } else if (task.status === 'failed') {
                if (statusEl) { statusEl.textContent = '⚠️ Error'; statusEl.style.color = '#f87171'; }
                if (spinEl)   spinEl.style.display = 'none';
                const errEl = existing.querySelector('.gc-error');
                if (errEl) errEl.textContent = task.error?.slice(0, 80) || 'Generación fallida';
                // Auto-eliminar tras 10s
                setTimeout(async () => {
                    existing.style.opacity = '0';
                    existing.style.transition = 'opacity .4s';
                    await new Promise(r => setTimeout(r, 400));
                    existing.remove();
                    cards.delete(task.id);
                    try { await deleteDoc(task.ref); } catch {}
                }, 10000);
            }
            return;
        }

        // Crear nueva card
        const icon = task.type === 'video' ? '🎬' : task.type === 'music' ? '🎵' : '🖼️';
        const card = document.createElement('div');
        card.className = 'gc-card';
        card.style.cssText = `
            pointer-events:auto;background:#111;border:1px solid #2a2a2a;
            border-radius:14px;padding:12px 14px;color:#fff;
            box-shadow:0 10px 40px rgba(0,0,0,.5);display:flex;
            flex-direction:column;gap:8px;
        `;

        card.innerHTML = `
            <div style="display:flex;gap:10px;align-items:center">
                <div style="font-size:20px;flex-shrink:0">${icon}</div>
                <div style="flex:1;min-width:0">
                    <div class="gc-status" style="font-size:12px;font-weight:800;color:#f59e0b">
                        ${task.status === 'running' ? 'Generando...' : task.status === 'completed' ? '✓ Completado' : '⚠️ Error'}
                    </div>
                    <div style="font-size:10px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">
                        ${(task.prompt || task.endpoint || '').slice(0, 50)}
                    </div>
                </div>
                <div class="gc-spinner-wrap" style="display:${task.status === 'running' ? 'flex' : 'none'}">
                    <div class="gc-spinner"></div>
                </div>
                <button class="gc-close" style="background:none;border:none;color:#444;cursor:pointer;font-size:14px;padding:2px;flex-shrink:0;line-height:1">×</button>
            </div>
            <div class="gc-error" style="font-size:10px;color:#f87171;display:${task.status === 'failed' ? 'block' : 'none'}">${task.error?.slice(0, 80) || ''}</div>
            <div class="gc-result" style="display:${task.status === 'completed' ? 'flex' : 'none'};flex-direction:column;gap:4px"></div>
        `;

        // Botón cerrar
        card.querySelector('.gc-close').addEventListener('click', async () => {
            card.style.opacity = '0';
            card.style.transition = 'opacity .3s';
            await new Promise(r => setTimeout(r, 300));
            card.remove();
            cards.delete(task.id);
            try { await deleteDoc(task.ref); } catch {}
        });

        root.appendChild(card);
        cards.set(task.id, card);

        // Si ya está completado al montar, mostrar resultado
        if (task.status === 'completed' && task.result_url) {
            const resultEl = card.querySelector('.gc-result');
            if (resultEl) {
                resultEl.style.display = 'flex';
                if (task.type === 'image') {
                    resultEl.innerHTML = `<img src="${task.result_url}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid #f59e0b44">`;
                } else if (task.type === 'video') {
                    resultEl.innerHTML = `<video src="${task.result_url}" style="width:64px;height:36px;object-fit:cover;border-radius:8px" muted autoplay loop></video>`;
                } else if (task.type === 'music') {
                    resultEl.innerHTML = `<audio src="${task.result_url}" controls style="width:100%;accent-color:#f59e0b"></audio>`;
                }
            }
        }
    };

    onAuthStateChanged(auth, (user) => {
        if (unsub) { unsub(); unsub = null; }
        root.innerHTML = '';
        cards.clear();
        polling.clear();
        if (!user) return;

        const q = query(
            collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'generation_tasks'),
            where('status', 'in', ['running', 'completed', 'failed']),
            orderBy('createdAt', 'desc')
        );

        unsub = onSnapshot(q, (snap) => {
            const tasks = snap.docs.slice(0, 10).map(d => ({
                id: d.id, ref: d.ref, ...d.data()
            }));

            tasks.forEach(task => {
                renderCard(task);
                startPolling(task);
            });
        });
    });

    return root;
}

// Helper para guardar una task desde cualquier estudio
export async function saveGenerationTask({ type, endpoint, requestId, prompt, userId }) {
    return addDoc(
        collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', userId, 'generation_tasks'),
        {
            type,
            endpoint,
            request_id: requestId || null,
            prompt:     prompt || '',
            status:     'running',
            result_url: null,
            createdAt:  serverTimestamp(),
            updatedAt:  serverTimestamp(),
        }
    );
}
