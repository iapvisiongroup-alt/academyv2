import { auth, db, APP_ID } from '../lib/firebase.js';
import {
    collection, query, orderBy, limit, onSnapshot,
    updateDoc, serverTimestamp, addDoc, deleteDoc, doc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const extractUrl = (d) => {
    if (!d) return null;
    return d.url || d.image_url || d.audio_url || d.video_url
        || d.output?.url || d.output?.outputs?.[0]
        || d.outputs?.[0] || d.images?.[0]?.url || null;
};

if (!document.querySelector('#gc-styles')) {
    const st = document.createElement('style');
    st.id = 'gc-styles';
    st.textContent = `
        @keyframes gc-spin { to { transform:rotate(360deg) } }
        @keyframes gc-fadein { from { opacity:0;transform:translateY(8px) } to { opacity:1;transform:translateY(0) } }
        .gc-card { animation:gc-fadein .25s ease; }
        .gc-spinner { width:16px;height:16px;border:2px solid #f59e0b33;border-top-color:#f59e0b;border-radius:50%;animation:gc-spin 1s linear infinite;flex-shrink:0 }
    `;
    document.head.appendChild(st);
}

export function GenerationCenter() {
    const root = document.createElement('div');
    root.id = 'generation-center-root';
    root.style.cssText = `
        position:fixed;right:16px;bottom:16px;z-index:99999;
        display:flex;flex-direction:column;gap:8px;width:300px;
        pointer-events:none;
    `;

    let unsub  = null;
    const polling = new Set();
    const cards   = new Map();

    const startPolling = async (task) => {
        if (!auth.currentUser)         return;
        if (polling.has(task.id))      return;
        if (task.status !== 'running') return;
        if (!task.request_id)          return;

        polling.add(task.id);
        let token = await auth.currentUser.getIdToken();

        try {
            for (let i = 0; i < 150; i++) {
                await new Promise(r => setTimeout(r, 2500));
                if (i % 240 === 0 && i > 0) token = await auth.currentUser.getIdToken(true);

                const resp = await fetch(`/api/v1/predictions/${task.request_id}/result`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!resp.ok) { if (resp.status >= 500) continue; throw new Error(`Poll ${resp.status}`); }

                const data   = await resp.json();
                const url    = extractUrl(data);
                const status = String(data.status || data.output?.status || '').toLowerCase();

                if (url) {
                    await updateDoc(task.ref, { status: 'completed', result_url: url, updatedAt: serverTimestamp() });
                    return;
                }
                if (status === 'failed' || status === 'error') {
                    throw new Error(data.error || data.output?.error || 'La generación falló.');
                }
            }
            throw new Error('Tiempo de espera agotado.');
        } catch (e) {
            await updateDoc(task.ref, { status: 'failed', error: e.message, updatedAt: serverTimestamp() });
        } finally {
            polling.delete(task.id);
        }
    };

    const autoRemove = async (taskId, ref, delay) => {
        await new Promise(r => setTimeout(r, delay));
        const card = cards.get(taskId);
        if (card) {
            card.style.opacity = '0';
            card.style.transition = 'opacity .4s';
            await new Promise(r => setTimeout(r, 400));
            card.remove();
            cards.delete(taskId);
        }
        try { await deleteDoc(ref); } catch {}
    };

    const updateCard = (task) => {
        const card = cards.get(task.id);
        if (!card) return;

        const statusEl = card.querySelector('.gc-status');
        const spinEl   = card.querySelector('.gc-spinner-wrap');
        const resultEl = card.querySelector('.gc-result');
        const errEl    = card.querySelector('.gc-error');

        if (task.status === 'completed') {
            if (statusEl) { statusEl.textContent = '✓ Completado'; statusEl.style.color = '#4ade80'; }
            if (spinEl)   spinEl.style.display = 'none';
            if (resultEl) {
                resultEl.style.display = 'flex';
                if (task.type === 'image' && task.result_url) {
                    resultEl.innerHTML = `<img src="${task.result_url}" style="width:100%;border-radius:8px;border:1px solid #f59e0b44;cursor:pointer" onclick="window.open('${task.result_url}','_blank')">`;
                } else if (task.type === 'video' && task.result_url) {
                    resultEl.innerHTML = `<video src="${task.result_url}" style="width:100%;border-radius:8px" muted autoplay loop controls></video>`;
                } else if (task.type === 'music' && task.result_url) {
                    resultEl.innerHTML = `<audio src="${task.result_url}" controls style="width:100%;accent-color:#f59e0b"></audio>`;
                }
            }
            autoRemove(task.id, task.ref, 12000);
        } else if (task.status === 'failed') {
            if (statusEl) { statusEl.textContent = '⚠️ Error'; statusEl.style.color = '#f87171'; }
            if (spinEl)   spinEl.style.display = 'none';
            if (errEl)    { errEl.textContent = task.error?.slice(0, 100) || 'Error desconocido'; errEl.style.display = 'block'; }
            autoRemove(task.id, task.ref, 12000);
        }
    };

    const renderCard = (task) => {
        if (cards.has(task.id)) {
            updateCard(task);
            return;
        }

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
                        ${(task.prompt || '').slice(0, 50)}
                    </div>
                </div>
                <div class="gc-spinner-wrap" style="display:${task.status === 'running' ? 'flex' : 'none'}">
                    <div class="gc-spinner"></div>
                </div>
                <button class="gc-close" type="button" style="background:none;border:none;color:#444;cursor:pointer;font-size:16px;padding:2px 4px;flex-shrink:0;line-height:1">×</button>
            </div>
            <div class="gc-error" style="font-size:10px;color:#f87171;display:none"></div>
            <div class="gc-result" style="display:none;flex-direction:column;gap:4px"></div>
        `;

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
        updateCard(task);
    };

    onAuthStateChanged(auth, (user) => {
        if (unsub) { unsub(); unsub = null; }
        // Limpiar cards de usuario anterior
        cards.forEach(card => card.remove());
        cards.clear();
        polling.clear();
        if (!user) return;

        const q = query(
            collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'generation_tasks'),
            orderBy('createdAt', 'desc'),
            limit(30)
        );

        unsub = onSnapshot(q, (snap) => {
            const tasks = snap.docs
                .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
                .filter(t => ['running', 'completed', 'failed'].includes(t.status))
                .slice(0, 10);

            tasks.forEach(task => {
                renderCard(task);
                startPolling(task);
            });
        }, (err) => {
            console.error('[GenerationCenter] Error escuchando tasks:', err);
        });
    });

    return root;
}

// Helper exportado para guardar tasks desde cualquier estudio
export async function saveGenerationTask({ type, endpoint, requestId, prompt, userId }) {
    const ref = await addDoc(
        collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', userId, 'generation_tasks'),
        {
            type,
            endpoint,
            request_id: requestId || null,
            prompt:     (prompt || '').slice(0, 200),
            status:     'running',
            result_url: null,
            createdAt:  serverTimestamp(),
            updatedAt:  serverTimestamp(),
        }
    );
    return ref;
}
