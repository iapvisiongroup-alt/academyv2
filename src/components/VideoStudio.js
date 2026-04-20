import { muapi } from '../lib/muapi.js';
import { t2vModels, getAspectRatiosForVideoModel, getDurationsForModel, getResolutionsForVideoModel, i2vModels, getAspectRatiosForI2VModel, getDurationsForI2VModel, getResolutionsForI2VModel, v2vModels, getModesForModel } from '../lib/models.js';
import { AuthModal } from './AuthModal.js';
import { createUploadPicker } from './UploadPicker.js';
import { savePendingJob, removePendingJob, getPendingJobs } from '../lib/pendingJobs.js';

export function VideoStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center justify-center bg-[#050505] relative p-4 md:p-6 overflow-y-auto custom-scrollbar overflow-x-hidden';

    // --- State ---
    const defaultModel = t2vModels[0];
    let selectedModel = defaultModel.id;
    let selectedModelName = defaultModel.name;
    let selectedAr = defaultModel.inputs?.aspect_ratio?.default || '16:9';
    let selectedDuration = defaultModel.inputs?.duration?.default || 5;
    let selectedResolution = defaultModel.inputs?.resolution?.default || '';
    let selectedQuality = defaultModel.inputs?.quality?.default || '';
    let selectedMode = '';
    let selectedEffectName = '';
    let lastGenerationId = null;
    let lastGenerationModel = null;
    let dropdownOpen = null;
    let uploadedImageUrl = null;
    let imageMode = false; // false = t2v models, true = i2v models
    let v2vMode = false;   // true = video-to-video tools mode
    let uploadedVideoUrl = null;

    const getCurrentModels = () => v2vMode ? v2vModels : (imageMode ? i2vModels : t2vModels);
    const getCurrentAspectRatios = (id) => imageMode ? getAspectRatiosForI2VModel(id) : getAspectRatiosForVideoModel(id);
    const getCurrentDurations = (id) => imageMode ? getDurationsForI2VModel(id) : getDurationsForModel(id);
    const getCurrentResolutions = (id) => imageMode ? getResolutionsForI2VModel(id) : getResolutionsForVideoModel(id);
    const getCurrentModes = (id) => getModesForModel(id);
    const getCurrentModel = () => getCurrentModels().find(m => m.id === selectedModel);
    const getQualitiesForModel = (id) => {
        const model = getCurrentModels().find(m => m.id === id);
        return model?.inputs?.quality?.enum || [];
    };
    const getEffectNamesForModel = (id) => {
        const model = getCurrentModels().find(m => m.id === id);
        return model?.inputs?.name?.enum || [];
    };

    // ==========================================
    // 1. HERO SECTION
    // ==========================================
    const hero = document.createElement('div');
    hero.className = 'flex flex-col items-center mb-10 md:mb-20 animate-fade-in-up transition-all duration-700';
    hero.innerHTML = `
        <div class="mb-10 relative group">
             <div class="absolute inset-0 bg-[#FFB000]/20 blur-[100px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-1000"></div>
             <div class="relative w-24 h-24 md:w-32 md:h-32 bg-[#111111] rounded-3xl flex items-center justify-center border border-white/5 overflow-hidden">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-[#FFB000] opacity-20 absolute -right-4 -bottom-4">
                    <polygon points="23 7 16 12 23 17 23 7"/>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                <div class="w-16 h-16 bg-[#FFB000]/10 rounded-2xl flex items-center justify-center border border-[#FFB000]/20 shadow-glow relative z-10">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[#FFB000]">
                        <polygon points="23 7 16 12 23 17 23 7"/>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                    </svg>
                </div>
                <div class="absolute top-4 right-4 text-[#3B82F6] animate-pulse">✨</div>
             </div>
        </div>
        <h1 class="text-2xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-4 selection:bg-[#FFB000] selection:text-black text-center px-4">Estudio de Vídeo</h1>
        <p class="text-white/50 text-sm font-medium tracking-wide opacity-60">Anima imágenes y crea vídeos increíbles con IA</p>
    `;
    container.appendChild(hero);

    // ==========================================
    // 2. PROMPT BAR
    // ==========================================
    const promptWrapper = document.createElement('div');
    promptWrapper.className = 'w-full max-w-4xl relative z-40 animate-fade-in-up';
    promptWrapper.style.animationDelay = '0.2s';

    const bar = document.createElement('div');
    bar.className = 'w-full bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] p-3 md:p-5 flex flex-col gap-3 md:gap-5 shadow-3xl';

    const topRow = document.createElement('div');
    topRow.className = 'flex items-start gap-5 px-2';

    // --- Image Upload Picker (Image-to-Video) ---
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
                selectedModel = i2vModels[0].id;
                selectedModelName = i2vModels[0].name;
                document.getElementById('v-model-btn-label').textContent = selectedModelName;
                updateControlsForModel(selectedModel);
            }
            textarea.placeholder = 'Describe el movimiento o efecto (opcional)';
            textarea.disabled = false;
        },
        onClear: () => {
            uploadedImageUrl = null;
            imageMode = false;
            selectedModel = t2vModels[0].id;
            selectedModelName = t2vModels[0].name;
            document.getElementById('v-model-btn-label').textContent = selectedModelName;
            updateControlsForModel(selectedModel);
            textarea.placeholder = 'Describe el vídeo que quieres crear';
            textarea.disabled = false;
        }
    });
    topRow.appendChild(picker.trigger);
    container.appendChild(picker.panel);

    // --- Video Upload Picker (Video-to-Video) ---
    const videoFileInput = document.createElement('input');
    videoFileInput.type = 'file';
    videoFileInput.accept = 'video/*';
    videoFileInput.className = 'hidden';

    const videoPickerBtn = document.createElement('button');
    videoPickerBtn.type = 'button';
    videoPickerBtn.title = 'Subir vídeo para transformar';
    videoPickerBtn.className = 'w-10 h-10 shrink-0 rounded-xl border transition-all flex items-center justify-center relative overflow-hidden mt-1.5 bg-white/5 border-white/10 hover:bg-white/10 hover:border-[#FFB000]/40 group';

    const videoIconEl = document.createElement('div');
    videoIconEl.className = 'flex items-center justify-center w-full h-full';
    videoIconEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40 group-hover:text-[#FFB000] transition-colors"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;

    const videoSpinnerEl = document.createElement('div');
    videoSpinnerEl.className = 'hidden items-center justify-center w-full h-full';
    videoSpinnerEl.innerHTML = `<span class="animate-spin text-[#FFB000] text-sm">◌</span>`;

    const videoReadyEl = document.createElement('div');
    videoReadyEl.className = 'hidden items-center justify-center w-full h-full';
    videoReadyEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[#FFB000]"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/><polyline points="7 10 10 13 15 8" stroke="#3B82F6" stroke-width="2.5"/></svg>`;

    videoPickerBtn.appendChild(videoFileInput);
    videoPickerBtn.appendChild(videoIconEl);
    videoPickerBtn.appendChild(videoSpinnerEl);
    videoPickerBtn.appendChild(videoReadyEl);

    const showVideoIcon = () => {
        videoIconEl.classList.replace('hidden', 'flex');
        videoSpinnerEl.classList.add('hidden'); videoSpinnerEl.classList.remove('flex');
        videoReadyEl.classList.add('hidden'); videoReadyEl.classList.remove('flex');
        videoPickerBtn.classList.remove('border-[#FFB000]/60');
        videoPickerBtn.classList.add('border-white/10');
        videoPickerBtn.title = 'Subir vídeo para transformar';
    };

    const showVideoSpinner = () => {
        videoIconEl.classList.add('hidden'); videoIconEl.classList.remove('flex');
        videoSpinnerEl.classList.replace('hidden', 'flex');
        videoReadyEl.classList.add('hidden'); videoReadyEl.classList.remove('flex');
    };

    const showVideoReady = (filename) => {
        videoIconEl.classList.add('hidden'); videoIconEl.classList.remove('flex');
        videoSpinnerEl.classList.add('hidden'); videoSpinnerEl.classList.remove('flex');
        videoReadyEl.classList.replace('hidden', 'flex');
        videoPickerBtn.classList.remove('border-white/10');
        videoPickerBtn.classList.add('border-[#FFB000]/60');
        videoPickerBtn.title = `${filename} — haz clic para borrar`;
    };

    const clearVideoUpload = () => {
        uploadedVideoUrl = null;
        v2vMode = false;
        showVideoIcon();
        selectedModel = t2vModels[0].id;
        selectedModelName = t2vModels[0].name;
        document.getElementById('v-model-btn-label').textContent = selectedModelName;
        updateControlsForModel(selectedModel);
        textarea.placeholder = 'Describe el vídeo que quieres crear';
        textarea.disabled = false;
    };

    videoPickerBtn.onclick = (e) => {
        e.stopPropagation();
        if (uploadedVideoUrl) {
            clearVideoUpload();
        } else {
            videoFileInput.click();
        }
    };

    videoFileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const apiKey = localStorage.getItem('muapi_key');
        if (!apiKey) {
            AuthModal(() => videoFileInput.click());
            return;
        }

        showVideoSpinner();
        try {
            const url = await muapi.uploadFile(file);
            uploadedVideoUrl = url;
            showVideoReady(file.name);

            if (imageMode) {
                picker.reset();
                uploadedImageUrl = null;
                imageMode = false;
            }
            v2vMode = true;
            selectedModel = v2vModels[0].id;
            selectedModelName = v2vModels[0].name;
            document.getElementById('v-model-btn-label').textContent = selectedModelName;
            updateControlsForModel(selectedModel);
            textarea.placeholder = 'Vídeo listo — haz clic en Generar para aplicar';
            textarea.disabled = true;
        } catch (err) {
            console.error('[VideoStudio] Video upload failed:', err);
            showVideoIcon();
            alert(`Error al subir vídeo: ${err.message}`);
        }
        videoFileInput.value = '';
    };

    topRow.appendChild(videoPickerBtn);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Describe el vídeo que quieres crear';
    textarea.className = 'flex-1 bg-transparent border-none text-white text-base md:text-xl placeholder:text-white/30 focus:outline-none resize-none pt-2.5 leading-relaxed min-h-[40px] max-h-[150px] md:max-h-[250px] overflow-y-auto custom-scrollbar';
    textarea.rows = 1;
    textarea.oninput = () => {
        textarea.style.height = 'auto';
        const maxHeight = window.innerWidth < 768 ? 150 : 250;
        textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
    };

    topRow.appendChild(textarea);
    bar.appendChild(topRow);

    // Extend mode banner
    const extendBanner = document.createElement('div');
    extendBanner.className = 'hidden items-center gap-2 px-4 py-2 mx-2 mt-2 bg-[#3B82F6]/10 border border-[#3B82F6]/20 rounded-xl text-xs text-[#3B82F6]';
    extendBanner.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        <span>Extendiendo generación anterior — añade un prompt opcional para guiar la continuación</span>
    `;
    bar.appendChild(extendBanner);

    // Bottom Row: Controls
    const bottomRow = document.createElement('div');
    bottomRow.className = 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 px-2 pt-4 border-t border-white/5';

    const controlsLeft = document.createElement('div');
    controlsLeft.className = 'flex items-center gap-1.5 md:gap-2.5 relative overflow-x-auto no-scrollbar pb-1 md:pb-0';

    const createControlBtn = (icon, label, id, tooltip) => {
        const btn = document.createElement('button');
        btn.id = id;
        btn.className = 'flex items-center gap-1.5 md:gap-2.5 px-3 md:px-4 py-2 md:py-2.5 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl transition-all border border-white/5 group whitespace-nowrap';
        if (tooltip) btn.setAttribute('data-tooltip', tooltip);
        btn.innerHTML = `
            ${icon}
            <span id="${id}-label" class="text-xs font-bold text-white group-hover:text-[#FFB000] transition-colors">${label}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" class="opacity-20 group-hover:opacity-100 transition-opacity"><path d="M6 9l6 6 6-6"/></svg>
        `;
        return btn;
    };

    const modelBtn = createControlBtn(`
        <div class="w-5 h-5 bg-[#FFB000] rounded-md flex items-center justify-center shadow-[0_0_10px_rgba(255,176,0,0.3)]">
            <span class="text-[10px] font-black text-black">V</span>
        </div>
    `, selectedModelName, 'v-model-btn', 'Seleccionar modelo de vídeo AI');

    const arBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
    `, selectedAr, 'v-ar-btn', 'Cambiar relación de aspecto');

    const durationBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    `, `${selectedDuration}s`, 'v-duration-btn', 'Ajustar duración del vídeo');

    const resolutionBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50"><path d="M6 2L3 6v15a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"/></svg>
    `, selectedResolution || '720p', 'v-resolution-btn', 'Ajustar resolución de salida');

    const qualityBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
    `, selectedQuality || 'basic', 'v-quality-btn', 'Ajustar calidad');

    const modeBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    `, selectedMode || 'normal', 'v-mode-btn');

    const effectNameBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></svg>
    `, 'Efecto', 'v-effect-btn', 'Seleccionar tipo de efecto');

    controlsLeft.appendChild(modelBtn);
    controlsLeft.appendChild(arBtn);
    controlsLeft.appendChild(durationBtn);
    controlsLeft.appendChild(resolutionBtn);
    controlsLeft.appendChild(qualityBtn);
    controlsLeft.appendChild(effectNameBtn);

    // Initial visibility (t2v mode)
    const initDurations = getDurationsForModel(defaultModel.id);
    durationBtn.style.display = initDurations.length > 0 ? 'flex' : 'none';
    const initResolutions = getResolutionsForVideoModel(defaultModel.id);
    resolutionBtn.style.display = initResolutions.length > 0 ? 'flex' : 'none';
    qualityBtn.style.display = 'none';
    modeBtn.style.display = getModesForModel(defaultModel.id).length > 0 ? 'flex' : 'none';
    effectNameBtn.style.display = 'none';

    const generateBtn = document.createElement('button');
    generateBtn.className = 'bg-[#FFB000] text-black px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-[1.5rem] font-black text-sm md:text-base hover:shadow-[0_0_20px_rgba(255,176,0,0.4)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2.5 w-full sm:w-auto shadow-lg';
    generateBtn.setAttribute('data-tooltip', 'Generar vídeo IA');
    generateBtn.innerHTML = `Generar ✨`;

    bottomRow.appendChild(controlsLeft);
    bottomRow.appendChild(generateBtn);
    bar.appendChild(bottomRow);
    promptWrapper.appendChild(bar);
    container.appendChild(promptWrapper);

    // ==========================================
    // 3. DROPDOWNS
    // ==========================================
    const dropdown = document.createElement('div');
    dropdown.className = 'absolute bottom-[102%] left-2 z-50 transition-all opacity-0 pointer-events-none scale-95 origin-bottom-left glass rounded-3xl p-3 translate-y-2 w-[calc(100vw-3rem)] max-w-xs shadow-4xl border border-white/10 flex flex-col bg-[#111]/95 backdrop-blur-xl';

    const updateControlsForModel = (modelId) => {
        const model = getCurrentModels().find(m => m.id === modelId);

        if (v2vMode) {
            arBtn.style.display = 'none';
            durationBtn.style.display = 'none';
            resolutionBtn.style.display = 'none';
            qualityBtn.style.display = 'none';
            modeBtn.style.display = 'none';
            effectNameBtn.style.display = 'none';
            extendBanner.classList.add('hidden');
            extendBanner.classList.remove('flex');
            return;
        }

        const availableArs = getCurrentAspectRatios(modelId);
        if (availableArs.length > 0) {
            selectedAr = availableArs[0];
            document.getElementById('v-ar-btn-label').textContent = selectedAr;
            arBtn.style.display = 'flex';
        } else {
            arBtn.style.display = 'none';
        }

        const durations = getCurrentDurations(modelId);
        if (durations.length > 0) {
            selectedDuration = durations[0];
            document.getElementById('v-duration-btn-label').textContent = `${selectedDuration}s`;
            durationBtn.style.display = 'flex';
        } else {
            durationBtn.style.display = 'none';
        }

        const resolutions = getCurrentResolutions(modelId);
        if (resolutions.length > 0) {
            selectedResolution = resolutions[0];
            document.getElementById('v-resolution-btn-label').textContent = selectedResolution;
            resolutionBtn.style.display = 'flex';
        } else {
            resolutionBtn.style.display = 'none';
        }

        const qualities = getQualitiesForModel(modelId);
        if (qualities.length > 0) {
            selectedQuality = model?.inputs?.quality?.default || qualities[0];
            document.getElementById('v-quality-btn-label').textContent = selectedQuality;
            qualityBtn.style.display = 'flex';
        } else {
            selectedQuality = '';
            qualityBtn.style.display = 'none';
        }

        const modes = getCurrentModes(modelId);
        if (modes.length > 0) {
            selectedMode = model?.inputs?.mode?.default || modes[0];
            document.getElementById('v-mode-btn-label').textContent = selectedMode;
            modeBtn.style.display = 'flex';
        } else {
            selectedMode = '';
            modeBtn.style.display = 'none';
        }

        const effectNames = getEffectNamesForModel(modelId);
        if (effectNames.length > 0) {
            selectedEffectName = model?.inputs?.name?.default || effectNames[0];
            document.getElementById('v-effect-btn-label').textContent = selectedEffectName;
            effectNameBtn.style.display = 'flex';
        } else {
            selectedEffectName = '';
            effectNameBtn.style.display = 'none';
        }

        if (model?.requiresRequestId) {
            extendBanner.classList.remove('hidden');
            extendBanner.classList.add('flex');
        } else {
            extendBanner.classList.add('hidden');
            extendBanner.classList.remove('flex');
        }
    };

    const showDropdown = (type, anchorBtn) => {
        dropdown.innerHTML = '';
        dropdown.classList.remove('opacity-0', 'pointer-events-none');
        dropdown.classList.add('opacity-100', 'pointer-events-auto');

        if (type === 'model') {
            dropdown.classList.add('w-[calc(100vw-3rem)]', 'max-w-xs');
            dropdown.classList.remove('max-w-[240px]', 'max-w-[200px]');
            dropdown.innerHTML = `
                <div class="flex flex-col h-full max-h-[70vh]">
                    <div class="px-2 pb-3 mb-2 border-b border-white/5 shrink-0">
                        <div class="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5 border border-white/5 focus-within:border-[#FFB000]/50 transition-colors">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-white/30"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                            <input type="text" id="v-model-search" placeholder="Buscar modelos..." class="bg-transparent border-none text-xs text-white focus:ring-0 w-full p-0 outline-none">
                        </div>
                    </div>
                    <div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 py-2 shrink-0">Modelos de Vídeo</div>
                    <div id="v-model-list-container" class="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2"></div>
                </div>
            `;
            const list = dropdown.querySelector('#v-model-list-container');

            const makeModelItem = (m, isV2V = false) => {
                const item = document.createElement('div');
                item.className = `flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all border border-transparent hover:border-white/5 ${selectedModel === m.id ? 'bg-white/5 border-white/5' : ''}`;
                const iconColor = isV2V ? 'bg-[#FF6B00]/10 text-[#FF6B00]' : m.id.includes('kling') ? 'bg-[#3B82F6]/10 text-[#3B82F6]' : m.id.includes('veo') ? 'bg-purple-500/10 text-purple-400' : m.id.includes('sora') ? 'bg-rose-500/10 text-rose-400' : 'bg-[#FFB000]/10 text-[#FFB000]';
                item.innerHTML = `
                    <div class="flex items-center gap-3.5">
                         <div class="w-10 h-10 ${iconColor} border border-white/5 rounded-xl flex items-center justify-center font-black text-sm shadow-inner uppercase">${m.name.charAt(0)}</div>
                         <div class="flex flex-col gap-0.5">
                            <span class="text-xs font-bold text-white tracking-tight">${m.name}</span>
                            ${isV2V ? '<span class="text-[9px] text-[#FF6B00]/70">Sube un vídeo para usar</span>' : ''}
                         </div>
                    </div>
                    ${selectedModel === m.id ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    if (isV2V) {
                        v2vMode = true;
                        imageMode = false;
                        picker.reset();
                        uploadedImageUrl = null;
                        selectedModel = m.id;
                        selectedModelName = m.name;
                        document.getElementById('v-model-btn-label').textContent = selectedModelName;
                        updateControlsForModel(selectedModel);
                        textarea.placeholder = 'Sube un vídeo usando el botón 🎥, luego haz clic en Generar';
                        textarea.disabled = true;
                    } else {
                        if (v2vMode) {
                            v2vMode = false;
                            uploadedVideoUrl = null;
                            showVideoIcon();
                            textarea.disabled = false;
                        }
                        selectedModel = m.id;
                        selectedModelName = m.name;
                        document.getElementById('v-model-btn-label').textContent = selectedModelName;
                        updateControlsForModel(selectedModel);
                        textarea.placeholder = imageMode ? 'Describe el movimiento o efecto (opcional)' : 'Describe el vídeo que quieres crear';
                    }
                    closeDropdown();
                };
                return item;
            };

            const renderModels = (filter = '') => {
                list.innerHTML = '';
                const lf = filter.toLowerCase();

                const generationModels = imageMode ? i2vModels : t2vModels;
                const filteredMain = generationModels
                    .filter(m => m.name.toLowerCase().includes(lf) || m.id.toLowerCase().includes(lf));
                filteredMain.forEach(m => list.appendChild(makeModelItem(m, false)));

                const filteredV2V = v2vModels.filter(m => m.name.toLowerCase().includes(lf) || m.id.toLowerCase().includes(lf));
                if (filteredV2V.length > 0) {
                    const sectionLabel = document.createElement('div');
                    sectionLabel.className = 'text-[10px] font-bold text-[#FF6B00]/70 uppercase tracking-widest px-3 py-2 mt-1 border-t border-white/5';
                    sectionLabel.textContent = 'Herramientas de Vídeo';
                    list.appendChild(sectionLabel);
                    filteredV2V.forEach(m => list.appendChild(makeModelItem(m, true)));
                }
            };

            renderModels();
            const searchInput = dropdown.querySelector('#v-model-search');
            searchInput.onclick = (e) => e.stopPropagation();
            searchInput.oninput = (e) => renderModels(e.target.value);

        } else if (type === 'ar') {
            dropdown.classList.add('max-w-[240px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Relación de Aspecto</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';
            const availableArs = getCurrentAspectRatios(selectedModel);
            availableArs.forEach(r => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <div class="flex items-center gap-4">
                        <div class="w-6 h-6 border-2 border-white/20 rounded-md shadow-inner flex items-center justify-center group-hover:border-[#FFB000]/50 transition-colors">
                             <div class="w-3 h-3 bg-white/10 rounded-sm"></div>
                        </div>
                        <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100 transition-opacity">${r}</span>
                    </div>
                     ${selectedAr === r ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedAr = r;
                    document.getElementById('v-ar-btn-label').textContent = r;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'duration') {
            dropdown.classList.add('max-w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Duración</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';
            const durations = getCurrentDurations(selectedModel);
            durations.forEach(d => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100">${d}s</span>
                     ${selectedDuration === d ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedDuration = d;
                    document.getElementById('v-duration-btn-label').textContent = `${d}s`;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'quality') {
            dropdown.classList.add('max-w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Calidad</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';
            getQualitiesForModel(selectedModel).forEach(q => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100 capitalize">${q}</span>
                    ${selectedQuality === q ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedQuality = q;
                    document.getElementById('v-quality-btn-label').textContent = q;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'resolution') {
            dropdown.classList.add('max-w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Resolución</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';
            const resolutions = getCurrentResolutions(selectedModel);
            resolutions.forEach(r => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100">${r}</span>
                     ${selectedResolution === r ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedResolution = r;
                    document.getElementById('v-resolution-btn-label').textContent = r;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'mode') {
            dropdown.classList.add('max-w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Modo</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';
            getCurrentModes(selectedModel).forEach(m => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100 capitalize">${m}</span>
                    ${selectedMode === m ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedMode = m;
                    document.getElementById('v-mode-btn-label').textContent = m;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'effect') {
            dropdown.classList.add('max-w-[240px]');
            dropdown.classList.remove('max-w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Tipo de Efecto</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1 max-h-[50vh] overflow-y-auto custom-scrollbar';
            getEffectNamesForModel(selectedModel).forEach(e => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100">${e}</span>
                    ${selectedEffectName === e ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (ev) => {
                    ev.stopPropagation();
                    selectedEffectName = e;
                    document.getElementById('v-effect-btn-label').textContent = e;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);
        }

        const btnRect = anchorBtn.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (window.innerWidth < 768) {
            dropdown.style.left = '50%';
            dropdown.style.transform = 'translateX(-50%) translate(0, 8px)';
        } else {
            dropdown.style.left = `${btnRect.left - containerRect.left}px`;
            dropdown.style.transform = 'translate(0, 8px)';
        }
        dropdown.style.bottom = `${containerRect.bottom - btnRect.top + 8}px`;
    };

    const closeDropdown = () => {
        dropdown.classList.add('opacity-0', 'pointer-events-none');
        dropdown.classList.remove('opacity-100', 'pointer-events-auto');
        dropdownOpen = null;
    };

    const toggleDropdown = (type, btn) => (e) => {
        e.stopPropagation();
        if (dropdownOpen === type) closeDropdown();
        else { dropdownOpen = type; showDropdown(type, btn); }
    };

    modelBtn.onclick = toggleDropdown('model', modelBtn);
    arBtn.onclick = toggleDropdown('ar', arBtn);
    durationBtn.onclick = toggleDropdown('duration', durationBtn);
    resolutionBtn.onclick = toggleDropdown('resolution', resolutionBtn);
    qualityBtn.onclick = toggleDropdown('quality', qualityBtn);
    modeBtn.onclick = toggleDropdown('mode', modeBtn);
    effectNameBtn.onclick = toggleDropdown('effect', effectNameBtn);

    window.addEventListener('click', closeDropdown);
    container.appendChild(dropdown);

    // ==========================================
    // 4. CANVAS AREA + HISTORY
    // ==========================================
    const generationHistory = [];

    const historySidebar = document.createElement('div');
    historySidebar.className = 'fixed right-0 top-0 h-full w-20 md:w-24 bg-black/60 backdrop-blur-xl border-l border-white/5 z-50 flex flex-col items-center py-4 gap-3 overflow-y-auto transition-all duration-500 translate-x-full opacity-0';
    historySidebar.id = 'video-history-sidebar';

    const historyLabel = document.createElement('div');
    historyLabel.className = 'text-[9px] font-bold text-white/40 uppercase tracking-widest mb-2';
    historyLabel.textContent = 'Historial';
    historySidebar.appendChild(historyLabel);

    const historyList = document.createElement('div');
    historyList.className = 'flex flex-col gap-2 w-full px-2';
    historySidebar.appendChild(historyList);
    container.appendChild(historySidebar);

    const canvas = document.createElement('div');
    canvas.className = 'absolute inset-0 flex flex-col items-center justify-center p-4 min-[800px]:p-16 z-30 opacity-0 pointer-events-none transition-all duration-1000 translate-y-10 scale-95 bg-black/90 backdrop-blur-3xl';

    const videoContainer = document.createElement('div');
    videoContainer.className = 'relative group';

    const resultVideo = document.createElement('video');
    resultVideo.className = 'max-h-[60vh] max-w-[80vw] rounded-3xl shadow-3xl border border-white/10 interactive-glow object-contain';
    resultVideo.controls = true;
    resultVideo.loop = true;
    resultVideo.autoplay = true;
    resultVideo.muted = true;
    resultVideo.playsInline = true;
    videoContainer.appendChild(resultVideo);

    const canvasControls = document.createElement('div');
    canvasControls.className = 'mt-6 flex gap-3 opacity-0 transition-opacity delay-500 duration-500 justify-center';

    const regenerateBtn = document.createElement('button');
    regenerateBtn.className = 'bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white';
    regenerateBtn.textContent = '↻ Regenerar';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'bg-[#FFB000] text-black px-6 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(255,176,0,0.4)] active:scale-95';
    downloadBtn.textContent = '↓ Descargar';

    const extendBtn = document.createElement('button');
    extendBtn.className = 'hidden bg-[#3B82F6]/10 hover:bg-[#3B82F6]/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-[#3B82F6]/30 text-[#3B82F6] backdrop-blur-lg';
    extendBtn.textContent = '↗ Extender';
    extendBtn.title = 'Extender este vídeo';

    const newPromptBtn = document.createElement('button');
    newPromptBtn.className = 'bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white';
    newPromptBtn.textContent = '+ Nuevo';

    canvasControls.appendChild(regenerateBtn);
    canvasControls.appendChild(extendBtn);
    canvasControls.appendChild(downloadBtn);
    canvasControls.appendChild(newPromptBtn);

    canvas.appendChild(videoContainer);
    canvas.appendChild(canvasControls);
    container.appendChild(canvas);

    const showVideoInCanvas = (videoUrl, genModel) => {
        hero.classList.add('hidden');
        promptWrapper.classList.add('hidden');

        const isSeedance2 = genModel && (genModel === 'seedance-v2.0-t2v' || genModel === 'seedance-v2.0-i2v');
        extendBtn.classList.toggle('hidden', !isSeedance2);

        resultVideo.src = videoUrl;
        resultVideo.onloadeddata = () => {
            canvas.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10', 'scale-95');
            canvas.classList.add('opacity-100', 'translate-y-0', 'scale-100');
            canvasControls.classList.remove('opacity-0');
            canvasControls.classList.add('opacity-100');
        };
    };

    const addToHistory = (entry) => {
        generationHistory.unshift(entry);
        localStorage.setItem('video_history', JSON.stringify(generationHistory.slice(0, 30)));
        historySidebar.classList.remove('translate-x-full', 'opacity-0');
        historySidebar.classList.add('translate-x-0', 'opacity-100');
        renderHistory();
    };

    const renderHistory = () => {
        historyList.innerHTML = '';
        generationHistory.forEach((entry, idx) => {
            const thumb = document.createElement('div');
            thumb.className = `relative group/thumb cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-300 ${idx === 0 ? 'border-[#FFB000] shadow-[0_0_10px_rgba(255,176,0,0.4)]' : 'border-white/10 hover:border-white/30'}`;

            thumb.innerHTML = `
                <video src="${entry.url}" preload="metadata" muted class="w-full aspect-square object-cover"></video>
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <button class="hist-download p-1.5 bg-[#FFB000] rounded-lg text-black hover:scale-110 transition-transform" title="Descargar">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    </button>
                </div>
            `;

            thumb.onclick = (e) => {
                if (e.target.closest('.hist-download')) {
                    downloadFile(entry.url, `kreateia-video-${entry.id || idx}.mp4`);
                    return;
                }
                if (entry.model === 'seedance-v2.0-t2v' || entry.model === 'seedance-v2.0-i2v') {
                    lastGenerationId = entry.id;
                    lastGenerationModel = entry.model;
                } else {
                    lastGenerationId = null;
                    lastGenerationModel = null;
                }
                showVideoInCanvas(entry.url, entry.model);
                historyList.querySelectorAll('div').forEach(t => {
                    t.classList.remove('border-[#FFB000]', 'shadow-[0_0_10px_rgba(255,176,0,0.4)]');
                    t.classList.add('border-white/10');
                });
                thumb.classList.remove('border-white/10');
                thumb.classList.add('border-[#FFB000]', 'shadow-[0_0_10px_rgba(255,176,0,0.4)]');
            };

            historyList.appendChild(thumb);
        });
    };

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

    try {
        const saved = JSON.parse(localStorage.getItem('video_history') || '[]');
        if (saved.length > 0) {
            saved.forEach(e => generationHistory.push(e));
            historySidebar.classList.remove('translate-x-full', 'opacity-0');
            historySidebar.classList.add('translate-x-0', 'opacity-100');
            renderHistory();
        }
    } catch (e) { /* ignore */ }

    (async () => {
        const pending = getPendingJobs('video');
        if (!pending.length) return;

        const apiKey = localStorage.getItem('muapi_key');
        if (!apiKey) return;

        const banner = document.createElement('div');
        banner.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-[#111] border border-white/10 text-white text-sm px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3';
        banner.innerHTML = `<span class="animate-spin text-[#FFB000]">◌</span> <span class="banner-text">Reanudando ${pending.length} generación(es) de vídeo...</span>`;
        document.body.appendChild(banner);

        let remaining = pending.length;
        pending.forEach(async (job) => {
            const elapsedAttempts = Math.floor((Date.now() - job.submittedAt) / job.interval);
            const attemptsLeft = Math.max(1, job.maxAttempts - elapsedAttempts);
            try {
                const result = await muapi.pollForResult(job.requestId, apiKey, attemptsLeft, job.interval);
                const url = result.outputs?.[0] || result.url || result.output?.url;
                if (url) {
                    addToHistory({ id: job.requestId, url, ...job.historyMeta, timestamp: new Date().toISOString() });
                }
            } catch (e) {
                console.warn('[VideoStudio] Fallo en reanudación:', job.requestId, e.message);
            } finally {
                removePendingJob(job.requestId);
                remaining--;
                if (remaining === 0) banner.remove();
                else banner.querySelector('.banner-text').textContent = `Reanudando ${remaining} generación(es)...`;
            }
        });
    })();

    downloadBtn.onclick = () => {
        const current = resultVideo.src;
        if (current) {
            const entry = generationHistory.find(e => e.url === current);
            downloadFile(current, `kreateia-video-${entry?.id || 'clip'}.mp4`);
        }
    };

    regenerateBtn.onclick = () => generateBtn.click();

    const resetToPromptBar = () => {
        canvas.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10', 'scale-95');
        canvas.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
        canvasControls.classList.add('opacity-0');
        canvasControls.classList.remove('opacity-100');
        hero.classList.remove('hidden', 'opacity-0', 'scale-95', '-translate-y-10', 'pointer-events-none');
        promptWrapper.classList.remove('hidden', 'opacity-40');
    };

    newPromptBtn.onclick = () => {
        resetToPromptBar();
        textarea.value = '';
        picker.reset();
        uploadedImageUrl = null;
        imageMode = false;
        uploadedVideoUrl = null;
        v2vMode = false;
        showVideoIcon();
        selectedModel = t2vModels[0].id;
        selectedModelName = t2vModels[0].name;
        document.getElementById('v-model-btn-label').textContent = selectedModelName;
        updateControlsForModel(selectedModel);
        textarea.placeholder = 'Describe el vídeo que quieres crear';
        textarea.disabled = false;
        textarea.focus();
    };

    extendBtn.onclick = () => {
        if (!lastGenerationId) return;
        resetToPromptBar();
        textarea.value = '';
        picker.reset();
        uploadedImageUrl = null;
        imageMode = false;
        selectedModel = 'seedance-v2.0-extend';
        selectedModelName = 'Seedance 2.0 Extend';
        document.getElementById('v-model-btn-label').textContent = selectedModelName;
        updateControlsForModel(selectedModel);
        textarea.placeholder = 'Opcional: describe cómo continuar el vídeo...';
        textarea.focus();
    };

    // ==========================================
    // 5. GENERATION LOGIC
    // ==========================================
    generateBtn.onclick = async () => {
        const prompt = textarea.value.trim();
        const model = getCurrentModel();
        const isExtendMode = model?.requiresRequestId;

        if (v2vMode) {
            if (!uploadedVideoUrl) {
                alert('Por favor, sube un vídeo primero.');
                return;
            }
        } else if (isExtendMode) {
            if (!lastGenerationId) {
                alert('No se encontró vídeo para extender. Genera uno primero.');
                return;
            }
        } else if (imageMode) {
            if (!uploadedImageUrl) {
                alert('Por favor, sube una imagen inicial.');
                return;
            }
        } else {
            if (!prompt) {
                alert('Por favor, escribe un prompt para generar el vídeo.');
                return;
            }
        }

        const apiKey = localStorage.getItem('muapi_key');
        if (!apiKey) {
            AuthModal(() => generateBtn.click());
            return;
        }

        hero.classList.add('opacity-0', 'scale-95', '-translate-y-10', 'pointer-events-none');
        generateBtn.disabled = true;
        generateBtn.innerHTML = `<span class="animate-spin inline-block mr-2 text-black">◌</span> Generando...`;

        let hadError = false;
        let capturedRequestId = null;
        const historyMeta = { prompt, model: selectedModel, aspect_ratio: selectedAr, duration: selectedDuration };

        const onRequestId = (rid) => {
            capturedRequestId = rid;
            savePendingJob({ requestId: rid, studioType: 'video', historyMeta, maxAttempts: 900, interval: 2000, submittedAt: Date.now() });
        };

        try {
            if (v2vMode) {
                const res = await muapi.processV2V({ model: selectedModel, video_url: uploadedVideoUrl, onRequestId });
                if (res && res.url) {
                    if (capturedRequestId) removePendingJob(capturedRequestId);
                    const genId = res.id || capturedRequestId || Date.now().toString();
                    lastGenerationId = null;
                    lastGenerationModel = null;
                    addToHistory({ id: genId, url: res.url, prompt: '', model: selectedModel, timestamp: new Date().toISOString() });
                    showVideoInCanvas(res.url, selectedModel);
                } else {
                    throw new Error('Sin URL de vídeo');
                }
                generateBtn.disabled = false;
                generateBtn.innerHTML = `Generar ✨`;
                return;
            }

            if (imageMode) {
                const i2vParams = {
                    model: selectedModel,
                    image_url: uploadedImageUrl,
                    onRequestId,
                };
                i2vParams.prompt = prompt || '';
                i2vParams.aspect_ratio = selectedAr;
                const durations = getCurrentDurations(selectedModel);
                if (durations.length > 0) i2vParams.duration = selectedDuration;
                const resolutions = getCurrentResolutions(selectedModel);
                if (resolutions.length > 0) i2vParams.resolution = selectedResolution;
                if (selectedQuality) i2vParams.quality = selectedQuality;
                if (selectedMode) i2vParams.mode = selectedMode;
                if (selectedEffectName) i2vParams.name = selectedEffectName;

                const res = await muapi.generateI2V(i2vParams);

                if (res && res.url) {
                    if (capturedRequestId) removePendingJob(capturedRequestId);
                    const genId = res.id || capturedRequestId || Date.now().toString();
                    if (selectedModel === 'seedance-v2.0-i2v') {
                        lastGenerationId = genId;
                        lastGenerationModel = selectedModel;
                    } else {
                        lastGenerationId = null;
                        lastGenerationModel = null;
                    }
                    addToHistory({ id: genId, url: res.url, prompt, model: selectedModel, aspect_ratio: selectedAr, duration: selectedDuration, timestamp: new Date().toISOString() });
                    showVideoInCanvas(res.url, selectedModel);
                } else {
                    throw new Error('Sin URL de vídeo');
                }
                generateBtn.disabled = false;
                generateBtn.innerHTML = `Generar ✨`;
                return;
            }

            const params = { model: selectedModel, onRequestId };

            if (prompt) params.prompt = prompt;

            if (isExtendMode) {
                params.request_id = lastGenerationId;
            } else {
                params.aspect_ratio = selectedAr;
            }

            const durations = getCurrentDurations(selectedModel);
            if (durations.length > 0) params.duration = selectedDuration;

            const resolutions = getCurrentResolutions(selectedModel);
            if (resolutions.length > 0) params.resolution = selectedResolution;

            if (selectedQuality) params.quality = selectedQuality;
            if (selectedMode) params.mode = selectedMode;

            const res = await muapi.generateVideo(params);

            if (res && res.url) {
                if (capturedRequestId) removePendingJob(capturedRequestId);
                const genId = res.id || capturedRequestId || Date.now().toString();
                if (selectedModel === 'seedance-v2.0-t2v' || selectedModel === 'seedance-v2.0-i2v') {
                    lastGenerationId = genId;
                    lastGenerationModel = selectedModel;
                } else {
                    lastGenerationId = null;
                    lastGenerationModel = null;
                }

                addToHistory({
                    id: genId,
                    url: res.url,
                    prompt,
                    model: selectedModel,
                    aspect_ratio: selectedAr,
                    duration: selectedDuration,
                    timestamp: new Date().toISOString()
                });
                showVideoInCanvas(res.url, selectedModel);
            } else {
                throw new Error('Sin URL de vídeo');
            }
        } catch (e) {
            hadError = true;
            if (capturedRequestId) removePendingJob(capturedRequestId);
            console.error(e);
            hero.classList.remove('opacity-0', 'scale-95', '-translate-y-10', 'pointer-events-none');
            generateBtn.innerHTML = `Error: ${e.message.slice(0, 60)}`;
            setTimeout(() => {
                generateBtn.innerHTML = `Generar ✨`;
            }, 4000);
        } finally {
            generateBtn.disabled = false;
            if (!hadError) generateBtn.innerHTML = `Generar ✨`;
        }
    };

    return container;
}
