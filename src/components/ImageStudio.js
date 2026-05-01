import { muapi } from '../lib/muapi.js';
import {
    t2iModels, getAspectRatiosForModel, getResolutionsForModel, getQualityFieldForModel,
    i2iModels, getAspectRatiosForI2IModel, getResolutionsForI2IModel, getQualityFieldForI2IModel,
    getMaxImagesForI2IModel
} from '../lib/models.js';
import { AuthModal } from './AuthModal.js';
import { createUploadPicker } from './UploadPicker.js';

// IMPORTANTE: Hemos añadido getDoc, updateDoc, increment y doc para cobrar los créditos
import { auth, db, APP_ID } from '../lib/firebase.js';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

function createInlineInstructions(type) {
    const el = document.createElement('div');
    el.className = 'w-full text-center text-white/30 text-sm flex flex-col items-center gap-1 md:gap-2 py-2 px-4';
    const icon = type === 'image' ? '🖼️' : '🎬';
    el.innerHTML = `
        <p class="text-xs md:text-sm">${icon} Escribe un prompt y haz clic en <span class="text-[#FFB000] font-semibold">Generar</span>.</p>
        <p class="text-[10px] md:text-xs text-white/20">Puedes lanzar varias generaciones a la vez sin esperar.</p>
    `;
    return el;
}

// SISTEMA DE PRECIOS DINÁMICO (Margen x2)
const getModelCost = (modelId) => {
    if (modelId === 'nano-banana-2') return 24;                 // $0.12 coste -> 24 créditos
    if (modelId.includes('nano-banana-2-edit')) return 12;      // $0.06 coste -> 12 créditos
    if (modelId.includes('pro')) return 12;                     // Estimación Pro -> 12 créditos
    return 6;                                                   // Base ($0.03) -> 6 créditos
};

// FILTRO ESTRICTO Y MARCA BLANCA
const filterAndRenameModels = (modelsList, isI2I) => {
    if (isI2I) {
        const allowedIds = ['nano-banana-edit', 'nano-banana-effects', 'nano-banana-pro-edit', 'nano-banana-2-edit'];
        return modelsList
            .filter(m => allowedIds.includes(m.id))
            .map(m => {
                let newName = m.name;
                if (m.id === 'nano-banana-edit') newName = 'KreateImage Edit';
                if (m.id === 'nano-banana-effects') newName = 'KreateImage Effects';
                if (m.id === 'nano-banana-pro-edit') newName = 'KreateImage Pro Edit';
                if (m.id === 'nano-banana-2-edit') newName = 'KreateImage 2 Edit';
                return { ...m, name: newName };
            });
    } else {
        const allowedIds = ['nano-banana', 'nano-banana-pro', 'nano-banana-2'];
        return modelsList
            .filter(m => allowedIds.includes(m.id))
            .map(m => {
                let newName = m.name;
                if (m.id === 'nano-banana') newName = 'KreateImage';
                if (m.id === 'nano-banana-pro') newName = 'KreateImage Pro';
                if (m.id === 'nano-banana-2') newName = 'KreateImage 2';
                return { ...m, name: newName };
            });
    }
};

