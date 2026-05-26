import { db, APP_ID } from '../lib/firebase.js';
import {
    collection,
    getDocs,
    doc,
    setDoc,
    updateDoc,
    serverTimestamp
} from 'firebase/firestore';

export function AdminPanel() {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/95 backdrop-blur-2xl flex items-center justify-center z-[9999] p-4 md:p-8 animate-fade-in';

    const modal = document.createElement('div');
    modal.className = 'w-full max-w-6xl h-[86vh] bg-[#0a0a0a] border border-[#FFB000]/30 rounded-[2rem] shadow-[0_0_80px_rgba(255,176,0,0.15)] relative flex flex-col overflow-hidden';

    modal.innerHTML = `
        <div class="p-6 md:p-8 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-[#FFB000]/10 to-transparent">
            <div>
                <h2 class="text-2xl font-black text-white flex items-center gap-3">
                    <span class="text-3xl">👑</span> Panel de Control Maestro
                </h2>
                <p class="text-white/50 text-sm mt-1">Gestión total de usuarios, créditos y herramientas de KreateIA</p>
            </div>
            <button id="close-admin-btn" class="text-white/30 hover:text-white p-2 transition-colors bg-white/5 rounded-xl">
                <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>

        <div class="px-6 md:px-8 pt-5 flex gap-2 border-b border-white/10">
            <button id="tab-users" class="admin-tab px-4 py-3 rounded-t-xl text-sm font-black bg-[#FFB000] text-black">
                Usuarios y créditos
            </button>
            <button id="tab-tools" class="admin-tab px-4 py-3 rounded-t-xl text-sm font-black bg-white/5 text-white/60 hover:text-white">
                Herramientas IA
            </button>
        </div>

        <div id="users-panel" class="flex-grow overflow-auto p-6 md:p-8">
            <div class="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <table class="w-full text-left text-sm text-white/70">
                    <thead class="bg-white/5 text-white font-bold uppercase text-xs tracking-wider">
                        <tr>
                            <th class="px-6 py-4">Usuario (Email)</th>
                            <th class="px-6 py-4">Rol</th>
                            <th class="px-6 py-4">Créditos Actuales</th>
                            <th class="px-6 py-4 text-right">Acciones Rápidas</th>
                        </tr>
                    </thead>
                    <tbody id="users-table-body" class="divide-y divide-white/5">
                        <tr>
                            <td colspan="4" class="px-6 py-8 text-center text-white/50 animate-pulse">
                                Cargando base de datos de usuarios...
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div id="tools-panel" class="hidden flex-grow overflow-auto p-6 md:p-8">
            <div class="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
                <section class="bg-white/5 border border-white/10 rounded-2xl p-5">
                    <h3 class="text-white font-black text-lg mb-1">Crear herramienta IA</h3>
                    <p class="text-white/40 text-xs mb-5 leading-relaxed">
                        Crea herramientas para KreateImage sin tocar código. Se guardará una versión privada y otra pública automáticamente.
                    </p>

                    <div class="space-y-4">
                        <label class="block">
                            <span class="block text-white/50 text-[10px] font-black uppercase tracking-widest mb-2">ID interno</span>
                            <input id="tool-id" value="kreateimage-pro" class="admin-input" placeholder="kreateimage-pro">
                        </label>

                        <label class="block">
                            <span class="block text-white/50 text-[10px] font-black uppercase tracking-widest mb-2">Nombre público</span>
                            <input id="tool-name" value="KreateImage Pro" class="admin-input" placeholder="KreateImage Pro">
                        </label>

                        <label class="block">
                            <span class="block text-white/50 text-[10px] font-black uppercase tracking-widest mb-2">Descripción</span>
                            <input id="tool-description" value="Generación avanzada de imágenes con calidad profesional." class="admin-input" placeholder="Descripción corta">
                        </label>

                        <label class="block">
                            <span class="block text-white/50 text-[10px] font-black uppercase tracking-widest mb-2">Sección</span>
                            <select id="tool-section" class="admin-input">
                                <option value="kreateimage">KreateImage</option>
                                <option value="kreatevideo">KreateVideo</option>
                                <option value="kreatemusic">KreateMusic</option>
                            </select>
                        </label>

                        <label class="block">
                            <span class="block text-white/50 text-[10px] font-black uppercase tracking-widest mb-2">Endpoint MuAPI</span>
                            <input id="tool-endpoint" value="nano-banana-pro" class="admin-input" placeholder="nano-banana-pro">
                        </label>

                        <label class="flex items-center gap-3 bg-black/30 border border-white/10 rounded-xl p-3">
                            <input id="tool-enabled" type="checkbox" checked class="w-4 h-4">
                            <span class="text-white text-sm font-bold">Herramienta activa</span>
                        </label>

                        <div class="grid grid-cols-2 gap-3">
                            <label class="block">
                                <span class="block text-white/50 text-[10px] font-black uppercase tracking-widest mb-2">Precio 2k</span>
                                <input id="price-2k" type="number" value="60" class="admin-input">
                            </label>
                            <label class="block">
                                <span class="block text-white/50 text-[10px] font-black uppercase tracking-widest mb-2">Precio 4k</span>
                                <input id="price-4k" type="number" value="120" class="admin-input">
                            </label>
                        </div>

                        <label class="block">
                            <span class="block text-white/50 text-[10px] font-black uppercase tracking-widest mb-2">Formatos</span>
                            <input id="tool-aspects" value="1:1,9:16,16:9,4:5" class="admin-input" placeholder="1:1,9:16,16:9">
                        </label>

                        <label class="block">
                            <span class="block text-white/50 text-[10px] font-black uppercase tracking-widest mb-2">Calidades visibles</span>
                            <input id="tool-qualities" value="2k,4k" class="admin-input" placeholder="2k,4k">
                        </label>

                        <button id="save-tool-btn" class="w-full bg-[#FFB000] hover:bg-[#ffc233] text-black font-black py-3 rounded-xl transition-colors">
                            Guardar herramienta
                        </button>

                        <p id="tool-form-status" class="text-xs text-white/50 min-h-[18px]"></p>
                    </div>
                </section>

                <section class="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <div class="p-5 border-b border-white/10 flex justify-between items-center">
                        <div>
                            <h3 class="text-white font-black text-lg">Herramientas creadas</h3>
                            <p class="text-white/40 text-xs mt-1">Listado leído desde public_ai_tools.</p>
                        </div>
                        <button id="reload-tools-btn" class="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-xs font-bold">
                            Recargar
                        </button>
                    </div>
                    <div id="tools-list" class="divide-y divide-white/5">
                        <div class="px-5 py-8 text-center text-white/40 animate-pulse">Cargando herramientas...</div>
                    </div>
                </section>
            </div>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        .admin-input {
            width: 100%;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 12px;
            padding: 11px 13px;
            color: #fff;
            outline: none;
            font-size: 13px;
        }
        .admin-input:focus {
            border-color: rgba(255,176,0,.65);
            box-shadow: 0 0 0 3px rgba(255,176,0,.12);
        }
        .admin-input option {
            background: #111;
            color: #fff;
        }
    `;
    modal.appendChild(style);

    const tbody = modal.querySelector('#users-table-body');
    const usersPanel = modal.querySelector('#users-panel');
    const toolsPanel = modal.querySelector('#tools-panel');
    const tabUsers = modal.querySelector('#tab-users');
    const tabTools = modal.querySelector('#tab-tools');

    function setActiveTab(tab) {
        const usersActive = tab === 'users';

        usersPanel.classList.toggle('hidden', !usersActive);
        toolsPanel.classList.toggle('hidden', usersActive);

        tabUsers.className = usersActive
            ? 'admin-tab px-4 py-3 rounded-t-xl text-sm font-black bg-[#FFB000] text-black'
            : 'admin-tab px-4 py-3 rounded-t-xl text-sm font-black bg-white/5 text-white/60 hover:text-white';

        tabTools.className = !usersActive
            ? 'admin-tab px-4 py-3 rounded-t-xl text-sm font-black bg-[#FFB000] text-black'
            : 'admin-tab px-4 py-3 rounded-t-xl text-sm font-black bg-white/5 text-white/60 hover:text-white';

        if (!usersActive) loadTools();
    }

    tabUsers.onclick = () => setActiveTab('users');
    tabTools.onclick = () => setActiveTab('tools');

    const parseCsv = (value) => String(value || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);

    const numberValue = (id, fallback = 0) => {
        const value = Number(modal.querySelector(`#${id}`).value);
        return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
    };

    function buildToolData() {
        const toolId = modal.querySelector('#tool-id').value.trim();
        const name = modal.querySelector('#tool-name').value.trim();
        const description = modal.querySelector('#tool-description').value.trim();
        const section = modal.querySelector('#tool-section').value;
        const endpoint = modal.querySelector('#tool-endpoint').value.trim();
        const enabled = modal.querySelector('#tool-enabled').checked;
        const aspects = parseCsv(modal.querySelector('#tool-aspects').value);
        const qualities = parseCsv(modal.querySelector('#tool-qualities').value);

        const pricing = {};
        const price2k = numberValue('price-2k', 60);
        const price4k = numberValue('price-4k', 120);

        if (qualities.includes('2k')) pricing['2k'] = price2k;
        if (qualities.includes('4k')) pricing['4k'] = price4k;

        qualities.forEach(q => {
            if (!pricing[q]) {
                pricing[q] = q === '4k' ? price4k : price2k;
            }
        });

        const schema = [
            {
                key: 'prompt',
                paramKey: 'prompt',
                label: 'Descripción',
                type: 'textarea',
                required: true,
                placeholder: 'Describe la imagen que quieres crear...'
            },
            {
                key: 'aspect_ratio',
                paramKey: 'aspect_ratio',
                label: 'Formato',
                type: 'select',
                required: true,
                default: aspects[0] || '1:1',
                options: aspects.length ? aspects : ['1:1', '9:16', '16:9']
            },
            {
                key: 'quality',
                paramKey: 'resolution',
                label: 'Calidad',
                type: 'select',
                required: true,
                default: qualities[0] || '2k',
                options: qualities.length ? qualities : ['2k', '4k']
            }
        ];

        return {
            toolId,
            privateData: {
                enabled,
                provider: 'muapi',
                section,
                name,
                description,
                endpoint,
                pricing,
                defaultParams: {
                    output_format: 'jpg'
                },
                schema,
                updatedAt: serverTimestamp()
            },
            publicData: {
                enabled,
                section,
                name,
                description,
                pricing,
                schema,
                updatedAt: serverTimestamp()
            }
        };
    }

    async function saveTool() {
        const status = modal.querySelector('#tool-form-status');
        const btn = modal.querySelector('#save-tool-btn');

        try {
            const { toolId, privateData, publicData } = buildToolData();

            if (!toolId) throw new Error('Falta el ID interno.');
            if (!privateData.name) throw new Error('Falta el nombre público.');
            if (!privateData.endpoint) throw new Error('Falta el endpoint de MuAPI.');

            btn.disabled = true;
            btn.textContent = 'Guardando...';
            status.textContent = '';

            await setDoc(doc(db, 'admin_ai_tools', toolId), privateData, { merge: true });
            await setDoc(doc(db, 'public_ai_tools', toolId), publicData, { merge: true });

            status.textContent = 'Herramienta guardada. Recarga KreateImage para verla en el desplegable.';
            status.className = 'text-xs text-green-400 min-h-[18px]';

            await loadTools();
        } catch (error) {
            status.textContent = error.message || 'Error guardando herramienta.';
            status.className = 'text-xs text-red-400 min-h-[18px]';
            console.error(error);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Guardar herramienta';
        }
    }

    async function loadTools() {
        const list = modal.querySelector('#tools-list');
        list.innerHTML = '<div class="px-5 py-8 text-center text-white/40 animate-pulse">Cargando herramientas...</div>';

        try {
            const snapshot = await getDocs(collection(db, 'public_ai_tools'));

            if (snapshot.empty) {
                list.innerHTML = '<div class="px-5 py-8 text-center text-white/40">No hay herramientas creadas todavía.</div>';
                return;
            }

            list.innerHTML = '';

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const pricing = data.pricing || {};
                const prices = Object.keys(pricing)
                    .map(k => `${k}: ${pricing[k]} CR`)
                    .join(' · ');

                const row = document.createElement('div');
                row.className = 'px-5 py-4 hover:bg-white/5 transition-colors';
                row.innerHTML = `
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <div class="flex items-center gap-2">
                                <strong class="text-white">${data.name || docSnap.id}</strong>
                                <span class="px-2 py-1 rounded-md text-[10px] font-bold uppercase ${data.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
                                    ${data.enabled ? 'Activa' : 'Pausada'}
                                </span>
                                <span class="px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400">
                                    ${data.section || '-'}
                                </span>
                            </div>
                            <p class="text-white/40 text-xs mt-1">${data.description || ''}</p>
                            <p class="text-[#FFB000] text-xs mt-2 font-mono">${prices || 'Sin precios'}</p>
                            <p class="text-white/25 text-[10px] mt-1 font-mono">${docSnap.id}</p>
                        </div>
                    </div>
                `;
                list.appendChild(row);
            });
        } catch (error) {
            console.error(error);
            list.innerHTML = '<div class="px-5 py-8 text-center text-red-400">Error cargando herramientas. Revisa permisos de Firestore.</div>';
        }
    }

    modal.querySelector('#save-tool-btn').onclick = saveTool;
    modal.querySelector('#reload-tools-btn').onclick = loadTools;

    // Función para cargar todos los usuarios de Firebase
    const loadUsers = async () => {
        try {
            const usersRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users');
            const snapshot = await getDocs(usersRef);

            tbody.innerHTML = '';

            if (snapshot.empty) {
                tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center">No hay usuarios registrados aún.</td></tr>`;
                return;
            }

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const uid = docSnap.id;
                const email = data.email || 'Sin Email';
                const credits = data.credits || 0;
                const role = data.role || 'user';

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-white/5 transition-colors group';

                tr.innerHTML = `
                    <td class="px-6 py-4 font-mono text-white">${email}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest ${role === 'admin' ? 'bg-[#FFB000]/20 text-[#FFB000]' : 'bg-blue-500/20 text-blue-400'}">
                            ${role}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2">
                            <span class="text-xl font-black text-white" id="credit-display-${uid}">${credits}</span>
                            <span class="text-[#FFB000] text-xs font-bold">CR</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <div class="flex justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                            <button class="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-colors" onclick="window.updateCredits('${uid}', -50)">-50</button>
                            <button class="bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-colors" onclick="window.updateCredits('${uid}', 50)">+50</button>
                            <button class="bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-colors" onclick="window.setCustomCredits('${uid}', '${email}')">Editar</button>
                        </div>
                    </td>
                `;

                tbody.appendChild(tr);
            });
        } catch (error) {
            console.error('Error cargando usuarios:', error);
            tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-red-400">Error de permisos. Asegúrate de que las reglas de Firestore permiten leer la base de datos.</td></tr>`;
        }
    };

    window.updateCredits = async (uid, amount) => {
        try {
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', uid);
            const snap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'));

            let currentCredits = 0;

            snap.forEach(d => {
                if (d.id === uid) currentCredits = d.data().credits || 0;
            });

            const newCredits = Math.max(0, currentCredits + amount);
            await updateDoc(userRef, { credits: newCredits });

            const display = document.getElementById(`credit-display-${uid}`);
            if (display) display.textContent = newCredits;
        } catch (error) {
            alert('Error al actualizar créditos.');
            console.error(error);
        }
    };

    window.setCustomCredits = async (uid, email) => {
        const input = prompt(`¿Cuántos créditos quieres asignarle exactamente a ${email}?`);

        if (input !== null && input !== '' && !isNaN(input)) {
            try {
                const newCredits = parseInt(input);
                const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', uid);

                await updateDoc(userRef, { credits: newCredits });

                const display = document.getElementById(`credit-display-${uid}`);
                if (display) display.textContent = newCredits;
            } catch (error) {
                alert('Error al guardar.');
            }
        }
    };

    modal.querySelector('#close-admin-btn').onclick = () => document.body.removeChild(overlay);

    loadUsers();

    overlay.appendChild(modal);
    return overlay;
}
