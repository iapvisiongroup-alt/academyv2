import { muapi } from '../lib/muapi.js';
import { t2vModels, i2vModels, v2vModels, getAspectRatiosForVideoModel, getDurationsForModel, getResolutionsForVideoModel, getAspectRatiosForI2VModel, getDurationsForI2VModel, getResolutionsForI2VModel, getModesForModel } from '../lib/models.js';
import { AuthModal } from './AuthModal.js';
import { createUploadPicker } from './UploadPicker.js';

// Importamos Firebase para cobros e historial
import { auth, db, APP_ID } from '../lib/firebase.js';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// --- 1. MODELOS BLINDADOS FRONTEND ---
const V_MODELS = [
    { uiId: 'kreate-2', name: 'KreateVideo 2' },
    { uiId: 'kreate-2-extend', name: 'KreateVideo 2 Extend' },
    { uiId: 'veo-fast', name: 'KreateVideo Fast' },
    { uiId: 'kling-mc', name: 'KreateMotion Control' }
];

// --- 2. TRADUCTOR MAESTRO (UI -> API ID EXACTO) ---
const getApiId = (uiId, mode) => {
    if (uiId === 'kreate-2') {
        if (mode === 'v2v') return 'sd-2-omni-reference-no-video-fast';
        if (mode === 'i2v') return 'sd-2-i2v-480p';
        return 'sd-2-text-to-video-fast';
    }
    if (uiId === 'kreate-2-extend') return 'seedance-v2.0-extend'; 
    if (uiId === 'veo-fast') return 'veo-3.1-fast';
    if (uiId === 'kling-mc') return 'kling-3.0-std';
    return uiId; 
};

// --- 3. SISTEMA DE PRECIOS POR SEGUNDO (x2) ---
const MUAPI_COST_PER_SECOND = {
    'sd-2': 2.0,  
    'seedance': 2.0,
    'veo': 2.5,       
    'kling': 3.0,     
    'default': 2.0    
};

const calculateVideoCost = (apiId, durationStr) => {
    if (!apiId) return 10; 
    const durationInSeconds = parseInt(durationStr) || 5; 
    const id = apiId.toLowerCase();
    
    let costPerSecond = MUAPI_COST_PER_SECOND.default;
    if (id.includes('sd-2') || id.includes('seedance')) costPerSecond = MUAPI_COST_PER_SECOND['sd-2'];
    else if (id.includes('veo')) costPerSecond = MUAPI_COST_PER_SECOND['veo'];
    else if (id.includes('kling')) costPerSecond = MUAPI_COST_PER_SECOND['kling'];

    return Math.ceil((costPerSecond * durationInSeconds) * 2);
};

// Escudo anti-crashes interno
const safeCall = (fn, ...args) => {
    try { return fn(...args) || []; } catch (e) { return []; }
};

