import { muapi } from '../lib/muapi.js';
import { t2vModels, getAspectRatiosForVideoModel, getDurationsForModel, getResolutionsForVideoModel, i2vModels, getAspectRatiosForI2VModel, getDurationsForI2VModel, getResolutionsForI2VModel, v2vModels, getModesForModel } from '../lib/models.js';
import { AuthModal } from './AuthModal.js';
import { createUploadPicker } from './UploadPicker.js';

// Importamos Firebase para el cobro de créditos y el historial
import { auth, db, APP_ID } from '../lib/firebase.js';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// --- SISTEMA DE PRECIOS PARA VÍDEO (Coste por SEGUNDO * 2) ---
const MUAPI_COST_PER_SECOND = {
    'seedance': 2.0,  
    'veo': 2.5,       
    'kling': 3.0,     
    'default': 2.0    
};

const calculateVideoCost = (modelId, durationStr) => {
    const durationInSeconds = parseInt(durationStr) || 5; 
    const id = modelId.toLowerCase();
    
    let costPerSecond = MUAPI_COST_PER_SECOND.default;
    if (id.includes('seedance') || id.includes('sd-2')) costPerSecond = MUAPI_COST_PER_SECOND['seedance'];
    else if (id.includes('veo')) costPerSecond = MUAPI_COST_PER_SECOND['veo'];
    else if (id.includes('kling')) costPerSecond = MUAPI_COST_PER_SECOND['kling'];

    let muapiCostCents = costPerSecond * durationInSeconds;
    return Math.ceil(muapiCostCents * 2);
};

// --- FILTRO EXACTO (IDs precisos) ---
const filterAndRenameVideoModels = (modelsList) => {
    const result = [];
    const addedNames = new Set(); 

    modelsList.forEach(m => {
        const id = m.id.toLowerCase();
        let newName = null;
        let order = 99;

        if (id.includes('sd-2-text-to-video-fast') || id.includes('sd-2-i2v-480p') || id.includes('sd-2-omni-reference-no-video-fast')) {
            newName = 'KreateVideo 2';
            order = 1;
        } else if ((id.includes('seedance') || id.includes('sd-2')) && id.includes('extend')) {
            newName = 'KreateVideo 2 Extend';
            order = 2;
        } else if (id.includes('veo') && id.includes('fast')) {
            newName = 'KreateVideo Fast';
            order = 3;
        } else if (id.includes('kling') && (id.includes('std') || id.includes('motion') || id.includes('mc'))) {
            newName = 'KreateMotion Control';
            order = 4;
        }

        if (newName && !addedNames.has(newName)) {
            addedNames.add(newName);
            result.push({ ...m, name: newName, __order: order });
        }
    });

    return result.sort((a, b) => a.__order - b.__order);
};

