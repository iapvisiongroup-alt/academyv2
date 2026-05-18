import { muapi } from '../lib/muapi.js';
import {
    t2iModels, getAspectRatiosForModel, getResolutionsForModel,
    i2iModels, getAspectRatiosForI2IModel, getResolutionsForI2IModel,
    getMaxImagesForI2IModel
} from '../lib/models.js';
import { AuthModal } from './AuthModal.js';
import { createUploadPicker } from './UploadPicker.js';

import { auth, db, APP_ID } from '../lib/firebase.js';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ===============================
// SOLO ESTOS DOS MODELOS
// ===============================

const ACTIVE_T2I = [
    { id: 'nano-banana-2', name: 'KreateImage 2' }
];

const ACTIVE_I2I = [
    { id: 'nano-banana-2-edit', name: 'KreateImage 2 Edit' }
];

// ===============================
// COSTES
// ===============================

const getModelCost = (modelId) => {
    if (modelId === 'nano-banana-2')      return 24;  // $0.12 -> 24 CR
    if (modelId === 'nano-banana-2-edit') return 12;  // $0.06 -> 12 CR
    return 6;
};

export function ImageStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center bg-app-bg relative p-2 md:p-6 pb-24 overflow-y-auto custom-scrollbar overflow-x-hidden';

    const defaultModel = ACTIVE_T2I[0];
    let selectedModel     = defaultModel.id;
    let selectedModelName = defaultModel.name;
    let selectedAr        = '1:1';
    let dropdownOpen      = null;
    let uploadedImageUrls = [];
    let imageMode         = false;
    let negativePrompt    = '';
    let showAdvanced      = false;
    let selectedStyle     = 'Ninguno';

    const getCurrentModels      = () => imageMode ? ACTIVE_I2I : ACTIVE_T2I;
    const getCurrentAspectRatios = (id) => imageMode ? getAspectRatiosForI2IModel(id) : getAspectRatiosForModel(id);
    const getCurrentResolutions  = (id) => imageMode ? getResolutionsForI2IModel(id)  : getResolutionsForModel(id);

    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.className = 'bg-[#FFB000] text-black px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-[1.5rem] font-black text-sm md:text-base hover:shadow-[0_0_20px_rgba(255,176,0,0.4)] active:scale-95 transition-all flex items-center justify-center gap-1.5 md:gap-2.5 w-full sm:w-auto shadow-lg shrink-0 mt-2 sm:mt-0';

    const updateControlsForMode = () => {
        const availableArs = getCurrentAspectRatios(selectedModel);
        if (availableArs?.length && !availableArs.includes(selectedAr)) selectedAr = availableArs[0];

        const mLabel = container.querySelector('#model-btn-label');
        if (mLabel) mLabel.textContent = selectedModelName;

        const aLabel = container.querySelector('#ar-btn-label');
        if (aLabel) aLabel.textContent = selectedAr;

        const validRes = getCurrentResolutions(selectedModel);
        const qBtn     = container.querySelector('#quality-btn');
        if (qBtn) {
            qBtn.style.display = validRes?.length ? 'flex' : 'none';
            const qLabel = container.querySelector('#quality-btn-label');
            if (validRes?.length && qLabel) qLabel.textContent = validRes[0];
        }

        const cost = getModelCost(selectedModel);
        generateBtn.innerHTML = `Generar ✨ <span class="bg-black/20 px-2 py-0.5 rounded-md text-[10px] md:text-xs font-mono ml-1 shadow-inner border border-black/10">${cost} 🪙</span>`;
    };

    // ===============================
    // HERO
    // ===============================

    const hero = document.createElement('div');
    hero.className = 'flex flex-col items-center mb-6 md:mb-16 mt-4 md:mt-0 animate-fade-in-up transition-all duration-700 shrink-0';
    hero.innerHTML = `
        <div class="mb-6 md:mb-10 relative group">
            <div class="absolute inset-0 bg-[#3B82F6]/20 blur-[60px] md:blur-[100px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-1000"></div>
            <div class="relative w-16 h-16 md:w-32 md:h-32 bg-[#0a0a0a] rounded-2xl md:rounded-3xl flex items-center justify-center border border-white/5 overflow-hidden">
                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-[#3B82F6] opacity-20 absolute -right-2 -bottom-2 md:-right-4 md:-bottom-4 w-12 md:w-20"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                <div class="w-10 h-10 md:w-16 md:h-16 bg-[#3B82F6]/10 rounded-xl md:rounded-2xl flex items-center justify-center border border-[#3B82F6]/20 shadow-glow relative z-10">
                    <svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[#3B82F6] w-5 md:w-8"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
                <div class="absolute top-2 right-2 md:top-4 md:right-4 text-[#FFB000] animate-pulse text-xs md:text-base">✨</div>
            </div>
        </div>
        <h1 class="text-xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-2 md:mb-4 selection:bg-[#FFB000] selection:text-black text-center px-4">Estudio de Imagen</h1>
        <p class="text-white/50 text-[10px] md:text-sm font-medium tracking-wide opacity-60 text-center px-4">Crea y edita imágenes increíbles con IA</p>
    `;
    container.appendChild(hero);

    // ===============================
    // PROMPT BAR
    // ===============================

    const promptWrapper = document.createElement('div');
    promptWrapper.className = 'w-full max-w-4xl relative z-40 animate-fade-in-up shrink-0 px-2 md:px-0';

    const bar = document.createElement('div');
    bar.className = 'w-full bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] p-3 md:p-5 flex flex-col gap-3 md:gap-5 shadow-3xl';

    const topRow = document.createElement('div');
    topRow.className = 'flex items-start gap-3 md:gap-5 px-1 md:px-2';

    const picker = createUploadPicker({
        anchorContainer: container,
        onSelect: ({ url, urls }) => {
            uploadedImageUrls = urls || [url];
            if (!imageMode) {
                imageMode         = true;
                selectedModel     = ACTIVE_I2I[0].id;
                selectedModelName = ACTIVE_I2I[0].name;
                updateControlsForMode();
                picker.setMaxImages(getMaxImagesForI2IModel(selectedModel));
            }
            textarea.placeholder = uploadedImageUrls.length > 1
                ? `${uploadedImageUrls.length} imágenes seleccionadas`
                : 'Describe cómo editar esta imagen (opcional)';
        },
        onClear: () => {
            uploadedImageUrls = [];
            imageMode         = false;
            selectedModel     = ACTIVE_T2I[0].id;
            selectedModelName = ACTIVE_T2I[0].name;
            updateControlsForMode();
            picker.setMaxImages(1);
            textarea.placeholder = 'Describe la imagen que quieres crear...';
        }
    });
    topRow.appendChild(picker.trigger);
    container.appendChild(picker.panel);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Describe la imagen que quieres crear...';
    textarea.className = 'flex-1 bg-transparent border-none text-white text-sm md:text-xl placeholder:text-muted focus:outline-none resize-none pt-2 md:pt-2.5 leading-relaxed min-h-[40px] max-h-[150px] md:max-h-[250px] overflow-y-auto custom-scrollbar';
    textarea.rows = 1;
    textarea.oninput = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, window.innerWidth < 768 ? 120 : 250) + 'px';
    };
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateBtn.click(); }
    });

    topRow.appendChild(textarea);
    bar.appendChild(topRow);

    // ===============================
    // CONTROLES
    // ===============================

    const bottomRow = document.createElement('div');
    bottomRow.className = 'flex flex-col sm:flex-row items-center justify-between gap-3 px-1 md:px-2 pt-3 border-t border-white/5';

    const controlsLeft = document.createElement('div');
    controlsLeft.className = 'flex flex-wrap items-center justify-center sm:justify-start gap-1.5 md:gap-2.5 w-full sm:w-auto';

    const createControlBtn = (icon, label, id) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = id;
        btn.className = 'flex items-center gap-1.5 md:gap-2.5 px-2.5 py-1.5 md:px-4 md:py-2.5 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl transition-all border border-white/5 group whitespace-nowrap flex-1 sm:flex-none justify-center';
        btn.innerHTML = `${icon}<span id="${id}-label" class="text-[10px] md:text-xs font-bold text-white group-hover:text-[#FFB000] transition-colors truncate max-w-[80px] md:max-w-none">${label}</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" class="opacity-20 group-hover:opacity-100 transition-opacity shrink-0"><path d="M6 9l6 6 6-6"/></svg>`;
        return btn;
    };

    const modelBtn = createControlBtn(`<div class="w-4 h-4 md:w-5 md:h-5 bg-[#3B82F6] rounded flex items-center justify-center shadow-lg shadow-[#3B82F6]/20 shrink-0"><span class="text-[8px] md:text-[10px] font-black text-white">K</span></div>`, selectedModelName, 'model-btn');
    const arBtn    = createControlBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`, selectedAr, 'ar-btn');
    const qualityBtn = createControlBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><path d="M6 2L3 6v15a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"/></svg>`, '720p', 'quality-btn');
    const advancedBtn = createControlBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 001.82-.33 1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-1.82.33A1.65 1.65 0 0019.4 9a1.65 1.65 0 00-1.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`, 'Avanzado', 'advanced-btn');

    controlsLeft.appendChild(modelBtn);
    controlsLeft.appendChild(arBtn);
    controlsLeft.appendChild(qualityBtn);
    controlsLeft.appendChild(advancedBtn);
    bottomRow.appendChild(controlsLeft);
    bottomRow.appendChild(generateBtn);
    bar.appendChild(bottomRow);
    promptWrapper.appendChild(bar);
    container.appendChild(promptWrapper);

    container.appendChild(Object.assign(document.createElement('div'), {
        className: 'w-full text-center text-white/30 text-sm flex flex-col items-center gap-1 md:gap-2 py-2 px-4',
        innerHTML: `<p class="text-xs md:text-sm">🖼️ Escribe un prompt y haz clic en <span class="text-[#FFB000] font-semibold">Generar</span>.</p><p class="text-[10px] md:text-xs text-white/20">Puedes lanzar varias generaciones a la vez sin esperar.</p>`
    }));

    // ===============================
    // PANEL AVANZADO
    // ===============================

    const STYLE_PRESETS = ['Ninguno', 'Fotorrealista', 'Anime', 'Cinematográfico', 'Pintura al Óleo', 'Acuarela', 'Arte Digital', 'Arte Conceptual', 'Cyberpunk'];
    const advancedPanel = document.createElement('div');
    advancedPanel.className = 'w-full max-w-4xl mt-4 animate-fade-in-up hidden shrink-0 px-2 md:px-0';
    advancedPanel.innerHTML = `
        <div class="bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 md:p-5 flex flex-col gap-4 shadow-xl">
            <div class="flex items-center justify-between pb-3 border-b border-white/5">
                <h3 class="text-xs md:text-sm font-bold text-white">Opciones Avanzadas</h3>
                <button id="close-adv-btn" class="text-white/40 hover:text-white transition-colors p-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>
            <div class="flex flex-col gap-2">
                <label class="text-[10px] md:text-xs font-bold text-white/50 uppercase tracking-wider">Estilos Predefinidos</label>
                <div class="flex gap-1.5 flex-wrap">
                    ${STYLE_PRESETS.map(s => `<button class="style-preset-btn px-2 py-1.5 md:px-3 rounded-lg text-[10px] md:text-xs font-bold bg-white/5 text-white/50 hover:bg-white/10 transition-all border border-transparent" data-style="${s}">${s}</button>`).join('')}
                </div>
            </div>
            <div class="flex flex-col gap-2 mt-2">
                <label class="text-[10px] md:text-xs font-bold text-white/50 uppercase tracking-wider">Prompt Negativo</label>
                <input type="text" id="negative-prompt-input" placeholder="Qué excluir..." class="w-full bg-white/5 border border-white/10 rounded-xl px-3 md:px-4 py-2 text-white text-xs md:text-sm focus:border-[#3B82F6]/50 transition-colors">
            </div>
        </div>
    `;
    container.appendChild(advancedPanel);

    advancedBtn.addEventListener('click', () => {
        showAdvanced = !showAdvanced;
        advancedPanel.classList.toggle('hidden', !showAdvanced);
        const l = container.querySelector('#advanced-btn-label');
        if (l) l.textContent = showAdvanced ? 'Ocultar' : 'Avanzado';
    });
    advancedPanel.querySelector('#close-adv-btn').onclick = () => advancedBtn.click();
    advancedPanel.querySelector('#negative-prompt-input').oninput = (e) => { negativePrompt = e.target.value; };
    advancedPanel.querySelectorAll('.style-preset-btn').forEach(btn => {
        btn.onclick = () => {
            selectedStyle = btn.dataset.style;
            advancedPanel.querySelectorAll('.style-preset-btn').forEach(b => b.classList.remove('bg-[#3B82F6]/20', 'text-[#3B82F6]', 'border-[#3B82F6]/30'));
            btn.classList.add('bg-[#3B82F6]/20', 'text-[#3B82F6]', 'border-[#3B82F6]/30');
        };
    });

    // ===============================
    // DROPDOWNS
    // ===============================

    const dropdown = document.createElement('div');
    dropdown.className = 'fixed z-[999999] transition-all opacity-0 pointer-events-none scale-95 rounded-2xl md:rounded-3xl p-2 md:p-3 shadow-2xl border border-white/10 flex flex-col bg-[#111]/95 backdrop-blur-xl';

    const closeDropdown = () => {
        dropdown.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
        dropdown.classList.remove('opacity-100', 'pointer-events-auto', 'scale-100');
    };

    const showDropdown = (type, anchorBtn) => {
        dropdown.innerHTML = '';
        dropdown.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
        dropdown.classList.add('opacity-100', 'pointer-events-auto', 'scale-100');

        if (type === 'model') {
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Modelos KreateIA</div><div class="flex flex-col gap-1"></div>`;
            getCurrentModels().forEach(m => {
                const item = document.createElement('div');
                item.className = `flex items-center justify-between p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-all ${selectedModel === m.id ? 'bg-white/5' : ''}`;
                item.innerHTML = `<div class="flex items-center gap-3"><div class="w-8 h-8 md:w-10 md:h-10 bg-[#3B82F6]/10 text-[#3B82F6] border border-white/5 rounded-lg md:rounded-xl flex items-center justify-center font-black text-xs">K</div><span class="text-xs md:text-sm font-bold text-white">${m.name}</span></div>${selectedModel === m.id ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.addEventListener('click', (e) => { e.stopPropagation(); selectedModel = m.id; selectedModelName = m.name; updateControlsForMode(); closeDropdown(); });
                dropdown.querySelector('div:last-child').appendChild(item);
            });
        } else if (type === 'ar') {
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Relación de Aspecto</div><div class="flex flex-col gap-1"></div>`;
            (getCurrentAspectRatios(selectedModel) || []).forEach(r => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-all';
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white">${r}</span>${selectedAr === r ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.addEventListener('click', (e) => { e.stopPropagation(); selectedAr = r; const l = container.querySelector('#ar-btn-label'); if (l) l.textContent = r; closeDropdown(); });
                dropdown.querySelector('div:last-child').appendChild(item);
            });
        } else if (type === 'quality') {
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Resolución</div><div class="flex flex-col gap-1"></div>`;
            (getCurrentResolutions(selectedModel) || []).forEach(opt => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-all';
                const qLabel = container.querySelector('#quality-btn-label');
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white">${opt}</span>${qLabel?.textContent === opt ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.addEventListener('click', (e) => { e.stopPropagation(); if (qLabel) qLabel.textContent = opt; closeDropdown(); });
                dropdown.querySelector('div:last-child').appendChild(item);
            });
        }

        const rect = anchorBtn.getBoundingClientRect();
        if (window.innerWidth < 768) {
            dropdown.style.bottom = '16px'; dropdown.style.left = '16px'; dropdown.style.right = '16px'; dropdown.style.width = 'auto'; dropdown.style.top = 'auto';
        } else {
            dropdown.style.top = `${rect.bottom + 8}px`; dropdown.style.left = `${rect.left}px`; dropdown.style.width = type === 'model' ? '280px' : '220px'; dropdown.style.bottom = 'auto';
        }
    };

    modelBtn.addEventListener('click',   (e) => { e.stopPropagation(); showDropdown('model',   modelBtn); });
    arBtn.addEventListener('click',      (e) => { e.stopPropagation(); showDropdown('ar',      arBtn); });
    qualityBtn.addEventListener('click', (e) => { e.stopPropagation(); showDropdown('quality', qualityBtn); });
    window.addEventListener('click', (e) => { if (!dropdown.contains(e.target)) closeDropdown(); });
    document.body.appendChild(dropdown);

    // ===============================
    // GALERÍA
    // ===============================

    const galleryWrapper = document.createElement('div');
    galleryWrapper.className = 'w-full max-w-6xl mt-4 md:mt-8 flex-1 flex flex-col shrink-0 px-2 md:px-0';
    const galleryHeader = document.createElement('h3');
    galleryHeader.className = 'text-[10px] md:text-xs font-bold text-white/40 uppercase tracking-widest mb-3 md:mb-4 px-2 hidden';
    galleryHeader.textContent = 'Tus Creaciones';
    const galleryGrid = document.createElement('div');
    galleryGrid.className = 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4 w-full';
    galleryWrapper.appendChild(galleryHeader);
    galleryWrapper.appendChild(galleryGrid);
    container.appendChild(galleryWrapper);

    const renderCard = (entry, isPrepend = false) => {
        galleryHeader.classList.remove('hidden');
        const card = document.createElement('div');
        card.className = 'relative aspect-square rounded-xl md:rounded-2xl overflow-hidden bg-white/5 border border-white/10 group animate-fade-in-up cursor-pointer';
        card.innerHTML = `<img src="${entry.url}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy"><div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 md:p-4 flex flex-col justify-end"><p class="text-white text-[10px] md:text-xs line-clamp-2 leading-tight">${entry.prompt || ''}</p></div>`;
        card.onclick = async () => {
            const blob = await fetch(entry.url).then(r => r.blob());
            window.open(URL.createObjectURL(blob), '_blank');
        };
        if (isPrepend) galleryGrid.prepend(card); else galleryGrid.appendChild(card);
    };

    const loadHistory = async (user) => {
        try {
            const q    = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'generations'), orderBy('createdAt', 'desc'), limit(20));
            const snap = await getDocs(q);
            snap.forEach(d => renderCard({ id: d.id, ...d.data() }));
        } catch (e) { console.error('[ImageStudio] Historial:', e); }
    };

    onAuthStateChanged(auth, (user) => { if (user) loadHistory(user); });

    // ===============================
    // GENERACIÓN — permite múltiples en paralelo
    // ===============================

    generateBtn.addEventListener('click', async () => {
        const promptText = textarea.value.trim();
        if (!auth.currentUser) return alert('Debes iniciar sesión para generar imágenes.');
        if (!imageMode && !promptText) return alert('Por favor, escribe un prompt.');

        const cost    = getModelCost(selectedModel);
        const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid);

        // Verificar saldo
        try {
            const snap    = await getDoc(userRef);
            const credits = snap.exists() ? (snap.data().credits || 0) : 0;
            const isAdmin = snap.exists() && snap.data().role === 'admin';
            if (!isAdmin && credits < cost) {
                return alert(`⚠️ Saldo insuficiente.\n\nEste modelo requiere ${cost} 🪙 y tienes ${credits} 🪙.\n\nRecarga créditos en tu perfil.`);
            }
        } catch (e) {
            return alert('No hemos podido verificar tu saldo. Revisa tu conexión.');
        }

        // Tarjeta de carga
        galleryHeader.classList.remove('hidden');
        const loadingCard = document.createElement('div');
        loadingCard.className = 'relative aspect-square rounded-xl md:rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex flex-col items-center justify-center animate-pulse';
        loadingCard.innerHTML = `<div class="w-8 h-8 border-4 border-[#FFB000]/30 border-t-[#FFB000] rounded-full animate-spin mb-2"></div><span class="text-[10px] font-bold text-[#FFB000]">Generando...</span>`;
        galleryGrid.prepend(loadingCard);

        textarea.value = '';
        textarea.style.height = 'auto';

        try {
            let finalPrompt = promptText || (imageMode ? 'Edición de imagen' : '');
            if (selectedStyle && selectedStyle !== 'Ninguno') finalPrompt += `, estilo ${selectedStyle.toLowerCase()}`;

            let res;

            if (imageMode) {
                // I2I — llamada directa al proxy igual que ImageStudio original
                const token = await auth.currentUser.getIdToken();
                const req   = await fetch(`/api/v1/${selectedModel}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ model: selectedModel, images_list: uploadedImageUrls, aspect_ratio: selectedAr, prompt: finalPrompt, ...(negativePrompt && { negative_prompt: negativePrompt }) })
                });
                res = await req.json();

                if (res.request_id && !res.url) {
                    let attempts = 0;
                    while (attempts < 60) {
                        await new Promise(r => setTimeout(r, 2000));
                        const poll    = await fetch(`/api/v1/predictions/${res.request_id}/result`, { headers: { 'Authorization': `Bearer ${token}` } });
                        if (poll.ok) {
                            const p = await poll.json();
                            const u = p.url || p.image_url || p.output?.outputs?.[0] || p.outputs?.[0] || p.images?.[0]?.url;
                            if (u) { res.url = u; break; }
                            if (p.status === 'failed' || p.status === 'error') throw new Error('Error en la generación.');
                        }
                        attempts++;
                    }
                }
            } else {
                // T2I — usa muapi.generateImage (que ya incluye polling)
                res = await muapi.generateImage({
                    model: selectedModel,
                    prompt: finalPrompt,
                    aspect_ratio: selectedAr,
                    ...(negativePrompt && { negative_prompt: negativePrompt })
                });
            }

            if (!res?.url) throw new Error('No se recibió URL de la imagen.');

            // Descontar créditos
            try { await updateDoc(userRef, { credits: increment(-cost) }); }
            catch (e) { console.warn('[ImageStudio] No se descontaron créditos:', e); }

            // Guardar en Firebase
            const entry  = { url: res.url, prompt: finalPrompt, model: selectedModel, aspect_ratio: selectedAr, createdAt: serverTimestamp() };
            const docRef = await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid, 'generations'), entry);

            loadingCard.remove();
            renderCard({ id: docRef.id, ...entry }, true);

        } catch (e) {
            console.error('[ImageStudio] Error:', e);
            loadingCard.innerHTML = `
                <div class="absolute inset-0 bg-red-500/10"></div>
                <div class="z-10 flex flex-col items-center gap-1 p-3 text-center">
                    <span class="text-lg">⚠️</span>
                    <span class="text-[8px] font-bold text-red-400">Error al generar</span>
                    <span class="text-white/40 text-[7px] px-1">${String(e.message || '').slice(0, 80)}</span>
                    <button class="mt-1 bg-white/10 px-2 py-1 rounded text-[8px] text-white hover:bg-white/20" onclick="this.closest('.aspect-square').remove()">Cerrar</button>
                </div>
            `;
        }
    });

    updateControlsForMode();
    return container;
}
