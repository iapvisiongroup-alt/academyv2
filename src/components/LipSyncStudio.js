import { muapi } from '../lib/muapi.js';
import { lipsyncModels, imageLipSyncModels, videoLipSyncModels, getLipSyncModelById, getResolutionsForLipSyncModel } from '../lib/models.js';
import { AuthModal } from './AuthModal.js';
import { createUploadPicker } from './UploadPicker.js';
import { savePendingJob, removePendingJob, getPendingJobs } from '../lib/pendingJobs.js';

export function LipSyncStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center justify-center bg-[#050505] relative p-4 md:p-6 overflow-y-auto custom-scrollbar overflow-x-hidden';

    // --- State ---
    let inputMode = 'image';
    let selectedModel = imageLipSyncModels[0].id;
    let selectedResolution = imageLipSyncModels[0].inputs?.resolution?.default || '480p';
    let uploadedImageUrl = null;
    let uploadedVideoUrl = null;
    let uploadedAudioUrl = null;
    let dropdownOpen = null;

    const getCurrentModels = () => inputMode === 'image' ? imageLipSyncModels : videoLipSyncModels;
    const getCurrentModel = () => lipsyncModels.find(m => m.id === selectedModel);

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
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
                <div class="w-16 h-16 bg-[#FFB000]/10 rounded-2xl flex items-center justify-center border border-[#FFB000]/20 shadow-glow relative z-10">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[#FFB000]">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                        <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                </div>
                <div class="absolute top-4 right-4 text-[#3B82F6] animate-pulse">🎙</div>
            </div>
        </div>
        <h1 class="text-2xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-4 selection:bg-[#FFB000] selection:text-black text-center px-4">Lip Sync</h1>
        <p class="text-white/50 text-sm font-medium tracking-wide opacity-60">Anima retratos o sincroniza labios con audio mediante IA</p>
    `;
    container.appendChild(hero);

    // ==========================================
    // 2. INPUT BAR
    // ==========================================
    const promptWrapper = document.createElement('div');
    promptWrapper.className = 'w-full max-w-4xl relative z-40 animate-fade-in-up';
    promptWrapper.style.animationDelay = '0.2s';

    const bar = document.createElement('div');
    bar.className = 'w-full bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] p-3 md:p-5 flex flex-col gap-3 md:gap-5 shadow-3xl';

    // --- Mode Toggle (Image vs Video) ---
    const modeToggleRow = document.createElement('div');
    modeToggleRow.className = 'flex items-center gap-2 px-2';

    const modeLabel = document.createElement('span');
    modeLabel.className = 'text-xs text-white/40 font-bold uppercase tracking-widest mr-2';
    modeLabel.textContent = 'Entrada:';

    const imageModeBtn = document.createElement('button');
    imageModeBtn.type = 'button';
    imageModeBtn.className = 'px-4 py-1.5 rounded-xl text-xs font-bold transition-all border border-[#FFB000] bg-[#FFB000]/10 text-[#FFB000]';
    imageModeBtn.textContent = '🖼 Imagen (Retrato)';

    const videoModeBtn = document.createElement('button');
    videoModeBtn.type = 'button';
    videoModeBtn.className = 'px-4 py-1.5 rounded-xl text-xs font-bold transition-all border border-white/10 text-white/50 hover:border-white/30 hover:text-white';
    videoModeBtn.textContent = '🎬 Vídeo';

    modeToggleRow.appendChild(modeLabel);
    modeToggleRow.appendChild(imageModeBtn);
    modeToggleRow.appendChild(videoModeBtn);
    bar.appendChild(modeToggleRow);

    // --- Uploads Row ---
    const uploadsRow = document.createElement('div');
    uploadsRow.className = 'flex items-start gap-3 px-2';

    const imagePicker = createUploadPicker({
        anchorContainer: container,
        onSelect: ({ url }) => {
            uploadedImageUrl = url;
            imageStatusLabel.textContent = '✓ Imagen lista';
            imageStatusLabel.className = 'text-[#FFB000]';
        },
        onClear: () => {
            uploadedImageUrl = null;
            imageStatusLabel.textContent = 'Sin imagen';
            imageStatusLabel.className = 'text-white/40';
        }
    });
    imagePicker.trigger.className = imagePicker.trigger.className
        .replace('w-10 h-10', 'w-14 h-14')
        .replace('mt-1.5', '');
    container.appendChild(imagePicker.panel);

    const videoFileInput = document.createElement('input');
    videoFileInput.type = 'file';
    videoFileInput.accept = 'video/*';
    videoFileInput.className = 'hidden';

    const videoPickerBtn = document.createElement('button');
    videoPickerBtn.type = 'button';
    videoPickerBtn.title = 'Subir vídeo original';
    videoPickerBtn.className = 'flex-shrink-0 w-14 h-14 rounded-xl border transition-all flex items-center justify-center relative overflow-hidden hidden bg-white/5 border-white/10 hover:bg-white/10 hover:border-[#FFB000]/40 group';

    const videoIconEl = document.createElement('div');
    videoIconEl.className = 'flex flex-col items-center justify-center gap-1 w-full h-full';
    videoIconEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40 group-hover:text-[#FFB000] transition-colors"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg><span class="text-[9px] text-white/40 group-hover:text-[#FFB000] font-bold">VÍDEO</span>`;

    const videoSpinnerEl = document.createElement('div');
    videoSpinnerEl.className = 'hidden items-center justify-center w-full h-full';
    videoSpinnerEl.innerHTML = `<span class="animate-spin text-[#FFB000] text-sm">◌</span>`;

    const videoReadyEl = document.createElement('div');
    videoReadyEl.className = 'hidden flex-col items-center justify-center gap-1 w-full h-full absolute inset-0 bg-[#FFB000]/10';
    videoReadyEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[#FFB000]"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg><span class="text-[9px] text-[#FFB000] font-bold">LISTO</span>`;

    videoPickerBtn.appendChild(videoFileInput);
    videoPickerBtn.appendChild(videoIconEl);
    videoPickerBtn.appendChild(videoSpinnerEl);
    videoPickerBtn.appendChild(videoReadyEl);

    const showVideoIcon = () => {
        videoIconEl.classList.replace('hidden', 'flex');
        videoSpinnerEl.classList.add('hidden'); videoSpinnerEl.classList.remove('flex');
        videoReadyEl.classList.add('hidden'); videoReadyEl.classList.remove('flex');
        videoPickerBtn.classList.remove('border-[#FFB000]/60'); videoPickerBtn.classList.add('border-white/10');
        videoPickerBtn.title = 'Subir vídeo original';
        mediaStatusLabel.textContent = 'Sin vídeo'; mediaStatusLabel.className = 'text-white/40';
    };
    const showVideoSpinner = () => {
        videoIconEl.classList.add('hidden'); videoIconEl.classList.remove('flex');
        videoSpinnerEl.classList.replace('hidden', 'flex');
        videoReadyEl.classList.add('hidden'); videoReadyEl.classList.remove('flex');
    };
    const showVideoReady = (name) => {
        videoIconEl.classList.add('hidden'); videoIconEl.classList.remove('flex');
        videoSpinnerEl.classList.add('hidden'); videoSpinnerEl.classList.remove('flex');
        videoReadyEl.classList.replace('hidden', 'flex');
        videoPickerBtn.classList.remove('border-white/10'); videoPickerBtn.classList.add('border-[#FFB000]/60');
        videoPickerBtn.title = `${name} — haz clic para borrar`;
        mediaStatusLabel.textContent = `✓ ${name}`; mediaStatusLabel.className = 'text-[#FFB000]';
    };

    videoPickerBtn.onclick = (e) => {
        e.stopPropagation();
        if (uploadedVideoUrl) { uploadedVideoUrl = null; showVideoIcon(); return; }
        videoFileInput.click();
    };
    videoFileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const apiKey = localStorage.getItem('muapi_key');
        if (!apiKey) { AuthModal(() => videoFileInput.click()); return; }
        showVideoSpinner();
        try {
            uploadedVideoUrl = await muapi.uploadFile(file);
            showVideoReady(file.name);
        } catch (err) { showVideoIcon(); alert(`Fallo al subir vídeo: ${err.message}`); }
        videoFileInput.value = '';
    };

    const audioFileInput = document.createElement('input');
    audioFileInput.type = 'file';
    audioFileInput.accept = 'audio/*';
    audioFileInput.className = 'hidden';

    const audioPickerBtn = document.createElement('button');
    audioPickerBtn.type = 'button';
    audioPickerBtn.title = 'Subir archivo de audio';
    audioPickerBtn.className = 'flex-shrink-0 w-14 h-14 rounded-xl border transition-all flex items-center justify-center relative overflow-hidden bg-white/5 border-white/10 hover:bg-white/10 hover:border-[#FFB000]/40 group';

    const audioIconEl = document.createElement('div');
    audioIconEl.className = 'flex flex-col items-center justify-center gap-1 w-full h-full';
    audioIconEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40 group-hover:text-[#FFB000] transition-colors"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg><span class="text-[9px] text-white/40 group-hover:text-[#FFB000] font-bold">AUDIO</span>`;

    const audioSpinnerEl = document.createElement('div');
    audioSpinnerEl.className = 'hidden items-center justify-center w-full h-full';
    audioSpinnerEl.innerHTML = `<span class="animate-spin text-[#FFB000] text-sm">◌</span>`;

    const audioReadyEl = document.createElement('div');
    audioReadyEl.className = 'hidden flex-col items-center justify-center gap-1 w-full h-full absolute inset-0 bg-[#FFB000]/10';
    audioReadyEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[#FFB000]"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg><span class="text-[9px] text-[#FFB000] font-bold">LISTO</span>`;

    audioPickerBtn.appendChild(audioFileInput);
    audioPickerBtn.appendChild(audioIconEl);
    audioPickerBtn.appendChild(audioSpinnerEl);
    audioPickerBtn.appendChild(audioReadyEl);

    const showAudioIcon = () => {
        audioIconEl.classList.replace('hidden', 'flex');
        audioSpinnerEl.classList.add('hidden'); audioSpinnerEl.classList.remove('flex');
        audioReadyEl.classList.add('hidden'); audioReadyEl.classList.remove('flex');
        audioPickerBtn.classList.remove('border-[#FFB000]/60'); audioPickerBtn.classList.add('border-white/10');
        audioPickerBtn.title = 'Subir archivo de audio';
        audioStatusLabel.textContent = 'Sin audio'; audioStatusLabel.className = 'text-white/40';
    };
    const showAudioSpinner = () => {
        audioIconEl.classList.add('hidden'); audioIconEl.classList.remove('flex');
        audioSpinnerEl.classList.replace('hidden', 'flex');
        audioReadyEl.classList.add('hidden'); audioReadyEl.classList.remove('flex');
    };
    const showAudioReady = (name) => {
        audioIconEl.classList.add('hidden'); audioIconEl.classList.remove('flex');
        audioSpinnerEl.classList.add('hidden'); audioSpinnerEl.classList.remove('flex');
        audioReadyEl.classList.replace('hidden', 'flex');
        audioPickerBtn.classList.remove('border-white/10'); audioPickerBtn.classList.add('border-[#FFB000]/60');
        audioPickerBtn.title = `${name} — haz clic para borrar`;
        audioStatusLabel.textContent = `✓ ${name}`; audioStatusLabel.className = 'text-[#FFB000]';
    };

    audioPickerBtn.onclick = (e) => {
        e.stopPropagation();
        if (uploadedAudioUrl) { uploadedAudioUrl = null; showAudioIcon(); return; }
        audioFileInput.click();
    };
    audioFileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const apiKey = localStorage.getItem('muapi_key');
        if (!apiKey) { AuthModal(() => audioFileInput.click()); return; }
        showAudioSpinner();
        try {
            uploadedAudioUrl = await muapi.uploadFile(file);
            showAudioReady(file.name);
        } catch (err) { showAudioIcon(); alert(`Fallo al subir audio: ${err.message}`); }
        audioFileInput.value = '';
    };

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Opcional: describe el estilo de habla o movimiento...';
    textarea.className = 'flex-1 bg-transparent text-white placeholder-white/30 text-sm resize-none outline-none min-h-[56px] leading-relaxed pt-1 custom-scrollbar';
    textarea.rows = 2;

    uploadsRow.appendChild(imagePicker.trigger);
    uploadsRow.appendChild(videoPickerBtn);
    uploadsRow.appendChild(audioPickerBtn);
    uploadsRow.appendChild(textarea);
    bar.appendChild(uploadsRow);

    // ── Status labels ──
    const statusRow = document.createElement('div');
    statusRow.className = 'flex items-center gap-3 px-2 text-xs text-white/40';

    const mediaStatusLabel = document.createElement('span');
    mediaStatusLabel.className = 'text-white/40';
    mediaStatusLabel.textContent = 'Sin imagen';
    const imageStatusLabel = mediaStatusLabel; 

    const audioStatusLabel = document.createElement('span');
    audioStatusLabel.className = 'text-white/40';
    audioStatusLabel.textContent = 'Sin audio';

    statusRow.appendChild(mediaStatusLabel);
    statusRow.appendChild(document.createTextNode(' · '));
    statusRow.appendChild(audioStatusLabel);
    bar.appendChild(statusRow);

    // ── Bottom Controls Row ──
    const bottomRow = document.createElement('div');
    bottomRow.className = 'flex items-center gap-2 md:gap-3 flex-wrap px-2';

    const modelBtn = document.createElement('button');
    modelBtn.id = 'ls-model-btn';
    modelBtn.type = 'button';
    modelBtn.className = 'flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#FFB000]/40 transition-all text-xs font-bold text-white group';
    modelBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[#FFB000]"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg><span id="ls-model-btn-label">${getCurrentModels()[0].name}</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-white/40 group-hover:text-white transition-colors"><polyline points="6 9 12 15 18 9"/></svg>`;

    const resolutionBtn = document.createElement('button');
    resolutionBtn.id = 'ls-resolution-btn';
    resolutionBtn.type = 'button';
    resolutionBtn.className = 'flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#FFB000]/40 transition-all text-xs font-bold text-white group';
    resolutionBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[#FFB000]"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span id="ls-resolution-btn-label">${selectedResolution}</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-white/40 group-hover:text-white transition-colors"><polyline points="6 9 12 15 18 9"/></svg>`;

    const generateBtn = document.createElement('button');
    generateBtn.id = 'ls-generate-btn';
    generateBtn.type = 'button';
    generateBtn.className = 'ml-auto px-6 py-2.5 bg-[#FFB000] text-black font-black text-sm rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(255,176,0,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100';
    generateBtn.textContent = 'Generar ✨';

    bottomRow.appendChild(modelBtn);
    bottomRow.appendChild(resolutionBtn);
    bottomRow.appendChild(generateBtn);
    bar.appendChild(bottomRow);

    promptWrapper.appendChild(bar);
    container.appendChild(promptWrapper);

    // ==========================================
    // 3. DROPDOWN SYSTEM
    // ==========================================
    const dropdown = document.createElement('div');
    dropdown.className = 'hidden fixed z-[100] bg-[#111]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-3xl p-2 min-w-[200px] max-h-[400px] overflow-y-auto custom-scrollbar';
    dropdown.id = 'ls-dropdown';

    const closeDropdown = (e) => {
        if (!e || (!dropdown.contains(e.target) && !e.target.closest('[id^="ls-"]'))) {
            dropdown.classList.add('hidden');
            dropdownOpen = null;
        }
    };

    const populateDropdown = (type) => {
        dropdown.innerHTML = '';
        if (type === 'model') {
            const models = getCurrentModels();
            models.forEach(m => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = `w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all hover:bg-white/10 ${m.id === selectedModel ? 'text-[#FFB000] font-bold bg-[#FFB000]/5' : 'text-white font-medium'}`;
                item.innerHTML = `<div>${m.name}</div><div class="text-xs text-white/40 mt-0.5">${m.description?.slice(0, 60)}...</div>`;
                item.onclick = () => {
                    selectedModel = m.id;
                    document.getElementById('ls-model-btn-label').textContent = m.name;
                    const resolutions = getResolutionsForLipSyncModel(selectedModel);
                    if (resolutions.length > 0) {
                        selectedResolution = m.inputs?.resolution?.default || resolutions[0];
                        document.getElementById('ls-resolution-btn-label').textContent = selectedResolution;
                        resolutionBtn.classList.remove('hidden');
                    } else {
                        resolutionBtn.classList.add('hidden');
                    }
                    textarea.style.display = m.hasPrompt ? '' : 'none';
                    closeDropdown();
                };
                dropdown.appendChild(item);
            });
        } else if (type === 'resolution') {
            const resolutions = getResolutionsForLipSyncModel(selectedModel);
            resolutions.forEach(r => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = `w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all hover:bg-white/10 ${r === selectedResolution ? 'text-[#FFB000] font-bold bg-[#FFB000]/5' : 'text-white font-medium'}`;
                item.textContent = r;
                item.onclick = () => {
                    selectedResolution = r;
                    document.getElementById('ls-resolution-btn-label').textContent = r;
                    closeDropdown();
                };
                dropdown.appendChild(item);
            });
        }
    };

    const openDropdown = (type, anchorBtn) => {
        dropdownOpen = type;
        populateDropdown(type);
        dropdown.style.top = '-9999px';
        dropdown.style.bottom = 'auto';
        dropdown.classList.remove('hidden');

        const ddHeight = dropdown.offsetHeight;
        const rect = anchorBtn.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - 8;
        const spaceAbove = rect.top - 8;

        if (spaceBelow >= ddHeight || spaceBelow >= spaceAbove) {
            dropdown.style.top = `${rect.bottom + 8}px`;
            dropdown.style.bottom = 'auto';
            dropdown.style.maxHeight = `${Math.max(150, spaceBelow - 8)}px`;
        } else {
            dropdown.style.top = 'auto';
            dropdown.style.bottom = `${window.innerHeight - rect.top + 8}px`;
            dropdown.style.maxHeight = `${Math.max(150, spaceAbove - 8)}px`;
        }
        dropdown.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
    };

    modelBtn.onclick = (e) => { e.stopPropagation(); if (dropdownOpen === 'model') { closeDropdown(); } else { openDropdown('model', modelBtn); } };
    resolutionBtn.onclick = (e) => { e.stopPropagation(); if (dropdownOpen === 'resolution') { closeDropdown(); } else { openDropdown('resolution', resolutionBtn); } };
    window.addEventListener('click', closeDropdown);
    container.appendChild(dropdown);

    // ==========================================
    // 4. MODE SWITCHING LOGIC
    // ==========================================
    const updateUIForMode = () => {
        if (inputMode === 'image') {
            imageModeBtn.className = 'px-4 py-1.5 rounded-xl text-xs font-bold transition-all border border-[#FFB000] bg-[#FFB000]/10 text-[#FFB000]';
            videoModeBtn.className = 'px-4 py-1.5 rounded-xl text-xs font-bold transition-all border border-white/10 text-white/50 hover:border-white/30 hover:text-white';
            imagePicker.trigger.classList.remove('hidden');
            videoPickerBtn.classList.add('hidden');
            mediaStatusLabel.textContent = uploadedImageUrl ? '✓ Imagen lista' : 'Sin imagen';
            mediaStatusLabel.className = uploadedImageUrl ? 'text-[#FFB000]' : 'text-white/40';
        } else {
            videoModeBtn.className = 'px-4 py-1.5 rounded-xl text-xs font-bold transition-all border border-[#FFB000] bg-[#FFB000]/10 text-[#FFB000]';
            imageModeBtn.className = 'px-4 py-1.5 rounded-xl text-xs font-bold transition-all border border-white/10 text-white/50 hover:border-white/30 hover:text-white';
            videoPickerBtn.classList.remove('hidden');
            imagePicker.trigger.classList.add('hidden');
            mediaStatusLabel.textContent = uploadedVideoUrl ? '✓ Vídeo listo' : 'Sin vídeo';
            mediaStatusLabel.className = uploadedVideoUrl ? 'text-[#FFB000]' : 'text-white/40';
        }

        const models = getCurrentModels();
        selectedModel = models[0].id;
        document.getElementById('ls-model-btn-label').textContent = models[0].name;

        const resolutions = getResolutionsForLipSyncModel(selectedModel);
        if (resolutions.length > 0) {
            selectedResolution = models[0].inputs?.resolution?.default || resolutions[0];
            document.getElementById('ls-resolution-btn-label').textContent = selectedResolution;
            resolutionBtn.classList.remove('hidden');
        } else {
            resolutionBtn.classList.add('hidden');
        }

        textarea.style.display = models[0].hasPrompt ? '' : 'none';
    };

    imageModeBtn.onclick = () => {
        if (inputMode === 'image') return;
        inputMode = 'image';
        uploadedVideoUrl = null;
        showVideoIcon();
        updateUIForMode();
    };

    videoModeBtn.onclick = () => {
        if (inputMode === 'video') return;
        inputMode = 'video';
        uploadedImageUrl = null;
        imagePicker.reset();
        updateUIForMode();
    };

    if (getResolutionsForLipSyncModel(selectedModel).length === 0) {
        resolutionBtn.classList.add('hidden');
    }

    // ==========================================
    // 6. CANVAS AREA + HISTORY
    // ==========================================
    const generationHistory = [];

    const historySidebar = document.createElement('div');
    historySidebar.className = 'fixed right-0 top-0 h-full w-20 md:w-24 bg-black/60 backdrop-blur-xl border-l border-white/5 z-50 flex flex-col items-center py-4 gap-3 overflow-y-auto transition-all duration-500 translate-x-full opacity-0';
    historySidebar.id = 'lipsync-history-sidebar';

    const historyLabel = document.createElement('div');
    historyLabel.className = 'text-[9px] font-bold text-white/40 uppercase tracking-widest mb-2';
    historyLabel.textContent = 'Historial';
    historySidebar.appendChild(historyLabel);

    const historyList = document.createElement('div');
    historyList.className = 'flex flex-col gap-2 w-full px-2';
    historySidebar.appendChild(historyList);
    container.appendChild(historySidebar);

    const canvas = document.createElement('div');
    canvas.className = 'absolute inset-0 flex flex-col items-center justify-center p-4 min-[800px]:p-16 z-10 opacity-0 pointer-events-none transition-all duration-1000 translate-y-10 scale-95 bg-black/90 backdrop-blur-3xl';

    const videoContainer = document.createElement('div');
    videoContainer.className = 'relative group';

    const resultVideo = document.createElement('video');
    resultVideo.className = 'max-h-[60vh] max-w-[80vw] rounded-3xl shadow-3xl border border-white/10 interactive-glow object-contain';
    resultVideo.controls = true;
    resultVideo.loop = true;
    resultVideo.autoplay = true;
    resultVideo.muted = false;
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

    const newBtn = document.createElement('button');
    newBtn.className = 'bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white';
    newBtn.textContent = '+ Nuevo';

    canvasControls.appendChild(regenerateBtn);
    canvasControls.appendChild(downloadBtn);
    canvasControls.appendChild(newBtn);
    canvas.appendChild(videoContainer);
    canvas.appendChild(canvasControls);
    container.appendChild(canvas);

    const showVideoInCanvas = (videoUrl) => {
        hero.classList.add('hidden');
        promptWrapper.classList.add('hidden');
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
        localStorage.setItem('lipsync_history', JSON.stringify(generationHistory.slice(0, 30)));
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
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                    <button class="hist-download p-1.5 bg-[#FFB000] rounded-lg text-black hover:scale-110 transition-transform" title="Descargar">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    </button>
                </div>
            `;
            thumb.onclick = (e) => {
                if (e.target.closest('.hist-download')) { downloadFile(entry.url, `kreateia-lipsync-${entry.id || idx}.mp4`); return; }
                showVideoInCanvas(entry.url);
                historyList.querySelectorAll('div').forEach(t => { t.classList.remove('border-[#FFB000]', 'shadow-[0_0_10px_rgba(255,176,0,0.4)]'); t.classList.add('border-white/10'); });
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
            a.href = blobUrl; a.download = filename;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch { window.open(url, '_blank'); }
    };

    try {
        const saved = JSON.parse(localStorage.getItem('lipsync_history') || '[]');
        if (saved.length > 0) {
            saved.forEach(e => generationHistory.push(e));
            historySidebar.classList.remove('translate-x-full', 'opacity-0');
            historySidebar.classList.add('translate-x-0', 'opacity-100');
            renderHistory();
        }
    } catch { /* ignore */ }

    (async () => {
        const pending = getPendingJobs('lipsync');
        if (!pending.length) return;
        const apiKey = localStorage.getItem('muapi_key');
        if (!apiKey) return;
        const banner = document.createElement('div');
        banner.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-[#111] border border-white/10 text-white text-sm px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3';
        banner.innerHTML = `<span class="animate-spin text-[#FFB000]">◌</span> <span class="banner-text">Reanudando ${pending.length} generación(es) pendiente(s)...</span>`;
        document.body.appendChild(banner);
        let remaining = pending.length;
        pending.forEach(async (job) => {
            const elapsedAttempts = Math.floor((Date.now() - job.submittedAt) / job.interval);
            const attemptsLeft = Math.max(1, job.maxAttempts - elapsedAttempts);
            try {
                const result = await muapi.pollForResult(job.requestId, apiKey, attemptsLeft, job.interval);
                const url = result.outputs?.[0] || result.url || result.output?.url;
                if (url) addToHistory({ id: job.requestId, url, ...job.historyMeta, timestamp: new Date().toISOString() });
            } catch (e) { console.warn('[LipSyncStudio] Fallo en tarea pendiente:', job.requestId, e.message); }
            finally {
                removePendingJob(job.requestId);
                remaining--;
                if (remaining === 0) banner.remove();
                else banner.querySelector('.banner-text').textContent = `Reanudando ${remaining} generación(es)...`;
            }
        });
    })();

    // ==========================================
    // 7. CANVAS BUTTON HANDLERS
    // ==========================================
    downloadBtn.onclick = () => {
        const current = resultVideo.src;
        if (current) {
            const entry = generationHistory.find(e => e.url === current);
            downloadFile(current, `kreateia-lipsync-${entry?.id || 'clip'}.mp4`);
        }
    };

    regenerateBtn.onclick = () => generateBtn.click();

    newBtn.onclick = () => {
        canvas.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10', 'scale-95');
        canvas.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
        canvasControls.classList.add('opacity-0');
        canvasControls.classList.remove('opacity-100');
        hero.classList.remove('hidden', 'opacity-0', 'scale-95', '-translate-y-10', 'pointer-events-none');
        promptWrapper.classList.remove('hidden', 'opacity-40');
        textarea.value = '';
        imagePicker.reset();
        uploadedImageUrl = null;
        uploadedVideoUrl = null;
        uploadedAudioUrl = null;
        showVideoIcon();
        showAudioIcon();
        mediaStatusLabel.textContent = inputMode === 'image' ? 'Sin imagen' : 'Sin vídeo';
        mediaStatusLabel.className = 'text-white/40';
        audioStatusLabel.textContent = 'Sin audio';
        audioStatusLabel.className = 'text-white/40';
        textarea.focus();
    };

    // ==========================================
    // 8. GENERATION LOGIC
    // ==========================================
    generateBtn.onclick = async () => {
        const model = getCurrentModel();
        const prompt = textarea.value.trim();

        if (!uploadedAudioUrl) {
            alert('Por favor, sube un archivo de audio primero.');
            return;
        }
        if (inputMode === 'image' && !uploadedImageUrl) {
            alert('Por favor, sube una imagen (retrato) primero.');
            return;
        }
        if (inputMode === 'video' && !uploadedVideoUrl) {
            alert('Por favor, sube un vídeo original primero.');
            return;
        }

        const apiKey = localStorage.getItem('muapi_key');
        if (!apiKey) { AuthModal(() => generateBtn.click()); return; }

        hero.classList.add('opacity-0', 'scale-95', '-translate-y-10', 'pointer-events-none');
        generateBtn.disabled = true;
        generateBtn.innerHTML = `<span class="animate-spin inline-block mr-2 text-black">◌</span> Generando...`;

        let hadError = false;
        let capturedRequestId = null;
        const historyMeta = { prompt, model: selectedModel };

        const onRequestId = (rid) => {
            capturedRequestId = rid;
            savePendingJob({ requestId: rid, studioType: 'lipsync', historyMeta, maxAttempts: 900, interval: 2000, submittedAt: Date.now() });
        };

        try {
            const lipsyncParams = {
                model: selectedModel,
                audio_url: uploadedAudioUrl,
                onRequestId
            };

            if (inputMode === 'image') {
                lipsyncParams.image_url = uploadedImageUrl;
            } else {
                lipsyncParams.video_url = uploadedVideoUrl;
            }

            if (prompt && model?.hasPrompt) lipsyncParams.prompt = prompt;

            const resolutions = getResolutionsForLipSyncModel(selectedModel);
            if (resolutions.length > 0) lipsyncParams.resolution = selectedResolution;

            if (model?.hasSeed) lipsyncParams.seed = -1;

            const res = await muapi.processLipSync(lipsyncParams);

            if (res && res.url) {
                if (capturedRequestId) removePendingJob(capturedRequestId);
                const genId = res.id || capturedRequestId || Date.now().toString();
                addToHistory({ id: genId, url: res.url, prompt, model: selectedModel, timestamp: new Date().toISOString() });
                showVideoInCanvas(res.url);
            } else {
                throw new Error('Sin URL de vídeo');
            }
        } catch (e) {
            hadError = true;
            if (capturedRequestId) removePendingJob(capturedRequestId);
            console.error(e);
            hero.classList.remove('opacity-0', 'scale-95', '-translate-y-10', 'pointer-events-none');
            generateBtn.innerHTML = `Error: ${e.message.slice(0, 60)}`;
            setTimeout(() => { generateBtn.innerHTML = `Generar ✨`; }, 4000);
        } finally {
            generateBtn.disabled = false;
            if (!hadError) generateBtn.innerHTML = `Generar ✨`;
        }
    };

    return container;
}