export function ImageStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center bg-app-bg relative p-2 md:p-6 pb-24 overflow-y-auto custom-scrollbar overflow-x-hidden';

    const activeT2iModels = filterAndRenameModels(t2iModels, false);
    const activeI2iModels = filterAndRenameModels(i2iModels, true);

    const defaultModel = activeT2iModels.length > 0 ? activeT2iModels[0] : t2iModels[0];
    let selectedModel = defaultModel.id;
    let selectedModelName = defaultModel.name;
    let selectedAr = defaultModel.inputs?.aspect_ratio?.default || '1:1';
    let dropdownOpen = null;
    let uploadedImageUrls = []; 
    let imageMode = false; 

    let negativePrompt = '';
    let showAdvanced = false;
    let selectedStyle = 'Ninguno';

    const getCurrentModels = () => imageMode ? activeI2iModels : activeT2iModels;
    const getCurrentAspectRatios = (id) => imageMode ? getAspectRatiosForI2IModel(id) : getAspectRatiosForModel(id);
    const getCurrentResolutions = (id) => imageMode ? getResolutionsForI2IModel(id) : getResolutionsForModel(id);
    const getCurrentQualityField = (id) => imageMode ? getQualityFieldForI2IModel(id) : getQualityFieldForModel(id);

    // --- HERO SECTION ---
    const hero = document.createElement('div');
    hero.className = 'flex flex-col items-center mb-6 md:mb-16 mt-4 md:mt-0 animate-fade-in-up transition-all duration-700 shrink-0';
    hero.innerHTML = `
        <div class="mb-6 md:mb-10 relative group">
             <div class="absolute inset-0 bg-[#3B82F6]/20 blur-[60px] md:blur-[100px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-1000"></div>
             <div class="relative w-16 h-16 md:w-32 md:h-32 bg-[#0a0a0a] rounded-2xl md:rounded-3xl flex items-center justify-center border border-white/5 overflow-hidden">
                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-[#3B82F6] opacity-20 absolute -right-2 -bottom-2 md:-right-4 md:-bottom-4 w-12 md:w-20">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                </svg>
                <div class="w-10 h-10 md:w-16 md:h-16 bg-[#3B82F6]/10 rounded-xl md:rounded-2xl flex items-center justify-center border border-[#3B82F6]/20 shadow-glow relative z-10">
                    <svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[#3B82F6] w-5 md:w-8">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                    </svg>
                </div>
                <div class="absolute top-2 right-2 md:top-4 md:right-4 text-[#FFB000] animate-pulse text-xs md:text-base">✨</div>
             </div>
        </div>
        <h1 class="text-xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-2 md:mb-4 selection:bg-[#FFB000] selection:text-black text-center px-4">Estudio de Imagen</h1>
        <p class="text-white/50 text-[10px] md:text-sm font-medium tracking-wide opacity-60 text-center px-4">Transforma imágenes con IA — escala, estiliza, anima y más</p>
    `;
    container.appendChild(hero);

    // --- PROMPT BAR Y BOTÓN DE GENERAR PRE-DECLARADO ---
    const promptWrapper = document.createElement('div');
    promptWrapper.className = 'w-full max-w-4xl relative z-40 animate-fade-in-up shrink-0 px-2 md:px-0';
    promptWrapper.style.animationDelay = '0.2s';

    const bar = document.createElement('div');
    bar.className = 'w-full bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] p-3 md:p-5 flex flex-col gap-3 md:gap-5 shadow-3xl';

    const topRow = document.createElement('div');
    topRow.className = 'flex items-start gap-3 md:gap-5 px-1 md:px-2';

    // Declaramos el botón aquí para poder actualizar su coste desde updateControlsForMode
    const generateBtn = document.createElement('button');
    generateBtn.className = 'bg-[#FFB000] text-black px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-[1.5rem] font-black text-sm md:text-base hover:shadow-[0_0_20px_rgba(255,176,0,0.4)] active:scale-95 transition-all flex items-center justify-center gap-1.5 md:gap-2.5 w-full sm:w-auto shadow-lg shrink-0 mt-2 sm:mt-0';

    const updateControlsForMode = () => {
        const availableArs = getCurrentAspectRatios(selectedModel);
        selectedAr = availableArs[0] || '1:1';
        document.getElementById('model-btn-label').textContent = selectedModelName;
        document.getElementById('ar-btn-label').textContent = selectedAr;
        
        const validResolutions = getCurrentResolutions(selectedModel);
        const qualityBtnEl = document.getElementById('quality-btn');
        if (qualityBtnEl) {
            qualityBtnEl.style.display = validResolutions.length > 0 ? 'flex' : 'none';
            if (validResolutions.length > 0) document.getElementById('quality-btn-label').textContent = validResolutions[0];
        }

        // Actualizamos el botón de generar con el precio correspondiente
        const cost = getModelCost(selectedModel);
        generateBtn.innerHTML = `Generar ✨ <span class="bg-black/20 px-2 py-0.5 rounded-md text-[10px] md:text-xs font-mono ml-1 shadow-inner border border-black/10">${cost} 🪙</span>`;
    };

    const picker = createUploadPicker({
        anchorContainer: container,
        onSelect: ({ url, urls }) => {
            uploadedImageUrls = urls || [url];
            if (!imageMode) {
                imageMode = true;
                selectedModel = activeI2iModels.length > 0 ? activeI2iModels[0].id : defaultModel.id;
                selectedModelName = activeI2iModels.length > 0 ? activeI2iModels[0].name : defaultModel.name;
                updateControlsForMode();
                picker.setMaxImages(getMaxImagesForI2IModel(selectedModel));
            }
            textarea.placeholder = uploadedImageUrls.length > 1
                ? `${uploadedImageUrls.length} imágenes seleccionadas`
                : 'Describe cómo transformar esta imagen (opcional)';
        },
        onClear: () => {
            uploadedImageUrls = [];
            imageMode = false;
            selectedModel = activeT2iModels.length > 0 ? activeT2iModels[0].id : defaultModel.id;
            selectedModelName = activeT2iModels.length > 0 ? activeT2iModels[0].name : defaultModel.name;
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
        const maxHeight = window.innerWidth < 768 ? 120 : 250;
        textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
    };

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            generateBtn.click();
        }
    });

    topRow.appendChild(textarea);
    bar.appendChild(topRow);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'flex flex-col sm:flex-row items-center justify-between gap-3 px-1 md:px-2 pt-3 border-t border-white/5';

    const controlsLeft = document.createElement('div');
    controlsLeft.className = 'flex flex-wrap items-center justify-center sm:justify-start gap-1.5 md:gap-2.5 w-full sm:w-auto';

    const createControlBtn = (icon, label, id) => {
        const btn = document.createElement('button');
        btn.id = id;
        btn.className = 'flex items-center gap-1.5 md:gap-2.5 px-2.5 py-1.5 md:px-4 md:py-2.5 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl transition-all border border-white/5 group whitespace-nowrap flex-1 sm:flex-none justify-center';
        btn.innerHTML = `
            ${icon}
            <span id="${id}-label" class="text-[10px] md:text-xs font-bold text-white group-hover:text-[#FFB000] transition-colors truncate max-w-[80px] md:max-w-none">${label}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" class="opacity-20 group-hover:opacity-100 transition-opacity shrink-0"><path d="M6 9l6 6 6-6"/></svg>
        `;
        return btn;
    };

    const modelBtn = createControlBtn(`
        <div class="w-4 h-4 md:w-5 md:h-5 bg-[#3B82F6] rounded flex items-center justify-center shadow-lg shadow-[#3B82F6]/20 shrink-0">
            <span class="text-[8px] md:text-[10px] font-black text-white">K</span>
        </div>
    `, selectedModelName, 'model-btn');

    const arBtn = createControlBtn(`
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
    `, selectedAr, 'ar-btn');

    const qualityBtn = createControlBtn(`
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><path d="M6 2L3 6v15a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"/></svg>
    `, '720p', 'quality-btn');

    controlsLeft.appendChild(modelBtn);
    controlsLeft.appendChild(arBtn);
    controlsLeft.appendChild(qualityBtn);
    
    const advancedBtn = createControlBtn(`
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 001.82-.33 1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-1.82.33A1.65 1.65 0 0019.4 9a1.65 1.65 0 00-1.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    `, 'Avanzado', 'advanced-btn');
    controlsLeft.appendChild(advancedBtn);

    bottomRow.appendChild(controlsLeft);
    bottomRow.appendChild(generateBtn);
    bar.appendChild(bottomRow);
    promptWrapper.appendChild(bar);
    container.appendChild(promptWrapper);

    // Inicializamos el precio del botón por primera vez
    updateControlsForMode();

    const inlineInstructions = createInlineInstructions('image');
    container.appendChild(inlineInstructions);

    // --- ADVANCED OPTIONS PANEL ---
    const STYLE_PRESETS = ['Ninguno', 'Fotorrealista', 'Anime', 'Cinematográfico', 'Pintura al Óleo', 'Acuarela', 'Arte Digital', 'Arte Conceptual', 'Cyberpunk'];
    const advancedPanel = document.createElement('div');
    advancedPanel.className = 'w-full max-w-4xl mt-4 animate-fade-in-up hidden shrink-0 px-2 md:px-0';
    advancedPanel.id = 'advanced-panel';
    advancedPanel.innerHTML = `
        <div class="bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 md:p-5 flex flex-col gap-4 shadow-xl">
            <div class="flex items-center justify-between pb-3 border-b border-white/5">
                <h3 class="text-xs md:text-sm font-bold text-white">Opciones Avanzadas</h3>
                <button id="close-adv-btn" class="text-white/40 hover:text-white transition-colors p-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
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

    advancedBtn.onclick = () => {
        showAdvanced = !showAdvanced;
        advancedPanel.classList.toggle('hidden', !showAdvanced);
        document.getElementById('advanced-btn-label').textContent = showAdvanced ? 'Ocultar' : 'Avanzado';
    };
    advancedPanel.querySelector('#close-adv-btn').onclick = () => advancedBtn.click();
    advancedPanel.querySelector('#negative-prompt-input').oninput = (e) => { negativePrompt = e.target.value; };
    advancedPanel.querySelectorAll('.style-preset-btn').forEach(btn => {
        btn.onclick = () => {
            selectedStyle = btn.dataset.style;
            advancedPanel.querySelectorAll('.style-preset-btn').forEach(b => b.classList.remove('bg-[#3B82F6]/20', 'text-[#3B82F6]', 'border-[#3B82F6]/30'));
            btn.classList.add('bg-[#3B82F6]/20', 'text-[#3B82F6]', 'border-[#3B82F6]/30');
        };
    });

    // --- DROPDOWNS ---
    const dropdown = document.createElement('div');
    dropdown.className = 'fixed z-[999999] transition-all opacity-0 pointer-events-none scale-95 glass rounded-2xl md:rounded-3xl p-2 md:p-3 shadow-2xl border border-white/10 flex flex-col bg-[#111]/95 backdrop-blur-xl';

    const showDropdown = (type, anchorBtn) => {
        dropdown.innerHTML = '';
        dropdown.classList.remove('opacity-0', 'pointer-events-none', 'scale-95', 'opacity-100', 'pointer-events-auto', 'scale-100');
        void dropdown.offsetWidth; 
        dropdown.classList.add('opacity-100', 'pointer-events-auto', 'scale-100');

        if (type === 'model') {
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 shrink-0 border-b border-white/5 mb-2">Modelos KreateIA</div><div id="model-list-container" class="flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-1"></div>`;
            getCurrentModels().forEach(m => {
                const item = document.createElement('div');
                item.className = `flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all border border-transparent ${selectedModel === m.id ? 'bg-white/5 border-white/5' : ''}`;
                item.innerHTML = `<div class="flex items-center gap-3"><div class="w-8 h-8 md:w-10 md:h-10 ${m.name.includes('Pro') ? 'bg-[#FFB000]/10 text-[#FFB000]' : 'bg-[#3B82F6]/10 text-[#3B82F6]'} border border-white/5 rounded-lg md:rounded-xl flex items-center justify-center font-black text-xs uppercase">K</div><span class="text-xs md:text-sm font-bold text-white">${m.name}</span></div>${selectedModel === m.id ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); selectedModel = m.id; selectedModelName = m.name; updateControlsForMode(); closeDropdown(); };
                dropdown.querySelector('#model-list-container').appendChild(item);
            });
        } else if (type === 'ar') {
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Relación de Aspecto</div><div class="flex flex-col gap-1 overflow-y-auto custom-scrollbar"></div>`;
            getCurrentAspectRatios(selectedModel).forEach(r => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all';
                item.innerHTML = `<div class="flex items-center gap-3"><div class="w-5 h-5 border-2 border-white/20 rounded shadow-inner flex items-center justify-center"><div class="w-2 h-2 bg-white/10 rounded-[1px]"></div></div><span class="text-xs md:text-sm font-bold text-white">${r}</span></div>${selectedAr === r ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); selectedAr = r; document.getElementById('ar-btn-label').textContent = r; closeDropdown(); };
                dropdown.querySelector('div:last-child').appendChild(item);
            });
        } else if (type === 'quality') {
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Resolución</div><div class="flex flex-col gap-1 overflow-y-auto custom-scrollbar"></div>`;
            getCurrentResolutions(selectedModel).forEach(opt => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all';
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white">${opt}</span>${document.getElementById('quality-btn-label').textContent === opt ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); document.getElementById('quality-btn-label').textContent = opt; closeDropdown(); };
                dropdown.querySelector('div:last-child').appendChild(item);
            });
        }

        const btnRect = anchorBtn.getBoundingClientRect();
        if (window.innerWidth < 768) {
            dropdown.style.bottom = '16px'; dropdown.style.left = '16px'; dropdown.style.right = '16px'; dropdown.style.width = 'auto';
        } else {
            dropdown.style.top = `${btnRect.bottom + 8}px`; dropdown.style.left = `${btnRect.left}px`; dropdown.style.width = type === 'model' ? '300px' : '240px';
        }
    };

    const closeDropdown = () => { dropdown.classList.add('opacity-0', 'pointer-events-none', 'scale-95'); dropdown.classList.remove('opacity-100', 'pointer-events-auto', 'scale-100'); };
    modelBtn.onclick = (e) => { e.stopPropagation(); showDropdown('model', modelBtn); };
    arBtn.onclick = (e) => { e.stopPropagation(); showDropdown('ar', arBtn); };
    qualityBtn.onclick = (e) => { e.stopPropagation(); showDropdown('quality', qualityBtn); };
    window.onclick = () => closeDropdown();
    document.body.appendChild(dropdown);

    // --- GALERÍA ---
    const galleryWrapper = document.createElement('div');
    galleryWrapper.className = 'w-full max-w-6xl mt-4 md:mt-8 flex-1 flex flex-col shrink-0 px-2 md:px-0';
    const galleryHeader = document.createElement('h3');
    galleryHeader.className = 'text-[10px] md:text-xs font-bold text-white/40 uppercase tracking-widest mb-3 md:mb-4 px-2 hidden';
    galleryHeader.textContent = 'Tus Creaciones';
    galleryWrapper.appendChild(galleryHeader);
    const galleryGrid = document.createElement('div');
    galleryGrid.className = 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4 w-full';
    galleryWrapper.appendChild(galleryGrid);
    container.appendChild(galleryWrapper);

    const renderCard = (entry, isPrepend = false) => {
        galleryHeader.classList.remove('hidden');
        const card = document.createElement('div');
        card.className = 'relative aspect-square rounded-xl md:rounded-2xl overflow-hidden bg-white/5 border border-white/10 group animate-fade-in-up cursor-pointer';
        card.innerHTML = `<img src="${entry.url}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy"><div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 md:p-4 flex flex-col justify-end"><p class="text-white text-[10px] md:text-xs line-clamp-2 leading-tight">${entry.prompt || ''}</p></div>`;
        
        card.onclick = async () => {
            const resp = await fetch(entry.url);
            const blob = await resp.blob();
            window.open(URL.createObjectURL(blob), '_blank');
        };

        if (isPrepend) galleryGrid.prepend(card); else galleryGrid.appendChild(card);
    };

    const loadHistory = async (user) => {
        const genRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'generations');
        const q = query(genRef, orderBy('createdAt', 'desc'), limit(20));
        const snap = await getDocs(q);
        snap.forEach(doc => renderCard({ id: doc.id, ...doc.data() }));
    };

    onAuthStateChanged(auth, (user) => { if (user) loadHistory(user); });

    // --- GENERACIÓN Y FACTURACIÓN ---
    generateBtn.onclick = async () => {
        const promptText = textarea.value.trim();
        if (!auth.currentUser) return alert('Debes iniciar sesión para generar imágenes.');
        if (!imageMode && !promptText) return alert('Por favor, escribe un prompt.');

        const cost = getModelCost(selectedModel);
        const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid);

        // PASO 1: Comprobar que hay saldo antes de empezar
        try {
            const userSnap = await getDoc(userRef);
            const currentCredits = userSnap.exists() ? (userSnap.data().credits || 0) : 0;
            if (currentCredits < cost) {
                alert(`⚠️ Saldo insuficiente.\n\nEste modelo requiere ${cost} 🪙 y actualmente dispones de ${currentCredits} 🪙.\n\nPor favor, recarga créditos en tu panel haciendo clic en la moneda de la barra superior.`);
                return;
            }
        } catch (err) {
            console.error("Error comprobando el saldo:", err);
            alert("No hemos podido verificar tu saldo. Revisa tu conexión a internet.");
            return;
        }

        const tempId = Date.now().toString();
        const loadingCard = document.createElement('div');
        loadingCard.className = 'relative aspect-square rounded-xl md:rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex flex-col items-center justify-center animate-pulse';
        loadingCard.innerHTML = `<div class="w-8 h-8 border-4 border-[#FFB000]/30 border-t-[#FFB000] rounded-full animate-spin mb-2"></div><span class="text-[10px] font-bold text-[#FFB000]">Generando...</span>`;
        galleryGrid.prepend(loadingCard);

        textarea.value = ''; textarea.style.height = 'auto';
        const originalText = generateBtn.innerHTML;
        generateBtn.innerHTML = `Lanzado 🚀`;
        setTimeout(() => { updateControlsForMode(); }, 1000); // Restaura el botón con su precio

        try {
            let res;
            const qualityLabel = document.getElementById('quality-btn-label')?.textContent;
            let finalPrompt = promptText || (imageMode ? "Edición de imagen" : "");
            if (selectedStyle && selectedStyle !== 'Ninguno') finalPrompt += `, estilo ${selectedStyle.toLowerCase()}`;

            if (imageMode) {
                const token = await auth.currentUser.getIdToken();
                const genParams = { model: selectedModel, images_list: uploadedImageUrls, aspect_ratio: selectedAr, prompt: finalPrompt };
                if (negativePrompt) genParams.negative_prompt = negativePrompt;

                const req = await fetch(`/api/v1/${selectedModel}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(genParams)
                });
                
                res = await req.json();

                if (res.request_id && !res.url) {
                    let attempts = 0;
                    while (attempts < 60) {
                        await new Promise(r => setTimeout(r, 2000));
                        const poll = await fetch(`/api/v1/predictions/${res.request_id}/result`, { 
                            headers: { 'Authorization': `Bearer ${token}` } 
                        });
                        
                        if (poll.ok) {
                            const pollRes = await poll.json();
                            const finalUrl = pollRes.url || 
                                             pollRes.image_url || 
                                             (pollRes.output && pollRes.output.outputs && pollRes.output.outputs[0]) || 
                                             (pollRes.outputs && pollRes.outputs[0]) || 
                                             (pollRes.images && pollRes.images[0]?.url);
                            
                            if (finalUrl) { res.url = finalUrl; break; }
                            if (pollRes.status === 'failed' || pollRes.status === 'error') throw new Error("Error interno.");
                        }
                        attempts++;
                    }
                }
            } else {
                res = await muapi.generateImage({ model: selectedModel, prompt: finalPrompt, aspect_ratio: selectedAr, negative_prompt: negativePrompt });
            }

            if (res && res.url) {
                // PASO 2: La imagen ha salido bien. ¡Ahora sí cobramos los créditos!
                try {
                    await updateDoc(userRef, { credits: increment(-cost) });
                } catch (billingErr) {
                    console.error("No se pudo descontar el saldo, pero la imagen se generó:", billingErr);
                }

                // Guardamos en el historial y mostramos
                const entry = { url: res.url, prompt: finalPrompt, model: selectedModel, aspect_ratio: selectedAr, createdAt: serverTimestamp() };
                const docRef = await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid, 'generations'), entry);
                loadingCard.remove();
                renderCard({ id: docRef.id, ...entry }, true);
            } else {
                throw new Error("Tiempo de espera agotado.");
            }
        } catch (e) {
            console.error(e);
            // PASO 3: Ha habido un error de generación. Como no hemos cobrado, el usuario no pierde nada.
            loadingCard.innerHTML = `<span class="text-red-400 text-[8px] font-bold">FALLO TÉCNICO</span><span class="text-white/50 text-[6px] mt-1 text-center px-2">No se te han descontado créditos.</span><button class="text-[8px] underline mt-2 bg-white/10 px-2 py-1 rounded" onclick="this.parentElement.remove()">Quitar</button>`;
        }
    };

    return container;
}