export function VideoStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center bg-[#050505] relative p-2 md:p-6 pb-24 overflow-y-auto custom-scrollbar overflow-x-hidden';

    const updateLabel = (id, text) => {
        try {
            const el = container.querySelector('#' + id);
            if (el) el.textContent = text;
        } catch(e) {}
    };

    // --- ESTADOS INTERNOS ---
    let selectedUiId = V_MODELS[0].uiId;
    let selectedModelName = V_MODELS[0].name;
    let selectedAr = '16:9';
    let selectedDuration = 5;
    let selectedResolution = '720p';
    
    let lastGenerationId = null;
    let dropdownOpen = null;
    let uploadedImageUrl = null;
    let uploadedVideoUrl = null;

    const getCurrentMode = () => uploadedVideoUrl ? 'v2v' : (uploadedImageUrl ? 'i2v' : 't2v');

    const generateBtn = document.createElement('button');
    generateBtn.className = 'bg-[#FFB000] text-black px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-[1.5rem] font-black text-sm md:text-base hover:shadow-[0_0_20px_rgba(255,176,0,0.4)] active:scale-95 transition-all flex items-center justify-center gap-1.5 md:gap-2.5 w-full sm:w-auto shadow-lg shrink-0 mt-2 sm:mt-0';
    generateBtn.innerHTML = 'Generar ✨';

    // --- HERO SECTION ---
    const hero = document.createElement('div');
    hero.className = 'flex flex-col items-center mb-6 md:mb-16 mt-4 md:mt-0 animate-fade-in-up transition-all duration-700 shrink-0';
    hero.innerHTML = `
        <div class="mb-6 md:mb-10 relative group">
             <div class="absolute inset-0 bg-[#FFB000]/20 blur-[60px] md:blur-[100px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-1000"></div>
             <div class="relative w-16 h-16 md:w-32 md:h-32 bg-[#111111] rounded-2xl md:rounded-3xl flex items-center justify-center border border-white/5 overflow-hidden">
                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-[#FFB000] opacity-20 absolute -right-2 -bottom-2 md:-right-4 md:-bottom-4 w-12 md:w-20"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                <div class="w-10 h-10 md:w-16 md:h-16 bg-[#FFB000]/10 rounded-xl md:rounded-2xl flex items-center justify-center border border-[#FFB000]/20 shadow-glow relative z-10">
                    <svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[#FFB000] w-5 md:w-8"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                </div>
                <div class="absolute top-2 right-2 md:top-4 md:right-4 text-[#3B82F6] animate-pulse text-xs md:text-base">✨</div>
             </div>
        </div>
        <h1 class="text-xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-2 md:mb-4 selection:bg-[#FFB000] selection:text-black text-center px-4">Estudio de Vídeo</h1>
        <p class="text-white/50 text-[10px] md:text-sm font-medium tracking-wide opacity-60 text-center px-4">Anima imágenes y crea vídeos increíbles con IA</p>
    `;
    container.appendChild(hero);

    // --- PROMPT BAR ---
    const promptWrapper = document.createElement('div');
    promptWrapper.className = 'w-full max-w-4xl relative z-40 animate-fade-in-up shrink-0 px-2 md:px-0';
    promptWrapper.style.animationDelay = '0.2s';

    const bar = document.createElement('div');
    bar.className = 'w-full bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] p-3 md:p-5 flex flex-col gap-3 md:gap-5 shadow-3xl';

    const topRow = document.createElement('div');
    topRow.className = 'flex items-start gap-3 md:gap-5 px-1 md:px-2';

    const updateControlsForModel = () => {
        try {
            const currentMode = getCurrentMode();
            const finalApiId = getApiId(selectedUiId, currentMode);
            const isExtend = selectedUiId === 'kreate-2-extend';

            updateLabel('v-model-btn-label', selectedModelName);

            if (currentMode === 'v2v') {
                if(arBtn) arBtn.style.display = 'none';
                if(durationBtn) durationBtn.style.display = 'none';
                if(resolutionBtn) resolutionBtn.style.display = 'none';
                if(extendBanner) { extendBanner.classList.add('hidden'); extendBanner.classList.remove('flex'); }
            } else {
                const availableArs = currentMode === 'i2v' ? safeCall(getAspectRatiosForI2VModel, finalApiId) : safeCall(getAspectRatiosForVideoModel, finalApiId);
                if (availableArs && availableArs.length > 0) {
                    if (!availableArs.includes(selectedAr)) selectedAr = availableArs[0];
                    updateLabel('v-ar-btn-label', selectedAr);
                    if(arBtn) arBtn.style.display = 'flex';
                } else if(arBtn) arBtn.style.display = 'none';

                const durations = currentMode === 'i2v' ? safeCall(getDurationsForI2VModel, finalApiId) : safeCall(getDurationsForModel, finalApiId);
                if (durations && durations.length > 0) {
                    if (!durations.includes(selectedDuration)) selectedDuration = durations[0];
                    updateLabel('v-duration-btn-label', `${selectedDuration}s`);
                    if(durationBtn) durationBtn.style.display = 'flex';
                } else if(durationBtn) durationBtn.style.display = 'none';

                const resolutions = currentMode === 'i2v' ? safeCall(getResolutionsForI2VModel, finalApiId) : safeCall(getResolutionsForVideoModel, finalApiId);
                if (resolutions && resolutions.length > 0) {
                    if (!resolutions.includes(selectedResolution)) selectedResolution = resolutions[0];
                    updateLabel('v-resolution-btn-label', selectedResolution);
                    if(resolutionBtn) resolutionBtn.style.display = 'flex';
                } else if(resolutionBtn) resolutionBtn.style.display = 'none';

                if (isExtend) {
                    if(extendBanner) { extendBanner.classList.remove('hidden'); extendBanner.classList.add('flex'); }
                } else {
                    if(extendBanner) { extendBanner.classList.add('hidden'); extendBanner.classList.remove('flex'); }
                }
            }

            const cost = calculateVideoCost(finalApiId, selectedDuration);
            generateBtn.innerHTML = `Generar ✨ <span class="bg-black/20 px-2 py-0.5 rounded-md text-[10px] md:text-xs font-mono ml-1 shadow-inner border border-black/10">${cost} 🪙</span>`;
        } catch(e) { console.error("Error UI:", e); }
    };

    // --- CARGA DE FOTOS ---
    const picker = createUploadPicker({
        anchorContainer: container,
        onSelect: ({ url }) => {
            uploadedImageUrl = url;
            if (uploadedVideoUrl) {
                uploadedVideoUrl = null;
                showVideoIcon();
            }
            selectedUiId = 'kreate-2';
            selectedModelName = 'KreateVideo 2';
            updateControlsForModel();
            textarea.placeholder = 'Describe el movimiento o efecto...';
            textarea.disabled = false;
        },
        onClear: () => {
            uploadedImageUrl = null;
            updateControlsForModel();
            textarea.placeholder = 'Describe el vídeo que quieres crear';
        }
    });
    topRow.appendChild(picker.trigger);
    container.appendChild(picker.panel);

    // --- CARGA DE VÍDEOS ---
    const videoFileInput = document.createElement('input');
    videoFileInput.type = 'file';
    videoFileInput.accept = 'video/*';
    videoFileInput.className = 'hidden';

    const videoPickerBtn = document.createElement('button');
    videoPickerBtn.type = 'button';
    videoPickerBtn.title = 'Subir vídeo de referencia';
    videoPickerBtn.className = 'w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-xl md:rounded-2xl border transition-all flex items-center justify-center relative overflow-hidden mt-1 md:mt-1.5 bg-white/5 border-white/10 hover:bg-white/10 hover:border-[#FFB000]/40 group';

    const videoIconEl = document.createElement('div');
    videoIconEl.className = 'flex items-center justify-center w-full h-full';
    videoIconEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40 group-hover:text-[#FFB000] transition-colors"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;

    const videoSpinnerEl = document.createElement('div');
    videoSpinnerEl.className = 'hidden items-center justify-center w-full h-full';
    videoSpinnerEl.innerHTML = `<div class="w-4 h-4 border-2 border-[#FFB000]/30 border-t-[#FFB000] rounded-full animate-spin"></div>`;

    const videoReadyEl = document.createElement('div');
    videoReadyEl.className = 'hidden items-center justify-center w-full h-full';
    videoReadyEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[#FFB000]"><polyline points="20 6 9 17 4 12"/></svg>`;

    videoPickerBtn.appendChild(videoFileInput);
    videoPickerBtn.appendChild(videoIconEl);
    videoPickerBtn.appendChild(videoSpinnerEl);
    videoPickerBtn.appendChild(videoReadyEl);

    const showVideoIcon = () => {
        videoIconEl.classList.replace('hidden', 'flex');
        videoSpinnerEl.classList.add('hidden'); videoSpinnerEl.classList.remove('flex');
        videoReadyEl.classList.add('hidden'); videoReadyEl.classList.remove('flex');
        videoPickerBtn.classList.remove('border-[#FFB000]/60', 'bg-[#FFB000]/10');
        videoPickerBtn.classList.add('border-white/10');
    };

    const showVideoSpinner = () => {
        videoIconEl.classList.add('hidden'); videoIconEl.classList.remove('flex');
        videoSpinnerEl.classList.replace('hidden', 'flex');
        videoReadyEl.classList.add('hidden'); videoReadyEl.classList.remove('flex');
    };

    const showVideoReady = () => {
        videoIconEl.classList.add('hidden'); videoIconEl.classList.remove('flex');
        videoSpinnerEl.classList.add('hidden'); videoSpinnerEl.classList.remove('flex');
        videoReadyEl.classList.replace('hidden', 'flex');
        videoPickerBtn.classList.remove('border-white/10');
        videoPickerBtn.classList.add('border-[#FFB000]/60', 'bg-[#FFB000]/10');
    };

    videoPickerBtn.onclick = (e) => {
        e.stopPropagation();
        if (uploadedVideoUrl) {
            uploadedVideoUrl = null;
            showVideoIcon();
            updateControlsForModel();
            textarea.placeholder = 'Describe el vídeo que quieres crear...';
        } else {
            videoFileInput.click();
        }
    };

    videoFileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const apiKey = localStorage.getItem('muapi_key');
        if (!apiKey) {
            if (typeof AuthModal === 'function') return AuthModal(() => videoFileInput.click());
            return alert("Configura tu API Key primero.");
        }

        showVideoSpinner();
        try {
            if(typeof muapi.uploadFile !== 'function') throw new Error("Librería de subida inaccesible.");
            const url = await muapi.uploadFile(file);
            uploadedVideoUrl = url;
            showVideoReady();

            if (uploadedImageUrl) {
                uploadedImageUrl = null;
                const clearBtn = picker.panel.querySelector('button'); 
                if(clearBtn) clearBtn.click();
            }
            
            selectedUiId = 'kreate-2';
            selectedModelName = 'KreateVideo 2';
            updateControlsForModel();
            textarea.placeholder = 'Vídeo cargado — escribe un prompt...';
            textarea.disabled = false;
        } catch (err) {
            console.error(err);
            showVideoIcon();
            alert(`Error al subir vídeo: ${err.message}`);
        }
        videoFileInput.value = '';
    };

    topRow.appendChild(videoPickerBtn);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Describe el vídeo que quieres crear...';
    textarea.className = 'flex-1 bg-transparent border-none text-white text-sm md:text-xl placeholder:text-muted focus:outline-none resize-none pt-2 md:pt-2.5 leading-relaxed min-h-[40px] max-h-[150px] md:max-h-[250px] overflow-y-auto custom-scrollbar';
    textarea.rows = 1;
    textarea.oninput = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, window.innerWidth < 768 ? 120 : 250) + 'px';
    };

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            generateBtn.click();
        }
    });

    topRow.appendChild(textarea);
    bar.appendChild(topRow);

    const extendBanner = document.createElement('div');
    extendBanner.className = 'hidden items-center justify-between gap-2 px-4 py-2.5 mx-2 mt-2 bg-[#3B82F6]/10 border border-[#3B82F6]/20 rounded-xl text-xs text-[#3B82F6]';
    extendBanner.innerHTML = `
        <div class="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <span>Extendiendo vídeo anterior. Añade un prompt para guiar la continuación.</span>
        </div>
        <button id="cancel-extend-btn" class="text-white/50 hover:text-white"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    `;
    bar.appendChild(extendBanner);

    extendBanner.querySelector('#cancel-extend-btn').onclick = () => {
        lastGenerationId = null;
        selectedUiId = 'kreate-2';
        selectedModelName = 'KreateVideo 2';
        updateControlsForModel();
        textarea.placeholder = 'Describe el vídeo que quieres crear...';
    };

    const bottomRow = document.createElement('div');
    bottomRow.className = 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-1 md:px-2 pt-3 border-t border-white/5';

    const controlsLeft = document.createElement('div');
    controlsLeft.className = 'flex flex-wrap items-center justify-center sm:justify-start gap-1.5 md:gap-2.5 w-full sm:w-auto';

    const createControlBtn = (icon, label, id) => {
        const btn = document.createElement('button');
        btn.id = id;
        btn.className = 'flex items-center gap-1.5 md:gap-2.5 px-2.5 py-1.5 md:px-4 md:py-2.5 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl transition-all border border-white/5 group whitespace-nowrap flex-1 sm:flex-none justify-center';
        btn.innerHTML = `${icon}<span id="${id}-label" class="text-[10px] md:text-xs font-bold text-white group-hover:text-[#FFB000] truncate max-w-[80px] md:max-w-none">${label}</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" class="opacity-20 group-hover:opacity-100 transition-opacity shrink-0"><path d="M6 9l6 6 6-6"/></svg>`;
        return btn;
    };

    let modelBtn = createControlBtn(`<div class="w-4 h-4 md:w-5 md:h-5 bg-[#FFB000] rounded flex items-center justify-center shadow-[0_0_10px_rgba(255,176,0,0.3)] shrink-0"><span class="text-[8px] md:text-[10px] font-black text-black">K</span></div>`, selectedModelName, 'v-model-btn');
    let arBtn = createControlBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`, selectedAr, 'v-ar-btn');
    let durationBtn = createControlBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`, `${selectedDuration}s`, 'v-duration-btn');
    let resolutionBtn = createControlBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><path d="M6 2L3 6v15a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"/></svg>`, selectedResolution || '720p', 'v-resolution-btn');

    controlsLeft.appendChild(modelBtn);
    controlsLeft.appendChild(arBtn);
    controlsLeft.appendChild(durationBtn);
    controlsLeft.appendChild(resolutionBtn);

    bottomRow.appendChild(controlsLeft);
    bottomRow.appendChild(generateBtn);
    bar.appendChild(bottomRow);
    promptWrapper.appendChild(bar);
    container.appendChild(promptWrapper);

    const inlineInstructions = document.createElement('div');
    inlineInstructions.className = 'w-full text-center text-white/30 text-sm flex flex-col items-center gap-1 md:gap-2 py-2 px-4';
    inlineInstructions.innerHTML = `<p class="text-[10px] md:text-xs text-white/20">Puedes lanzar varios vídeos a la vez sin esperar.</p>`;
    container.appendChild(inlineInstructions);

    // --- MENÚS DESPLEGABLES ---
    const dropdown = document.createElement('div');
    dropdown.className = 'fixed z-[999999] transition-all opacity-0 pointer-events-none scale-95 origin-bottom-left glass rounded-2xl md:rounded-3xl p-2 md:p-3 shadow-2xl border border-white/10 flex flex-col bg-[#111]/95 backdrop-blur-xl';

    const showDropdown = (type, anchorBtn) => {
        dropdown.innerHTML = '';
        dropdown.classList.remove('opacity-0', 'pointer-events-none');
        dropdown.classList.add('opacity-100', 'pointer-events-auto');
        
        const currentMode = getCurrentMode();
        const finalApiId = getApiId(selectedUiId, currentMode);

        if (type === 'model') {
            dropdown.classList.add('w-[calc(100vw-3rem)]', 'max-w-xs', 'md:w-[300px]');
            dropdown.innerHTML = `
                <div class="flex flex-col max-h-[50vh] md:max-h-[60vh]">
                    <div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 shrink-0 border-b border-white/5 mb-2">Modelos KreateIA</div>
                    <div id="v-model-list-container" class="flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-1 pb-1"></div>
                </div>
            `;
            const list = dropdown.querySelector('#v-model-list-container');

            V_MODELS.forEach(m => {
                if (currentMode !== 't2v' && m.uiId !== 'kreate-2' && m.uiId !== 'kreate-2-extend') return;

                const item = document.createElement('div');
                item.className = `flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all border border-transparent ${selectedUiId === m.uiId ? 'bg-white/5 border-white/5' : ''}`;
                item.innerHTML = `
                    <div class="flex items-center gap-3">
                         <div class="w-8 h-8 md:w-10 md:h-10 bg-[#FFB000]/10 text-[#FFB000] border border-white/5 rounded-lg md:rounded-xl flex items-center justify-center font-black text-xs shadow-inner uppercase">K</div>
                         <div class="flex flex-col gap-0.5">
                            <span class="text-xs md:text-sm font-bold text-white tracking-tight">${m.name}</span>
                         </div>
                    </div>
                    ${selectedUiId === m.uiId ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedUiId = m.uiId; 
                    selectedModelName = m.name;
                    updateControlsForModel();
                    closeDropdown();
                };
                list.appendChild(item);
            });
        } else if (type === 'ar') {
            dropdown.classList.remove('w-[calc(100vw-3rem)]', 'max-w-xs');
            dropdown.classList.add('w-[240px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Relación de Aspecto</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1 max-h-[50vh] overflow-y-auto custom-scrollbar';
            const availableArs = currentMode === 'i2v' ? safeCall(getAspectRatiosForI2VModel, finalApiId) : safeCall(getAspectRatiosForVideoModel, finalApiId);
            (availableArs.length > 0 ? availableArs : ['16:9', '9:16', '1:1']).forEach(r => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `<div class="flex items-center gap-3"><div class="w-5 h-5 border-2 border-white/20 rounded md:rounded-md shadow-inner flex items-center justify-center group-hover:border-[#FFB000]/50"><div class="w-2 h-2 bg-white/10 rounded-[1px]"></div></div><span class="text-xs md:text-sm font-bold text-white opacity-80 group-hover:opacity-100">${r}</span></div>${selectedAr === r ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); selectedAr = r; updateControlsForModel(); closeDropdown(); };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'duration') {
            dropdown.classList.remove('w-[calc(100vw-3rem)]', 'max-w-xs');
            dropdown.classList.add('w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Duración</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1 max-h-[50vh] overflow-y-auto custom-scrollbar';
            const durations = currentMode === 'i2v' ? safeCall(getDurationsForI2VModel, finalApiId) : safeCall(getDurationsForModel, finalApiId);
            (durations.length > 0 ? durations : [5]).forEach(d => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white opacity-80 group-hover:opacity-100">${d}s</span>${selectedDuration === d ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); selectedDuration = d; updateControlsForModel(); closeDropdown(); };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'resolution') {
            dropdown.classList.remove('w-[calc(100vw-3rem)]', 'max-w-xs');
            dropdown.classList.add('w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Resolución</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1 max-h-[50vh] overflow-y-auto custom-scrollbar';
            const resolutions = currentMode === 'i2v' ? safeCall(getResolutionsForI2VModel, finalApiId) : safeCall(getResolutionsForVideoModel, finalApiId);
            (resolutions.length > 0 ? resolutions : ['720p']).forEach(r => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white opacity-80 group-hover:opacity-100">${r}</span>${selectedResolution === r ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); selectedResolution = r; updateControlsForModel(); closeDropdown(); };
                list.appendChild(item);
            });
            dropdown.appendChild(list);
        }

        const btnRect = anchorBtn.getBoundingClientRect();
        if (window.innerWidth < 768) {
            dropdown.style.top = 'auto'; dropdown.style.bottom = '16px'; dropdown.style.left = '16px'; dropdown.style.right = '16px'; dropdown.style.transformOrigin = 'bottom center';
        } else {
            dropdown.style.bottom = 'auto'; dropdown.style.top = `${btnRect.bottom + 8}px`; dropdown.style.left = `${btnRect.left}px`; dropdown.style.right = 'auto'; dropdown.style.transformOrigin = 'top left';
            if (btnRect.bottom + 300 > window.innerHeight) {
                dropdown.style.top = 'auto'; dropdown.style.bottom = `${window.innerHeight - btnRect.top + 8}px`; dropdown.style.transformOrigin = 'bottom left';
            }
        }
    };

    const closeDropdown = () => { dropdown.classList.add('opacity-0', 'pointer-events-none', 'scale-95'); dropdown.classList.remove('opacity-100', 'pointer-events-auto', 'scale-100'); dropdownOpen = null; };
    const toggleDropdown = (type, btn) => (e) => { e.stopPropagation(); if (dropdownOpen === type) closeDropdown(); else { dropdownOpen = type; showDropdown(type, btn); } };

    modelBtn.onclick = toggleDropdown('model', modelBtn);
    arBtn.onclick = toggleDropdown('ar', arBtn);
    durationBtn.onclick = toggleDropdown('duration', durationBtn);
    resolutionBtn.onclick = toggleDropdown('resolution', resolutionBtn);

    window.addEventListener('click', closeDropdown);
    document.body.appendChild(dropdown);

    // ==========================================
    // 4. GALERÍA FEED MULTITAREA
    // ==========================================
    const galleryWrapper = document.createElement('div');
    galleryWrapper.className = 'w-full max-w-6xl mt-4 md:mt-8 flex-1 flex flex-col shrink-0 px-2 md:px-0';
    
    const galleryHeader = document.createElement('h3');
    galleryHeader.className = 'text-[10px] md:text-xs font-bold text-white/40 uppercase tracking-widest mb-3 md:mb-4 px-2 hidden';
    galleryHeader.textContent = 'Tus Creaciones';
    galleryWrapper.appendChild(galleryHeader);

    const galleryGrid = document.createElement('div');
    galleryGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5 w-full';
    galleryWrapper.appendChild(galleryGrid);

    container.appendChild(galleryWrapper);

    const downloadFile = async (url, filename) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch (err) { window.open(url, '_blank'); }
    };

    const renderCard = (entry, isPrepend = false) => {
        galleryHeader.classList.remove('hidden');

        const card = document.createElement('div');
        card.id = `card-${entry.id}`;
        card.className = 'relative aspect-video rounded-xl md:rounded-2xl overflow-hidden bg-white/5 border border-white/10 group animate-fade-in-up';

        card.innerHTML = `
            <video src="${entry.url}" autoplay loop muted playsinline class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"></video>
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 md:opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 md:p-4">
                <p class="text-white text-[10px] md:text-xs font-medium line-clamp-2 md:line-clamp-3 mb-2 md:mb-3 shadow-black drop-shadow-md leading-tight">${entry.prompt || 'Vídeo Generado'}</p>
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                        <span class="text-[8px] md:text-[10px] text-white/70 bg-black/60 px-1.5 py-0.5 md:px-2 md:py-1 rounded-md backdrop-blur-sm border border-white/10">${entry.duration ? entry.duration + 's' : '5s'}</span>
                        <span class="text-[8px] md:text-[10px] text-[#FFB000] font-bold bg-[#FFB000]/10 px-1.5 py-0.5 md:px-2 md:py-1 rounded-md backdrop-blur-sm border border-[#FFB000]/20 hidden extend-badge">Kreate 2</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="extend-btn hidden p-1.5 md:p-2 bg-[#3B82F6]/20 hover:bg-[#3B82F6] text-[#3B82F6] hover:text-white rounded-lg md:rounded-xl backdrop-blur-md transition-all border border-[#3B82F6]/30" title="Extender este vídeo"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
                        <button class="download-btn p-1.5 md:p-2 bg-white/20 hover:bg-[#FFB000] hover:text-black text-white rounded-lg md:rounded-xl backdrop-blur-md transition-all border border-white/20" title="Descargar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
                    </div>
                </div>
            </div>
        `;

        const isKreate2 = entry.model && (entry.model.toLowerCase().includes('sd-2') || entry.model.toLowerCase().includes('seedance')) && !entry.model.toLowerCase().includes('extend');
        if (isKreate2) {
            const showExtend = () => {
                lastGenerationId = entry.id;
                selectedUiId = 'kreate-2-extend';
                selectedModelName = 'KreateVideo 2 Extend';
                updateControlsForModel();
                textarea.placeholder = 'Opcional: describe cómo continuar este vídeo...';
                container.scrollTo({ top: 0, behavior: 'smooth' });
                textarea.focus();
            };

            const desktopExt = card.querySelector('.extend-btn');
            const badge = card.querySelector('.extend-badge');
            if(desktopExt) { desktopExt.classList.remove('hidden'); desktopExt.onclick = (e) => { e.stopPropagation(); showExtend(); } }
            if(badge) { badge.classList.remove('hidden'); }
        }

        const triggerDownload = (e) => {
            e.stopPropagation();
            downloadFile(entry.url, `KreateVideo-${Date.now()}.mp4`);
        };

        const btnDesktop = card.querySelector('.download-btn');
        if (btnDesktop) btnDesktop.onclick = triggerDownload;

        if (isPrepend) galleryGrid.prepend(card); 
        else galleryGrid.appendChild(card);
    };

    const loadFirebaseHistory = async (user) => {
        try {
            const genRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'video_generations');
            const q = query(genRef, orderBy('createdAt', 'desc'), limit(20));
            const snap = await getDocs(q);
            if (!snap.empty) { snap.forEach(doc => { renderCard({ id: doc.id, ...doc.data() }); }); }
        } catch (error) { }
    };

    onAuthStateChanged(auth, (user) => { if (user) loadFirebaseHistory(user); });

    // --- RASTREADOR (POLLING) BLINDADO Y PROPIO ---
    // Si la librería falla al esperar, esto asume el control conectándose al backend usando el token de Firebase.
    const manualPolling = async (requestId, token) => {
        let attempts = 0;
        while (attempts < 120) {
            await new Promise(r => setTimeout(r, 3000)); // Preguntamos cada 3 segundos
            try {
                const poll = await fetch(`/api/v1/predictions/${requestId}/result`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (poll.ok) {
                    const pollRes = await poll.json();
                    
                    // Buscador exhaustivo de la URL final en todos los posibles esquemas de respuesta
                    const finalUrl = pollRes.url || pollRes.video_url || pollRes.outputs?.[0] || pollRes.output?.url || pollRes.output?.outputs?.[0] || pollRes.output?.urls?.get;
                    
                    if (finalUrl) return { url: finalUrl, id: requestId };
                    if (pollRes.status === 'failed' || pollRes.status === 'error') {
                        throw new Error(pollRes.error || "El modelo devolvió un estado fallido.");
                    }
                }
            } catch(e) {
                // Si es un error fatal de la API, cortamos el bucle. Si es de red, seguimos reintentando.
                if (e.message.includes("fallido")) throw e; 
            }
            attempts++;
        }
        throw new Error("Tiempo de espera agotado (Timeout) del servidor de vídeo.");
    };

    // ==========================================
    // 5. GENERACIÓN FINAL
    // ==========================================
    generateBtn.onclick = async () => {
        try {
            let promptText = textarea.value.trim();
            const currentMode = getCurrentMode();
            const finalApiId = getApiId(selectedUiId, currentMode);
            const isExtendMode = selectedUiId === 'kreate-2-extend';

            // Validaciones iniciales
            if (currentMode === 'v2v' && !uploadedVideoUrl) return alert('Sube un vídeo de referencia.');
            if (currentMode === 'i2v' && !uploadedImageUrl) return alert('Sube una imagen de referencia.');
            if (currentMode === 't2v' && !promptText && !isExtendMode) return alert('Escribe un prompt para generar el vídeo.');

            if (!auth.currentUser) {
                if (typeof AuthModal === 'function') return AuthModal(() => generateBtn.click());
                return alert("Inicia sesión para generar.");
            }

            const apiKey = localStorage.getItem('muapi_key');
            if (!apiKey) {
                if (typeof AuthModal === 'function') return AuthModal(() => generateBtn.click());
                return alert("Necesitas configurar tu API Key.");
            }

            const cost = calculateVideoCost(finalApiId, selectedDuration);
            
            try {
                const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid);
                const userSnap = await getDoc(userRef);
                const currentCredits = userSnap.exists() ? (userSnap.data().credits || 0) : 0;
                if (currentCredits < cost) {
                    return alert(`⚠️ Saldo insuficiente.\nRequiere ${cost} 🪙 y dispones de ${currentCredits} 🪙.`);
                }
            } catch (err) {
                return alert("No hemos podido conectar con el servidor de saldos.");
            }

            // CREACIÓN DE LA TARJETA DE CARGA
            const tempId = Date.now().toString();
            galleryHeader.classList.remove('hidden');
            
            const loadingCard = document.createElement('div');
            loadingCard.id = `card-${tempId}`;
            loadingCard.className = 'relative aspect-video rounded-xl md:rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex flex-col items-center justify-center animate-fade-in-up';
            loadingCard.innerHTML = `
                <div class="absolute inset-0 bg-gradient-to-tr from-[#3B82F6]/5 to-[#FFB000]/5 animate-pulse"></div>
                <div class="z-10 flex flex-col items-center gap-2 md:gap-3">
                    <div class="w-8 h-8 md:w-10 md:h-10 border-4 border-[#FFB000]/30 border-t-[#FFB000] rounded-full animate-spin"></div>
                    <span class="text-xs md:text-sm font-bold text-[#FFB000] animate-pulse">Conectando motor...</span>
                </div>
                <div class="absolute bottom-2 md:bottom-4 left-2 right-2 md:left-4 md:right-4 text-[8px] md:text-[10px] text-center text-white/40 line-clamp-2 px-1 md:px-2 leading-tight">${promptText || (isExtendMode ? 'Extendiendo vídeo' : 'Procesando')}</div>
            `;
            galleryGrid.prepend(loadingCard);

            // Liberamos la UI para multitarea
            textarea.value = ''; textarea.style.height = 'auto'; 
            generateBtn.innerHTML = `Lanzado 🚀`;
            setTimeout(() => { updateControlsForModel(); }, 1000);

            let capturedRequestId = null;
            const onRequestId = (rid) => { capturedRequestId = rid; };
            
            // CONSTRUCCIÓN EXACTA DE PARÁMETROS SEGÚN LA DOCUMENTACIÓN (Seedance 2)
            const params = { model: finalApiId, onRequestId };

            if (currentMode === 'i2v') {
                // EXIGENCIA DE LA API: Array de imágenes
                params.images_list = [uploadedImageUrl];
                
                // EXIGENCIA DE LA API: El tag @image1 en el prompt
                if ((finalApiId.includes('sd-2') || finalApiId.includes('seedance')) && !promptText.includes('@image1')) {
                    promptText = promptText ? `@image1 ${promptText}` : '@image1';
                }
                params.prompt = promptText;
                params.aspect_ratio = selectedAr;
                params.duration = parseInt(selectedDuration);
            } 
            else if (currentMode === 'v2v') {
                params.video_url = uploadedVideoUrl;
                params.prompt = promptText || 'Apply motion effect';
            } 
            else {
                params.prompt = promptText || (isExtendMode ? 'Continue the video seamlessly' : '');
                if (isExtendMode && lastGenerationId) params.request_id = lastGenerationId;
                params.aspect_ratio = selectedAr;
                params.duration = parseInt(selectedDuration);
            }

            let res;
            try {
                // Usamos la SDK para lanzar el trabajo
                res = await muapi.generateVideo(params);
            } catch (muapiErr) {
                // Si la librería lanza un error porque el vídeo tarda (timeout normal de 30s)
                if (capturedRequestId && (muapiErr.message.includes('Tiempo de espera') || muapiErr.message.includes('timeout'))) {
                    const token = await auth.currentUser.getIdToken();
                    loadingCard.querySelector('span.text-[#FFB000]').textContent = 'Renderizando (1-3 min)...';
                    // Entra nuestro rastreador manual a prueba de fallos
                    res = await manualPolling(capturedRequestId, token);
                } else {
                    throw muapiErr;
                }
            }

            // Si la librería devuelve un éxito inmediato, pero es solo el ID del trabajo (suele pasar en llamadas asíncronas)
            const rid = res?.request_id || res?.id || capturedRequestId;
            const finalUrl = res?.url || res?.video_url || res?.outputs?.[0] || res?.output?.url || res?.output?.outputs?.[0] || res?.output?.urls?.get;
            
            if (rid && !finalUrl) {
                const token = await auth.currentUser.getIdToken();
                loadingCard.querySelector('span.text-[#FFB000]').textContent = 'Renderizando (1-3 min)...';
                res = await manualPolling(rid, token);
            }

            const verifiedUrl = res?.url || res?.video_url || res?.outputs?.[0] || res?.output?.url || res?.output?.outputs?.[0] || res?.output?.urls?.get;
            
            if (verifiedUrl) {
                // COBRAMOS LOS CRÉDITOS SOLO SI HAY ÉXITO
                try {
                    const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid);
                    await updateDoc(userRef, { credits: increment(-cost) }); 
                } catch (e) {}

                const entryData = {
                    url: verifiedUrl,
                    prompt: promptText.replace('@image1', '').trim() || (isExtendMode ? 'Extensión' : ''),
                    model: finalApiId,
                    duration: selectedDuration,
                    aspect_ratio: selectedAr,
                    type: 'video'
                };

                let realId = rid || Date.now().toString();
                try {
                    const genRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid, 'video_generations');
                    const docRef = await addDoc(genRef, { ...entryData, createdAt: serverTimestamp() });
                    realId = docRef.id;
                } catch (e) {}

                loadingCard.remove();
                renderCard({ id: realId, ...entryData }, true);
                
                if (isExtendMode) {
                    const closeExtBtn = container.querySelector('#cancel-extend-btn');
                    if (closeExtBtn) closeExtBtn.click();
                }
            } else {
                throw new Error('El servidor no devolvió el vídeo final.');
            }

        } catch (errorFatal) {
            console.error("Error en renderizado:", errorFatal);
            
            const loadingCards = container.querySelectorAll('[id^="card-"]');
            if(loadingCards.length > 0) {
                const targetCard = loadingCards[0];
                if(targetCard && targetCard.innerHTML.includes('animate-spin')) {
                    targetCard.innerHTML = `
                        <div class="absolute inset-0 bg-red-500/10"></div>
                        <div class="z-10 flex flex-col items-center gap-1 md:gap-2 p-2 md:p-4 text-center">
                            <span class="text-lg md:text-xl">⚠️</span>
                            <span class="text-[8px] md:text-[10px] font-bold text-red-400">Error interno</span>
                            <span class="text-white/50 text-[6px] px-2 break-words w-full">${errorFatal.message.slice(0,50)}</span>
                            <button class="retry-btn mt-1 bg-white/10 px-2 py-1 rounded-md text-[8px] text-white hover:bg-white/20 border border-white/10">Cerrar</button>
                        </div>
                    `;
                    targetCard.querySelector('.retry-btn').onclick = () => targetCard.remove();
                }
            }
        } finally {
            setTimeout(() => { updateControlsForModel(); }, 100);
        }
    };

    setTimeout(() => { updateControlsForModel(); }, 50);
    return container;
}