export function VideoStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center bg-[#050505] relative p-2 md:p-6 pb-24 overflow-y-auto custom-scrollbar overflow-x-hidden';

    const updateLabel = (id, text) => {
        const el = container.querySelector('#' + id);
        if (el) el.textContent = text;
    };

    const activeT2vModels = filterAndRenameVideoModels(t2vModels);
    const activeI2vModels = filterAndRenameVideoModels(i2vModels);
    const activeV2vModels = filterAndRenameVideoModels(v2vModels);

    const defaultModel = activeT2vModels.length > 0 ? activeT2vModels[0] : (t2vModels[0] || {});
    let selectedModel = defaultModel.id || '';
    let selectedModelName = defaultModel.name || '';
    let selectedAr = defaultModel.inputs?.aspect_ratio?.default || '16:9';
    let selectedDuration = defaultModel.inputs?.duration?.default || 5;
    let selectedResolution = defaultModel.inputs?.resolution?.default || '';
    let selectedQuality = defaultModel.inputs?.quality?.default || '';
    let selectedMode = '';
    let selectedEffectName = '';
    let lastGenerationId = null;
    let dropdownOpen = null;
    let uploadedImageUrl = null;
    let imageMode = false; 
    let v2vMode = false;   
    let uploadedVideoUrl = null;

    const getCurrentModels = () => v2vMode ? activeV2vModels : (imageMode ? activeI2vModels : activeT2vModels);
    const getCurrentAspectRatios = (id) => imageMode ? getAspectRatiosForI2VModel(id) : getAspectRatiosForVideoModel(id);
    const getCurrentDurations = (id) => imageMode ? getDurationsForI2VModel(id) : getDurationsForModel(id);
    const getCurrentResolutions = (id) => imageMode ? getResolutionsForI2VModel(id) : getResolutionsForVideoModel(id);
    const getCurrentModes = (id) => getModesForModel(id);
    const getQualitiesForModel = (id) => {
        const model = getCurrentModels().find(m => m.id === id);
        return model?.inputs?.quality?.enum || [];
    };
    const getEffectNamesForModel = (id) => {
        const model = getCurrentModels().find(m => m.id === id);
        return model?.inputs?.name?.enum || [];
    };

    // --- HERO SECTION ---
    const hero = document.createElement('div');
    hero.className = 'flex flex-col items-center mb-6 md:mb-16 mt-4 md:mt-0 animate-fade-in-up transition-all duration-700 shrink-0';
    hero.innerHTML = `
        <div class="mb-6 md:mb-10 relative group">
             <div class="absolute inset-0 bg-[#FFB000]/20 blur-[60px] md:blur-[100px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-1000"></div>
             <div class="relative w-16 h-16 md:w-32 md:h-32 bg-[#111111] rounded-2xl md:rounded-3xl flex items-center justify-center border border-white/5 overflow-hidden">
                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-[#FFB000] opacity-20 absolute -right-2 -bottom-2 md:-right-4 md:-bottom-4 w-12 md:w-20">
                    <polygon points="23 7 16 12 23 17 23 7"/>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                <div class="w-10 h-10 md:w-16 md:h-16 bg-[#FFB000]/10 rounded-xl md:rounded-2xl flex items-center justify-center border border-[#FFB000]/20 shadow-glow relative z-10">
                    <svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[#FFB000] w-5 md:w-8">
                        <polygon points="23 7 16 12 23 17 23 7"/>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                    </svg>
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

    const generateBtn = document.createElement('button');
    generateBtn.className = 'bg-[#FFB000] text-black px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-[1.5rem] font-black text-sm md:text-base hover:shadow-[0_0_20px_rgba(255,176,0,0.4)] active:scale-95 transition-all flex items-center justify-center gap-1.5 md:gap-2.5 w-full sm:w-auto shadow-lg shrink-0 mt-2 sm:mt-0';

    const updateControlsForModel = (modelId) => {
        const model = getCurrentModels().find(m => m.id === modelId);
        if (!model) return; 

        if (v2vMode) {
            arBtn.style.display = 'none';
            durationBtn.style.display = 'none';
            resolutionBtn.style.display = 'none';
            qualityBtn.style.display = 'none';
            modeBtn.style.display = 'none';
            effectNameBtn.style.display = 'none';
            extendBanner.classList.add('hidden');
            extendBanner.classList.remove('flex');
        } else {
            const availableArs = getCurrentAspectRatios(modelId);
            if (availableArs.length > 0) {
                if (!availableArs.includes(selectedAr)) selectedAr = availableArs[0];
                updateLabel('v-ar-btn-label', selectedAr);
                arBtn.style.display = 'flex';
            } else arBtn.style.display = 'none';

            const durations = getCurrentDurations(modelId);
            if (durations.length > 0) {
                if (!durations.includes(selectedDuration)) selectedDuration = durations[0];
                updateLabel('v-duration-btn-label', `${selectedDuration}s`);
                durationBtn.style.display = 'flex';
            } else durationBtn.style.display = 'none';

            const resolutions = getCurrentResolutions(modelId);
            if (resolutions.length > 0) {
                if (!resolutions.includes(selectedResolution)) selectedResolution = resolutions[0];
                updateLabel('v-resolution-btn-label', selectedResolution);
                resolutionBtn.style.display = 'flex';
            } else resolutionBtn.style.display = 'none';

            const qualities = getQualitiesForModel(modelId);
            if (qualities.length > 0) {
                if (!qualities.includes(selectedQuality)) selectedQuality = model?.inputs?.quality?.default || qualities[0];
                updateLabel('v-quality-btn-label', selectedQuality);
                qualityBtn.style.display = 'flex';
            } else { selectedQuality = ''; qualityBtn.style.display = 'none'; }

            const modes = getCurrentModes(modelId);
            if (modes.length > 0) {
                if (!modes.includes(selectedMode)) selectedMode = model?.inputs?.mode?.default || modes[0];
                updateLabel('v-mode-btn-label', selectedMode);
                modeBtn.style.display = 'flex';
            } else { selectedMode = ''; modeBtn.style.display = 'none'; }

            const effectNames = getEffectNamesForModel(modelId);
            if (effectNames.length > 0) {
                if (!effectNames.includes(selectedEffectName)) selectedEffectName = model?.inputs?.name?.default || effectNames[0];
                updateLabel('v-effect-btn-label', selectedEffectName);
                effectNameBtn.style.display = 'flex';
            } else { selectedEffectName = ''; effectNameBtn.style.display = 'none'; }

            if (model?.requiresRequestId || modelId.toLowerCase().includes('extend')) {
                extendBanner.classList.remove('hidden');
                extendBanner.classList.add('flex');
            } else {
                extendBanner.classList.add('hidden');
                extendBanner.classList.remove('flex');
            }
        }

        const cost = calculateVideoCost(selectedModel, selectedDuration);
        generateBtn.innerHTML = `Generar ✨ <span class="bg-black/20 px-2 py-0.5 rounded-md text-[10px] md:text-xs font-mono ml-1 shadow-inner border border-black/10">${cost} 🪙</span>`;
    };

    // --- Image Picker ---
    const picker = createUploadPicker({
        anchorContainer: container,
        onSelect: ({ url }) => {
            uploadedImageUrl = url;
            if (v2vMode) {
                uploadedVideoUrl = null;
                v2vMode = false;
                showVideoIcon();
            }
            if (!imageMode) {
                imageMode = true;
                if (activeI2vModels.length > 0) {
                    selectedModel = activeI2vModels[0].id;
                    selectedModelName = activeI2vModels[0].name;
                    updateLabel('v-model-btn-label', selectedModelName);
                    updateControlsForModel(selectedModel);
                }
            }
            textarea.placeholder = 'Describe el movimiento o efecto (opcional)';
            textarea.disabled = false;
        },
        onClear: () => {
            uploadedImageUrl = null;
            imageMode = false;
            if (activeT2vModels.length > 0) {
                selectedModel = activeT2vModels[0].id;
                selectedModelName = activeT2vModels[0].name;
                updateLabel('v-model-btn-label', selectedModelName);
                updateControlsForModel(selectedModel);
            }
            textarea.placeholder = 'Describe el vídeo que quieres crear';
            textarea.disabled = false;
        }
    });
    topRow.appendChild(picker.trigger);
    container.appendChild(picker.panel);

    // --- Video Picker ---
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

    const clearVideoUpload = () => {
        uploadedVideoUrl = null;
        v2vMode = false;
        showVideoIcon();
        if (activeT2vModels.length > 0) {
            selectedModel = activeT2vModels[0].id;
            selectedModelName = activeT2vModels[0].name;
            updateLabel('v-model-btn-label', selectedModelName);
            updateControlsForModel(selectedModel);
        }
        textarea.placeholder = 'Describe el vídeo que quieres crear';
        textarea.disabled = false;
    };

    videoPickerBtn.onclick = (e) => {
        e.stopPropagation();
        if (uploadedVideoUrl) clearVideoUpload();
        else videoFileInput.click();
    };

    videoFileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const apiKey = localStorage.getItem('muapi_key');
        if (!apiKey) return AuthModal(() => videoFileInput.click());

        showVideoSpinner();
        try {
            const url = await muapi.uploadFile(file);
            uploadedVideoUrl = url;
            showVideoReady();

            if (imageMode) {
                picker.reset();
                uploadedImageUrl = null;
                imageMode = false;
            }
            v2vMode = true;
            
            if (activeV2vModels.length > 0) {
                selectedModel = activeV2vModels[0].id;
                selectedModelName = activeV2vModels[0].name;
                updateLabel('v-model-btn-label', selectedModelName);
                updateControlsForModel(selectedModel);
            }
            textarea.placeholder = 'Vídeo cargado — escribe un prompt y haz clic en Generar';
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
        if (activeT2vModels.length > 0) {
            selectedModel = activeT2vModels[0].id;
            selectedModelName = activeT2vModels[0].name;
            updateLabel('v-model-btn-label', selectedModelName);
            updateControlsForModel(selectedModel);
        }
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

    const modelBtn = createControlBtn(`<div class="w-4 h-4 md:w-5 md:h-5 bg-[#FFB000] rounded flex items-center justify-center shadow-[0_0_10px_rgba(255,176,0,0.3)] shrink-0"><span class="text-[8px] md:text-[10px] font-black text-black">K</span></div>`, selectedModelName, 'v-model-btn');
    const arBtn = createControlBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`, selectedAr, 'v-ar-btn');
    const durationBtn = createControlBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`, `${selectedDuration}s`, 'v-duration-btn');
    const resolutionBtn = createControlBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><path d="M6 2L3 6v15a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"/></svg>`, selectedResolution || '720p', 'v-resolution-btn');
    const qualityBtn = createControlBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`, selectedQuality || 'basic', 'v-quality-btn');
    const modeBtn = createControlBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`, selectedMode || 'normal', 'v-mode-btn');
    const effectNameBtn = createControlBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50 shrink-0 md:w-4 md:h-4"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></svg>`, 'Efecto', 'v-effect-btn');

    controlsLeft.appendChild(modelBtn);
    controlsLeft.appendChild(arBtn);
    controlsLeft.appendChild(durationBtn);
    controlsLeft.appendChild(resolutionBtn);
    controlsLeft.appendChild(qualityBtn);
    controlsLeft.appendChild(effectNameBtn);

    bottomRow.appendChild(controlsLeft);
    bottomRow.appendChild(generateBtn);
    bar.appendChild(bottomRow);
    promptWrapper.appendChild(bar);
    container.appendChild(promptWrapper);

    // Instrucciones
    const inlineInstructions = document.createElement('div');
    inlineInstructions.className = 'w-full text-center text-white/30 text-sm flex flex-col items-center gap-1 md:gap-2 py-2 px-4';
    inlineInstructions.innerHTML = `<p class="text-xs md:text-sm">🎬 Escribe un prompt y haz clic en <span class="text-[#FFB000] font-semibold">Generar</span>.</p><p class="text-[10px] md:text-xs text-white/20">Puedes lanzar varios vídeos a la vez sin esperar.</p>`;
    container.appendChild(inlineInstructions);

    // ==========================================
    // 3. DROPDOWNS
    // ==========================================
    const dropdown = document.createElement('div');
    dropdown.className = 'fixed z-[999999] transition-all opacity-0 pointer-events-none scale-95 origin-bottom-left glass rounded-2xl md:rounded-3xl p-2 md:p-3 shadow-2xl border border-white/10 flex flex-col bg-[#111]/95 backdrop-blur-xl';

    const showDropdown = (type, anchorBtn) => {
        dropdown.innerHTML = '';
        dropdown.classList.remove('opacity-0', 'pointer-events-none');
        dropdown.classList.add('opacity-100', 'pointer-events-auto');

        if (type === 'model') {
            dropdown.classList.add('w-[calc(100vw-3rem)]', 'max-w-xs', 'md:w-[300px]');
            dropdown.innerHTML = `
                <div class="flex flex-col max-h-[50vh] md:max-h-[60vh]">
                    <div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 shrink-0 border-b border-white/5 mb-2">Modelos KreateIA</div>
                    <div id="v-model-list-container" class="flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-1 pb-1"></div>
                </div>
            `;
            const list = dropdown.querySelector('#v-model-list-container');

            const makeModelItem = (m, isV2V = false) => {
                const item = document.createElement('div');
                item.className = `flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all border border-transparent ${selectedModel === m.id ? 'bg-white/5 border-white/5' : ''}`;
                item.innerHTML = `
                    <div class="flex items-center gap-3">
                         <div class="w-8 h-8 md:w-10 md:h-10 bg-[#FFB000]/10 text-[#FFB000] border border-white/5 rounded-lg md:rounded-xl flex items-center justify-center font-black text-xs shadow-inner uppercase">K</div>
                         <div class="flex flex-col gap-0.5">
                            <span class="text-xs md:text-sm font-bold text-white tracking-tight">${m.name}</span>
                         </div>
                    </div>
                    ${selectedModel === m.id ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    if (isV2V) {
                        v2vMode = true; imageMode = false;
                        picker.reset(); uploadedImageUrl = null;
                        selectedModel = m.id; selectedModelName = m.name;
                        updateLabel('v-model-btn-label', selectedModelName);
                        updateControlsForModel(selectedModel);
                        textarea.placeholder = 'Sube un vídeo usando el botón 🎥, luego haz clic en Generar';
                        textarea.disabled = false;
                    } else {
                        if (v2vMode) { v2vMode = false; uploadedVideoUrl = null; showVideoIcon(); }
                        selectedModel = m.id; selectedModelName = m.name;
                        updateLabel('v-model-btn-label', selectedModelName);
                        updateControlsForModel(selectedModel);
                        if (selectedModel.toLowerCase().includes('extend')) {
                            textarea.placeholder = 'Opcional: describe cómo continuar el vídeo...';
                        } else {
                            textarea.placeholder = imageMode ? 'Describe el movimiento o efecto (opcional)' : 'Describe el vídeo que quieres crear';
                        }
                    }
                    closeDropdown();
                };
                return item;
            };

            const generationModels = imageMode ? activeI2vModels : activeT2vModels;
            generationModels.forEach(m => list.appendChild(makeModelItem(m, false)));

            if (activeV2vModels.length > 0) {
                const sectionLabel = document.createElement('div');
                sectionLabel.className = 'text-[10px] font-bold text-[#FFB000]/70 uppercase tracking-widest px-3 py-2 mt-2 border-t border-white/5';
                sectionLabel.textContent = 'Efectos sobre Vídeo';
                list.appendChild(sectionLabel);
                activeV2vModels.forEach(m => list.appendChild(makeModelItem(m, true)));
            }
        } else if (type === 'ar') {
            dropdown.classList.remove('w-[calc(100vw-3rem)]', 'max-w-xs');
            dropdown.classList.add('w-[240px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Relación de Aspecto</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1 max-h-[50vh] overflow-y-auto custom-scrollbar';
            getCurrentAspectRatios(selectedModel).forEach(r => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `<div class="flex items-center gap-3"><div class="w-5 h-5 border-2 border-white/20 rounded md:rounded-md shadow-inner flex items-center justify-center group-hover:border-[#FFB000]/50"><div class="w-2 h-2 bg-white/10 rounded-[1px]"></div></div><span class="text-xs md:text-sm font-bold text-white opacity-80 group-hover:opacity-100">${r}</span></div>${selectedAr === r ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); selectedAr = r; updateLabel('v-ar-btn-label', r); updateControlsForModel(selectedModel); closeDropdown(); };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'duration') {
            dropdown.classList.remove('w-[calc(100vw-3rem)]', 'max-w-xs');
            dropdown.classList.add('w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Duración</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1 max-h-[50vh] overflow-y-auto custom-scrollbar';
            getCurrentDurations(selectedModel).forEach(d => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white opacity-80 group-hover:opacity-100">${d}s</span>${selectedDuration === d ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); selectedDuration = d; updateLabel('v-duration-btn-label', `${d}s`); updateControlsForModel(selectedModel); closeDropdown(); };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'quality') {
            dropdown.classList.remove('w-[calc(100vw-3rem)]', 'max-w-xs');
            dropdown.classList.add('w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Calidad</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1 max-h-[50vh] overflow-y-auto custom-scrollbar';
            getQualitiesForModel(selectedModel).forEach(q => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white opacity-80 group-hover:opacity-100 capitalize">${q}</span>${selectedQuality === q ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); selectedQuality = q; updateLabel('v-quality-btn-label', q); updateControlsForModel(selectedModel); closeDropdown(); };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'resolution') {
            dropdown.classList.remove('w-[calc(100vw-3rem)]', 'max-w-xs');
            dropdown.classList.add('w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Resolución</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1 max-h-[50vh] overflow-y-auto custom-scrollbar';
            getCurrentResolutions(selectedModel).forEach(r => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white opacity-80 group-hover:opacity-100">${r}</span>${selectedResolution === r ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); selectedResolution = r; updateLabel('v-resolution-btn-label', r); updateControlsForModel(selectedModel); closeDropdown(); };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'mode') {
            dropdown.classList.remove('w-[calc(100vw-3rem)]', 'max-w-xs');
            dropdown.classList.add('w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Modo</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1 max-h-[50vh] overflow-y-auto custom-scrollbar';
            getCurrentModes(selectedModel).forEach(m => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white opacity-80 group-hover:opacity-100 capitalize">${m}</span>${selectedMode === m ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); selectedMode = m; updateLabel('v-mode-btn-label', m); updateControlsForModel(selectedModel); closeDropdown(); };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'effect') {
            dropdown.classList.add('max-w-[240px]');
            dropdown.classList.remove('max-w-[200px]', 'w-[calc(100vw-3rem)]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Tipo de Efecto</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1 max-h-[50vh] overflow-y-auto custom-scrollbar';
            getEffectNamesForModel(selectedModel).forEach(e => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2.5 md:p-3.5 hover:bg-white/5 rounded-xl md:rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white opacity-80 group-hover:opacity-100">${e}</span>${selectedEffectName === e ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (ev) => { ev.stopPropagation(); selectedEffectName = e; updateLabel('v-effect-btn-label', e); updateControlsForModel(selectedModel); closeDropdown(); };
                list.appendChild(item);
            });
            dropdown.appendChild(list);
        }

        const btnRect = anchorBtn.getBoundingClientRect();
        if (window.innerWidth < 768) {
            dropdown.style.top = 'auto';
            dropdown.style.bottom = '16px';
            dropdown.style.left = '16px';
            dropdown.style.right = '16px';
            dropdown.style.transformOrigin = 'bottom center';
        } else {
            dropdown.style.bottom = 'auto';
            dropdown.style.top = `${btnRect.bottom + 8}px`;
            dropdown.style.left = `${btnRect.left}px`;
            dropdown.style.right = 'auto';
            dropdown.style.transformOrigin = 'top left';

            const dropdownHeight = 300; 
            if (btnRect.bottom + dropdownHeight > window.innerHeight) {
                dropdown.style.top = 'auto';
                dropdown.style.bottom = `${window.innerHeight - btnRect.top + 8}px`;
                dropdown.style.transformOrigin = 'bottom left';
            }
        }
    };

    const closeDropdown = () => { dropdown.classList.add('opacity-0', 'pointer-events-none', 'scale-95'); dropdown.classList.remove('opacity-100', 'pointer-events-auto', 'scale-100'); dropdownOpen = null; };
    const toggleDropdown = (type, btn) => (e) => { e.stopPropagation(); if (dropdownOpen === type) closeDropdown(); else { dropdownOpen = type; showDropdown(type, btn); } };

    modelBtn.onclick = toggleDropdown('model', modelBtn);
    arBtn.onclick = toggleDropdown('ar', arBtn);
    durationBtn.onclick = toggleDropdown('duration', durationBtn);
    resolutionBtn.onclick = toggleDropdown('resolution', resolutionBtn);
    qualityBtn.onclick = toggleDropdown('quality', qualityBtn);
    modeBtn.onclick = toggleDropdown('mode', modeBtn);
    effectNameBtn.onclick = toggleDropdown('effect', effectNameBtn);

    window.addEventListener('click', closeDropdown);
    document.body.appendChild(dropdown);

    // ==========================================
    // 4. NUEVA GALERÍA MULTITAREA (FEED INFERIOR)
    // ==========================================
    const galleryWrapper = document.createElement('div');
    galleryWrapper.className = 'w-full max-w-6xl mt-4 md:mt-8 flex-1 flex flex-col shrink-0 px-2 md:px-0';
    
    const galleryHeader = document.createElement('h3');
    galleryHeader.className = 'text-[10px] md:text-xs font-bold text-white/40 uppercase tracking-widest mb-3 md:mb-4 px-2 hidden';
    galleryHeader.textContent = 'Tus Creaciones';
    galleryWrapper.appendChild(galleryHeader);

    const galleryGrid = document.createElement('div');
    // Usamos columnas más grandes porque es vídeo
    galleryGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5 w-full';
    galleryWrapper.appendChild(galleryGrid);

    container.appendChild(galleryWrapper);

    const downloadFile = async (url, filename) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch (err) {
            window.open(url, '_blank');
        }
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
                        <button class="extend-btn hidden p-1.5 md:p-2 bg-[#3B82F6]/20 hover:bg-[#3B82F6] text-[#3B82F6] hover:text-white rounded-lg md:rounded-xl backdrop-blur-md transition-all border border-[#3B82F6]/30" title="Extender este vídeo">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        </button>
                        <button class="download-btn p-1.5 md:p-2 bg-white/20 hover:bg-[#FFB000] hover:text-black text-white rounded-lg md:rounded-xl backdrop-blur-md transition-all border border-white/20" title="Descargar">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                        </button>
                    </div>
                </div>
            </div>
            <!-- Controles Móviles -->
            <div class="md:hidden absolute top-2 right-2 flex flex-col gap-2">
                 <button class="extend-btn-mobile hidden p-1.5 bg-black/50 text-[#3B82F6] rounded-lg backdrop-blur-md border border-white/10">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                 </button>
                 <button class="download-btn-mobile p-1.5 bg-black/50 text-white rounded-lg backdrop-blur-md border border-white/10">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                 </button>
            </div>
        `;

        // Lógica del botón Extender si es compatible
        const isSeedance2 = entry.model && (entry.model.toLowerCase().includes('seedance') || entry.model.toLowerCase().includes('sd-2')) && !entry.model.toLowerCase().includes('extend');
        if (isSeedance2) {
            const showExtend = () => {
                lastGenerationId = entry.id;
                
                // Buscamos el modelo Extend en nuestra lista activa (tiene __order = 2)
                const extendModel = activeT2vModels.find(m => m.__order === 2) || activeI2vModels.find(m => m.__order === 2) || activeV2vModels.find(m => m.__order === 2);
                selectedModel = extendModel ? extendModel.id : 'seedance-v2.0-extend';
                selectedModelName = extendModel ? extendModel.name : 'KreateVideo 2 Extend';
                
                updateLabel('v-model-btn-label', selectedModelName);
                updateControlsForModel(selectedModel);
                
                textarea.placeholder = 'Opcional: describe cómo continuar este vídeo...';
                textarea.disabled = false;
                
                // Scroll arriba del todo suave
                container.scrollTo({ top: 0, behavior: 'smooth' });
                textarea.focus();
            };

            const desktopExt = card.querySelector('.extend-btn');
            const mobileExt = card.querySelector('.extend-btn-mobile');
            const badge = card.querySelector('.extend-badge');
            
            if(desktopExt) { desktopExt.classList.remove('hidden'); desktopExt.onclick = (e) => { e.stopPropagation(); showExtend(); } }
            if(mobileExt) { mobileExt.classList.remove('hidden'); mobileExt.onclick = (e) => { e.stopPropagation(); showExtend(); } }
            if(badge) { badge.classList.remove('hidden'); }
        }

        const triggerDownload = (e) => {
            e.stopPropagation();
            const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            downloadFile(entry.url, `KreateVideo-${randomCode}.mp4`);
        };

        const btnDesktop = card.querySelector('.download-btn');
        if (btnDesktop) btnDesktop.onclick = triggerDownload;
        
        const btnMobile = card.querySelector('.download-btn-mobile');
        if (btnMobile) btnMobile.onclick = triggerDownload;

        if (isPrepend) {
            galleryGrid.prepend(card);
        } else {
            galleryGrid.appendChild(card);
        }
    };

    const loadFirebaseHistory = async (user) => {
        try {
            const genRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'video_generations');
            const q = query(genRef, orderBy('createdAt', 'desc'), limit(20));
            const snap = await getDocs(q);

            if (!snap.empty) {
                snap.forEach(doc => {
                    const data = doc.data();
                    renderCard({ id: doc.id, ...data });
                });
            }
        } catch (error) {
            console.error("Error cargando historial de Firebase:", error);
        }
    };

    onAuthStateChanged(auth, (user) => {
        if (user) loadFirebaseHistory(user);
    });

    const manualPolling = async (requestId, token) => {
        let attempts = 0;
        while (attempts < 120) {
            await new Promise(r => setTimeout(r, 2000));
            try {
                const poll = await fetch(`/api/v1/predictions/${requestId}/result`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (poll.ok) {
                    const pollRes = await poll.json();
                    const finalUrl = pollRes.url || pollRes.video_url || pollRes.output?.url || pollRes.outputs?.[0] || pollRes.output?.outputs?.[0] || (pollRes.images && pollRes.images[0]?.url);
                    if (finalUrl) return { url: finalUrl, id: requestId };
                    if (pollRes.status === 'failed' || pollRes.status === 'error') throw new Error("Error interno del servidor de vídeo.");
                }
            } catch(e) { } // ignoramos errores de red temporales y seguimos preguntando
            attempts++;
        }
        throw new Error("Tiempo de espera agotado.");
    };

    // ==========================================
    // 5. GENERACIÓN MULTITAREA Y FACTURACIÓN
    // ==========================================
    generateBtn.onclick = async () => {
        const promptText = textarea.value.trim();
        const isExtendMode = selectedModel.toLowerCase().includes('extend');

        if (v2vMode && !uploadedVideoUrl) return alert('Sube un vídeo de referencia.');
        if (imageMode && !uploadedImageUrl) return alert('Sube una imagen.');
        if (!imageMode && !v2vMode && !promptText && !isExtendMode) return alert('Escribe un prompt.');

        if (!auth.currentUser) return AuthModal(() => generateBtn.click());

        // FACTURACIÓN: Comprobar saldo antes de empezar
        const cost = calculateVideoCost(selectedModel, selectedDuration);
        const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid);
        
        try {
            const userSnap = await getDoc(userRef);
            const currentCredits = userSnap.exists() ? (userSnap.data().credits || 0) : 0;
            if (currentCredits < cost) {
                return alert(`⚠️ Saldo insuficiente.\nRequiere ${cost} 🪙 y dispones de ${currentCredits} 🪙.\nRecarga créditos en el panel superior.`);
            }
        } catch (err) {
            return alert("No hemos podido verificar tu saldo. Revisa tu conexión a internet.");
        }

        // --- TARJETA DE CARGA EN LA GALERÍA ---
        const tempId = Date.now().toString();
        galleryHeader.classList.remove('hidden');
        
        const loadingCard = document.createElement('div');
        loadingCard.id = `card-${tempId}`;
        loadingCard.className = 'relative aspect-video rounded-xl md:rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex flex-col items-center justify-center animate-fade-in-up';
        
        loadingCard.innerHTML = `
            <div class="absolute inset-0 bg-gradient-to-tr from-[#3B82F6]/5 to-[#FFB000]/5 animate-pulse"></div>
            <div class="z-10 flex flex-col items-center gap-2 md:gap-3">
                <div class="w-8 h-8 md:w-10 md:h-10 border-4 border-[#FFB000]/30 border-t-[#FFB000] rounded-full animate-spin"></div>
                <span class="text-xs md:text-sm font-bold text-[#FFB000] animate-pulse">Renderizando vídeo...</span>
            </div>
            <div class="absolute bottom-2 md:bottom-4 left-2 right-2 md:left-4 md:right-4 text-[8px] md:text-[10px] text-center text-white/40 line-clamp-2 px-1 md:px-2 leading-tight">${promptText || (isExtendMode ? 'Extendiendo vídeo' : 'Procesando')}</div>
        `;
        
        galleryGrid.prepend(loadingCard);

        // Limpiamos UI para que el usuario pueda lanzar otro
        textarea.value = ''; 
        textarea.style.height = 'auto'; 
        
        const originalText = generateBtn.innerHTML;
        generateBtn.innerHTML = `Lanzado 🚀`;
        setTimeout(() => { updateControlsForModel(selectedModel); }, 1000);

        try {
            let res;
            const token = await auth.currentUser.getIdToken();
            let capturedRequestId = null;
            
            // --- EL PUENTE DIRECTO (Bypass a muapi.js para I2V y V2V) ---
            if (v2vMode || imageMode) {
                const params = { 
                    model: selectedModel, 
                    prompt: promptText || ''
                };
                
                if (v2vMode) {
                    params.video_url = uploadedVideoUrl;
                } else {
                    params.image_url = uploadedImageUrl;
                    params.aspect_ratio = selectedAr;
                    const durs = getCurrentDurations(selectedModel); 
                    if (durs.length > 0) params.duration = selectedDuration;
                }

                const req = await fetch(`/api/v1/${selectedModel}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(params)
                });
                
                if (!req.ok) throw new Error(`Error HTTP: ${req.status}`);
                res = await req.json();

                if (res.request_id && !res.url) {
                    capturedRequestId = res.request_id;
                    res = await manualPolling(capturedRequestId, token);
                }

            } else {
                // T2V estándar o Extend 
                const onRequestId = (rid) => { capturedRequestId = rid; };
                const params = { model: selectedModel, aspect_ratio: selectedAr, onRequestId };
                if (promptText) params.prompt = promptText;
                
                if (isExtendMode) { 
                    params.request_id = lastGenerationId; 
                }
                
                const durs = getCurrentDurations(selectedModel); if (durs.length > 0) params.duration = selectedDuration;
                
                try {
                    res = await muapi.generateVideo(params);
                } catch (muapiErr) {
                    if (capturedRequestId && (muapiErr.message.includes('Tiempo de espera') || muapiErr.message.includes('timeout') || muapiErr.message.includes('is not a function'))) {
                        res = await manualPolling(capturedRequestId, token);
                    } else {
                        throw muapiErr;
                    }
                }
            }

            if (res && res.url) {
                // FACTURACIÓN: Cobrar ahora que tenemos éxito
                try { await updateDoc(userRef, { credits: increment(-cost) }); } catch (e) { /* silent */ }

                const entryData = {
                    url: res.url,
                    prompt: promptText || (isExtendMode ? 'Extensión' : ''),
                    model: selectedModel,
                    duration: selectedDuration,
                    aspect_ratio: selectedAr,
                    type: 'video'
                };

                let realId = capturedRequestId || Date.now().toString();
                try {
                    const genRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid, 'video_generations');
                    const docRef = await addDoc(genRef, { ...entryData, createdAt: serverTimestamp() });
                    realId = docRef.id;
                } catch (e) { console.error("Firebase save failed", e); }

                loadingCard.remove();
                renderCard({ id: realId, ...entryData }, true);
                
                // Si la generación fue exitosa, limpiamos el extendMode del prompt bar (por si estaba activado)
                if (isExtendMode) {
                    const closeExtBtn = container.querySelector('#cancel-extend-btn');
                    if (closeExtBtn) closeExtBtn.click();
                }

            } else {
                throw new Error('Sin respuesta de URL.');
            }
        } catch (e) {
            console.error(e);
            loadingCard.innerHTML = `
                <div class="absolute inset-0 bg-red-500/10"></div>
                <div class="z-10 flex flex-col items-center gap-1 md:gap-2 p-2 md:p-4 text-center">
                    <span class="text-lg md:text-xl">⚠️</span>
                    <span class="text-[8px] md:text-[10px] font-bold text-red-400">Error en renderizado</span>
                    <span class="text-white/50 text-[6px]">No se han descontado créditos</span>
                    <button class="retry-btn mt-1 md:mt-2 bg-white/10 px-2 py-1 md:px-3 rounded-md md:rounded-lg text-[8px] md:text-xs text-white hover:bg-white/20 transition-all border border-white/10">Quitar</button>
                </div>
            `;
            loadingCard.querySelector('.retry-btn').onclick = () => loadingCard.remove();
        }
    };

    // Inicialización segura
    updateControlsForModel(selectedModel);

    return container;
}
