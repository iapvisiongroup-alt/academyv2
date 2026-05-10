import { muapi } from '../lib/muapi.js';
import { AuthModal } from './AuthModal.js';
import { createUploadPicker } from './UploadPicker.js';
import { auth, db, APP_ID } from '../lib/firebase.js';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ===============================
// MODELOS MARCA BLANCA KREATEIA
// ===============================

const V_MODELS = [
    { uiId: 'kreate-2', name: 'KreateVideo 2' },
    { uiId: 'kreate-2-extend', name: 'KreateVideo 2 Extend' },
    { uiId: 'veo-fast', name: 'KreateVideo Fast' },
    { uiId: 'kling-mc', name: 'KreateMotion Control' }
];

// ===============================
// TRADUCTOR UI -> MUAPI MODEL ID
// ===============================

const getApiId = (uiId, mode) => {
    if (uiId === 'kreate-2-extend') return 'sd-2-extend';
    if (uiId === 'veo-fast') return 'veo-3.1-fast';
    if (uiId === 'kling-mc') return 'kling-3.0-std';

    if (uiId === 'kreate-2') {
        if (mode === 'i2v') return 'sd-2-i2v-480p';
        if (mode === 'v2v') return 'sd-2-omni-reference-no-video-fast';
        return 'sd-2-text-to-video-fast';
    }

    return 'sd-2-text-to-video-fast';
};

// ===============================
// COSTES EN CRÉDITOS (x2)
// ===============================

const getVideoCost = (apiId, duration, quality) => {
    const seconds = parseInt(duration) || 5;
    const q = quality || 'basic';
    let costPerSecond = 2.0; // Default

    if (apiId.includes('veo')) costPerSecond = 2.5;
    if (apiId.includes('kling')) costPerSecond = 3.0;

    return Math.ceil((seconds * costPerSecond) * 2); 
};

// ===============================
// COMPONENTE PRINCIPAL
// ===============================

export function VideoStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center bg-[#050505] relative p-2 md:p-6 pb-24 overflow-y-auto custom-scrollbar overflow-x-hidden';

    let selectedUiId = 'kreate-2';
    let selectedModelName = 'KreateVideo 2';
    let selectedAr = '16:9';
    let selectedDuration = 5;
    let selectedQuality = 'basic';

    let uploadedImageUrl = null;
    let uploadedVideoUrl = null;
    let lastGenerationId = null;
    let dropdownOpen = null;

    const getCurrentMode = () => {
        if (selectedUiId === 'kreate-2-extend') return 'extend';
        if (uploadedVideoUrl) return 'v2v';
        if (uploadedImageUrl) return 'i2v';
        return 't2v';
    };

    const updateLabel = (id, text) => {
        const el = container.querySelector('#' + id);
        if (el) el.textContent = text;
    };

    const generateBtn = document.createElement('button');
    generateBtn.className = 'bg-[#FFB000] text-black px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-[1.5rem] font-black text-sm md:text-base hover:shadow-[0_0_20px_rgba(255,176,0,0.4)] active:scale-95 transition-all flex items-center justify-center gap-1.5 md:gap-2.5 w-full sm:w-auto shadow-lg shrink-0 mt-2 sm:mt-0';

    // ===============================
    // HERO
    // ===============================

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
        <h1 class="text-xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-2 md:mb-4 text-center px-4">Estudio de Vídeo</h1>
        <p class="text-white/50 text-[10px] md:text-sm font-medium tracking-wide opacity-60 text-center px-4">Anima imágenes y crea vídeos increíbles con IA</p>
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

    // ===============================
    // UPLOAD IMAGE
    // ===============================

    let showVideoIcon;

    const picker = createUploadPicker({
        anchorContainer: container,
        onSelect: ({ url }) => {
            uploadedImageUrl = url;
            uploadedVideoUrl = null;
            lastGenerationId = null;

            if (showVideoIcon) showVideoIcon();

            selectedUiId = 'kreate-2';
            selectedModelName = 'KreateVideo 2';

            textarea.placeholder = 'Describe el movimiento de la imagen...';
            updateControlsForModel();
        },
        onClear: () => {
            uploadedImageUrl = null;
            textarea.placeholder = 'Describe el vídeo que quieres crear...';
            updateControlsForModel();
        }
    });

    topRow.appendChild(picker.trigger);
    container.appendChild(picker.panel);

    // ===============================
    // UPLOAD VIDEO
    // ===============================

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
    videoIconEl.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40 group-hover:text-[#FFB000] transition-colors"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
    `;

    const videoSpinnerEl = document.createElement('div');
    videoSpinnerEl.className = 'hidden items-center justify-center w-full h-full';
    videoSpinnerEl.innerHTML = `
        <div class="w-4 h-4 border-2 border-[#FFB000]/30 border-t-[#FFB000] rounded-full animate-spin"></div>
    `;

    const videoReadyEl = document.createElement('div');
    videoReadyEl.className = 'hidden items-center justify-center w-full h-full';
    videoReadyEl.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[#FFB000]"><polyline points="20 6 9 17 4 12"/></svg>
    `;

    videoPickerBtn.appendChild(videoFileInput);
    videoPickerBtn.appendChild(videoIconEl);
    videoPickerBtn.appendChild(videoSpinnerEl);
    videoPickerBtn.appendChild(videoReadyEl);

    showVideoIcon = () => {
        videoIconEl.classList.remove('hidden'); videoIconEl.classList.add('flex');
        videoSpinnerEl.classList.add('hidden'); videoSpinnerEl.classList.remove('flex');
        videoReadyEl.classList.add('hidden'); videoReadyEl.classList.remove('flex');
        videoPickerBtn.classList.remove('border-[#FFB000]/60', 'bg-[#FFB000]/10');
        videoPickerBtn.classList.add('border-white/10');
    };

    const showVideoSpinner = () => {
        videoIconEl.classList.add('hidden'); videoIconEl.classList.remove('flex');
        videoSpinnerEl.classList.remove('hidden'); videoSpinnerEl.classList.add('flex');
        videoReadyEl.classList.add('hidden'); videoReadyEl.classList.remove('flex');
    };

    const showVideoReady = () => {
        videoIconEl.classList.add('hidden'); videoIconEl.classList.remove('flex');
        videoSpinnerEl.classList.add('hidden'); videoSpinnerEl.classList.remove('flex');
        videoReadyEl.classList.remove('hidden'); videoReadyEl.classList.add('flex');
        videoPickerBtn.classList.remove('border-white/10');
        videoPickerBtn.classList.add('border-[#FFB000]/60', 'bg-[#FFB000]/10');
    };

    videoPickerBtn.onclick = (e) => {
        e.stopPropagation();
        if (uploadedVideoUrl) {
            uploadedVideoUrl = null;
            showVideoIcon();
            textarea.placeholder = 'Describe el vídeo que quieres crear...';
            updateControlsForModel();
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
            return alert('Inicia sesión o configura tu API Key.');
        }

        showVideoSpinner();

        try {
            if (typeof muapi.uploadFile !== 'function') throw new Error('Función de subida no detectada.');
            const url = await muapi.uploadFile(file);

            uploadedVideoUrl = url;
            uploadedImageUrl = null;
            lastGenerationId = null;

            selectedUiId = 'kreate-2';
            selectedModelName = 'KreateVideo 2';

            showVideoReady();
            textarea.placeholder = 'Vídeo cargado — describe qué quieres generar...';
            updateControlsForModel();
        } catch (err) {
            console.error(err);
            showVideoIcon();
            alert(`Error al subir vídeo: ${err.message}`);
        }

        videoFileInput.value = '';
    };

    topRow.appendChild(videoPickerBtn);
    topRow.appendChild(textarea);
    bar.appendChild(topRow);

    // ===============================
    // BANNER EXTEND
    // ===============================

    const extendBanner = document.createElement('div');
    extendBanner.className = 'hidden items-center justify-between gap-2 px-4 py-2.5 mx-2 mt-2 bg-[#3B82F6]/10 border border-[#3B82F6]/20 rounded-xl text-xs text-[#3B82F6]';
    extendBanner.innerHTML = `
        <div class="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <span>Extendiendo vídeo anterior. Puedes escribir un prompt opcional.</span>
        </div>
        <button id="cancel-extend-btn" class="text-white/50 hover:text-white"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    `;
    bar.appendChild(extendBanner);

    extendBanner.querySelector('#cancel-extend-btn').onclick = () => {
        lastGenerationId = null;
        selectedUiId = 'kreate-2';
        selectedModelName = 'KreateVideo 2';
        textarea.placeholder = 'Describe el vídeo que quieres crear...';
        updateControlsForModel();
    };

    // ===============================
    // CONTROLES
    // ===============================

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

    controlsLeft.appendChild(modelBtn);
    controlsLeft.appendChild(arBtn);
    controlsLeft.appendChild(durationBtn);

    bottomRow.appendChild(controlsLeft);
    bottomRow.appendChild(generateBtn);
    bar.appendChild(bottomRow);
    promptWrapper.appendChild(bar);
    container.appendChild(promptWrapper);

    const inlineInstructions = document.createElement('div');
    inlineInstructions.className = 'w-full text-center text-white/30 text-sm flex flex-col items-center gap-1 md:gap-2 py-2 px-4';
    inlineInstructions.innerHTML = `<p class="text-[10px] md:text-xs text-white/20">Puedes lanzar varios vídeos a la vez sin esperar.</p>`;
    container.appendChild(inlineInstructions);

    // ===============================
    // UPDATE UI
    // ===============================

    function updateControlsForModel() {
        const currentMode = getCurrentMode();
        const finalApiId = getApiId(selectedUiId, currentMode);
        const cost = getVideoCost(finalApiId, selectedDuration, selectedQuality);

        updateLabel('v-model-btn-label', selectedModelName);
        updateLabel('v-ar-btn-label', selectedAr);
        updateLabel('v-duration-btn-label', `${selectedDuration}s`);

        if (selectedUiId === 'kreate-2-extend') {
            extendBanner.classList.remove('hidden'); extendBanner.classList.add('flex');
        } else {
            extendBanner.classList.add('hidden'); extendBanner.classList.remove('flex');
        }

        generateBtn.innerHTML = `Generar ✨ <span class="bg-black/20 px-2 py-0.5 rounded-md text-[10px] md:text-xs font-mono ml-1 shadow-inner border border-black/10">${cost} 🪙</span>`;
    }

    // ===============================
    // DROPDOWNS
    // ===============================

    const dropdown = document.createElement('div');
    dropdown.className = 'fixed z-[999999] transition-all opacity-0 pointer-events-none scale-95 glass rounded-2xl md:rounded-3xl p-2 md:p-3 shadow-2xl border border-white/10 flex flex-col bg-[#111]/95 backdrop-blur-xl';

    const closeDropdown = () => {
        dropdown.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
        dropdown.classList.remove('opacity-100', 'pointer-events-auto', 'scale-100');
        dropdownOpen = null;
    };

    const positionDropdown = (anchorBtn, width = '240px') => {
        const rect = anchorBtn.getBoundingClientRect();
        if (window.innerWidth < 768) {
            dropdown.style.top = 'auto'; dropdown.style.bottom = '16px'; dropdown.style.left = '16px'; dropdown.style.right = '16px'; dropdown.style.width = 'auto';
        } else {
            dropdown.style.bottom = 'auto'; dropdown.style.top = `${rect.bottom + 8}px`; dropdown.style.left = `${rect.left}px`; dropdown.style.right = 'auto'; dropdown.style.width = width;
        }
    };

    const openDropdown = (type, anchorBtn) => {
        dropdown.innerHTML = '';
        dropdown.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
        dropdown.classList.add('opacity-100', 'pointer-events-auto', 'scale-100');

        if (type === 'model') {
            dropdown.innerHTML = `
                <div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Modelos KreateIA</div>
                <div class="flex flex-col gap-1"></div>
            `;
            const list = dropdown.querySelector('div:last-child');

            V_MODELS.forEach((m) => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-all';
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white">${m.name}</span>${selectedUiId === m.uiId ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;

                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedUiId = m.uiId; selectedModelName = m.name;
                    if (m.uiId !== 'kreate-2-extend') lastGenerationId = null;
                    updateControlsForModel();
                    closeDropdown();
                };
                list.appendChild(item);
            });
            positionDropdown(anchorBtn, '300px');
        }

        if (type === 'ar') {
            const ars = ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'];
            dropdown.innerHTML = `
                <div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Relación de aspecto</div>
                <div class="flex flex-col gap-1"></div>
            `;
            const list = dropdown.querySelector('div:last-child');
            ars.forEach((ar) => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-all';
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white">${ar}</span>${selectedAr === ar ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); selectedAr = ar; updateControlsForModel(); closeDropdown(); };
                list.appendChild(item);
            });
            positionDropdown(anchorBtn, '220px');
        }

        if (type === 'duration') {
            const durations = [5, 10, 15];
            dropdown.innerHTML = `
                <div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2 py-2 border-b border-white/5 mb-2">Duración</div>
                <div class="flex flex-col gap-1"></div>
            `;
            const list = dropdown.querySelector('div:last-child');
            durations.forEach((d) => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-all';
                item.innerHTML = `<span class="text-xs md:text-sm font-bold text-white">${d}s</span>${selectedDuration === d ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
                item.onclick = (e) => { e.stopPropagation(); selectedDuration = d; updateControlsForModel(); closeDropdown(); };
                list.appendChild(item);
            });
            positionDropdown(anchorBtn, '180px');
        }
    };

    const toggleDropdown = (type, btn) => (e) => {
        e.stopPropagation();
        if (dropdownOpen === type) closeDropdown();
        else { dropdownOpen = type; openDropdown(type, btn); }
    };

    modelBtn.onclick = toggleDropdown('model', modelBtn);
    arBtn.onclick = toggleDropdown('ar', arBtn);
    durationBtn.onclick = toggleDropdown('duration', durationBtn);
    window.addEventListener('click', closeDropdown);
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
    galleryGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5 w-full';

    galleryWrapper.appendChild(galleryHeader);
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
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 md:p-4">
                <p class="text-white text-[10px] md:text-xs font-medium line-clamp-2 md:line-clamp-3 mb-2 md:mb-3 shadow-black drop-shadow-md leading-tight">${entry.prompt || 'Vídeo generado'}</p>
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                        <span class="text-[8px] md:text-[10px] text-white/70 bg-black/60 px-1.5 py-0.5 md:px-2 md:py-1 rounded-md backdrop-blur-sm border border-white/10">${entry.duration || 5}s</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="extend-btn p-1.5 md:p-2 bg-[#3B82F6]/20 hover:bg-[#3B82F6] text-[#3B82F6] hover:text-white rounded-lg md:rounded-xl backdrop-blur-md transition-all border border-[#3B82F6]/30" title="Extender vídeo"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
                        <button class="download-btn p-1.5 md:p-2 bg-white/20 hover:bg-[#FFB000] hover:text-black text-white rounded-lg md:rounded-xl backdrop-blur-md transition-all border border-white/20" title="Descargar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
                    </div>
                </div>
            </div>
        `;

        const extendBtn = card.querySelector('.extend-btn');
        const requestId = entry.request_id || entry.muapi_request_id || null;

        if (extendBtn) {
            if (!requestId) {
                extendBtn.style.display = 'none';
            } else {
                extendBtn.onclick = (e) => {
                    e.stopPropagation();
                    lastGenerationId = requestId;
                    selectedUiId = 'kreate-2-extend';
                    selectedModelName = 'KreateVideo 2 Extend';
                    uploadedImageUrl = null;
                    uploadedVideoUrl = null;
                    showVideoIcon();
                    textarea.placeholder = 'Opcional: describe cómo continuar este vídeo...';
                    updateControlsForModel();
                    container.scrollTo({ top: 0, behavior: 'smooth' });
                    textarea.focus();
                };
            }
        }

        const downloadBtn = card.querySelector('.download-btn');
        if (downloadBtn) {
            downloadBtn.onclick = (e) => {
                e.stopPropagation();
                downloadFile(entry.url, `KreateVideo-${Date.now()}.mp4`);
            };
        }

        if (isPrepend) galleryGrid.prepend(card);
        else galleryGrid.appendChild(card);
    };

    const loadFirebaseHistory = async (user) => {
        try {
            const genRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'video_generations');
            const q = query(genRef, orderBy('createdAt', 'desc'), limit(20));
            const snap = await getDocs(q);
            snap.forEach((docSnap) => { renderCard({ id: docSnap.id, ...docSnap.data() }); });
        } catch (error) { console.error('Error cargando historial de vídeo:', error); }
    };

    onAuthStateChanged(auth, (user) => { if (user) loadFirebaseHistory(user); });

    // ===============================
    // GENERAR VÍDEO (LÓGICA CON MUAPI.JS)
    // ===============================

    generateBtn.onclick = async () => {
        let loadingCard = null;

        try {
            let promptText = textarea.value.trim();
            const currentMode = getCurrentMode();
            const finalApiId = getApiId(selectedUiId, currentMode);

            if (!auth.currentUser) {
                if (typeof AuthModal === 'function') return AuthModal(() => generateBtn.click());
                return alert('Debes iniciar sesión para generar vídeos.');
            }

            if (currentMode === 't2v' && !promptText && selectedUiId !== 'kreate-2-extend') return alert('Escribe un prompt para generar el vídeo.');
            if (currentMode === 'i2v' && !uploadedImageUrl) return alert('Sube una imagen de referencia.');
            if (currentMode === 'v2v' && !uploadedVideoUrl) return alert('Sube un vídeo de referencia.');
            if (selectedUiId === 'kreate-2-extend' && !lastGenerationId) return alert('No hay ID de vídeo previo para extender.');

            const cost = calculateVideoCost(finalApiId, selectedDuration);
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid);

            try {
                const userSnap = await getDoc(userRef);
                const currentCredits = userSnap.exists() ? userSnap.data().credits || 0 : 0;
                if (currentCredits < cost) {
                    return alert(`⚠️ Saldo insuficiente.\n\nEste vídeo requiere ${cost} 🪙 y tienes ${currentCredits} 🪙.`);
                }
            } catch (err) {
                return alert('No hemos podido verificar tu saldo.');
            }

            const tempId = Date.now().toString();
            galleryHeader.classList.remove('hidden');

            loadingCard = document.createElement('div');
            loadingCard.id = `card-${tempId}`;
            loadingCard.className = 'relative aspect-video rounded-xl md:rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex flex-col items-center justify-center animate-fade-in-up';
            loadingCard.innerHTML = `
                <div class="absolute inset-0 bg-gradient-to-tr from-[#3B82F6]/5 to-[#FFB000]/5 animate-pulse"></div>
                <div class="z-10 flex flex-col items-center gap-2 md:gap-3">
                    <div class="w-8 h-8 md:w-10 md:h-10 border-4 border-[#FFB000]/30 border-t-[#FFB000] rounded-full animate-spin"></div>
                    <span class="status-text text-xs md:text-sm font-bold text-[#FFB000] animate-pulse">Conectando motor...</span>
                </div>
                <div class="absolute bottom-2 md:bottom-4 left-2 right-2 md:left-4 md:right-4 text-[8px] md:text-[10px] text-center text-white/40 line-clamp-2 px-1 md:px-2 leading-tight">${promptText || 'Procesando vídeo'}</div>
            `;
            galleryGrid.prepend(loadingCard);

            textarea.value = ''; textarea.style.height = 'auto';
            generateBtn.innerHTML = 'Lanzado 🚀';
            setTimeout(() => { updateControlsForModel(); }, 1000);

            // ===============================
            // PREPARACIÓN DE PARÁMETROS PARA MUAPI
            // ===============================
            const params = {
                model: finalApiId,
                aspect_ratio: selectedAr,
                duration: parseInt(selectedDuration) || 5
            };

            if (currentMode === 't2v') {
                params.prompt = promptText;
            }

            if (currentMode === 'i2v') {
                if (finalApiId === 'sd-2-i2v-480p') {
                    if (!promptText.includes('@image1')) promptText = `@image1 ${promptText}`.trim();
                    params.images_list = [uploadedImageUrl];
                } else {
                    params.image_url = uploadedImageUrl; 
                }
                params.prompt = promptText;
            }

            if (currentMode === 'v2v') {
                if (finalApiId === 'sd-2-omni-reference-no-video-fast') {
                    if (!promptText.includes('@video1')) promptText = `@video1 ${promptText}`.trim();
                    params.video_files = [uploadedVideoUrl];
                } else {
                    params.video_url = uploadedVideoUrl; 
                }
                params.prompt = promptText || 'Apply motion';
            }

            if (selectedUiId === 'kreate-2-extend') {
                params.request_id = lastGenerationId;
                params.prompt = promptText || 'Continue the video';
            }

            // ===============================
            // LLAMADA A MUAPI
            // ===============================
            let finalUrl = null;
            let rid = null;

            try {
                // Generación principal usando la SDK de Muapi
                const res = await muapi.generateVideo(params);
                
                // Si Muapi devuelve la URL directa
                if (res.url) finalUrl = res.url;
                
                rid = res.request_id || res.id;
            } catch (err) {
                console.error("Muapi Error:", err);
                throw new Error("El servicio de vídeo no está disponible en este momento.");
            }

            // Si Muapi devuelve éxito pero es asíncrono (tarda unos minutos), usamos polling
            if (!finalUrl && rid) {
                loadingCard.querySelector('.status-text').textContent = 'Renderizando vídeo (1-3 min)...';
                const token = await auth.currentUser.getIdToken();
                let attempts = 0;
                
                while (attempts < 150) {
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    try {
                        const poll = await fetch(`/api/v1/predictions/${rid}/result`, { headers: { Authorization: `Bearer ${token}` } });
                        if (poll.ok) {
                            const pollRes = await poll.json();
                            finalUrl = pollRes?.output?.outputs?.[0] || pollRes?.outputs?.[0] || pollRes?.url || pollRes?.video_url;
                            
                            if (finalUrl) break;
                            
                            if (pollRes?.status === 'failed' || pollRes?.status === 'error') {
                                throw new Error('El modelo falló al renderizar el vídeo.');
                            }
                        }
                    } catch(e) {
                        if(e.message.includes('falló')) throw e;
                    }
                    attempts++;
                }
            }

            if (!finalUrl) throw new Error('Tiempo de espera de renderizado agotado.');

            // Cobro de créditos
            try { await updateDoc(userRef, { credits: increment(-cost) }); } catch (e) {}

            const cleanPrompt = String(promptText).replace('@image1', '').replace('@video1', '').trim();
            const entryData = {
                url: finalUrl,
                prompt: cleanPrompt || 'Vídeo generado',
                model: finalApiId,
                duration: selectedDuration,
                aspect_ratio: selectedAr,
                type: 'video',
                request_id: rid || null,
                muapi_request_id: rid || null,
                createdAt: serverTimestamp()
            };

            let realId = rid || Date.now().toString();

            try {
                const genRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid, 'video_generations');
                const docRef = await addDoc(genRef, entryData);
                realId = docRef.id;
            } catch (e) {}

            loadingCard.remove();
            renderCard({ id: realId, ...entryData }, true);

            if (selectedUiId === 'kreate-2-extend') {
                lastGenerationId = null;
                selectedUiId = 'kreate-2';
                selectedModelName = 'KreateVideo 2';
                updateControlsForModel();
            }

        } catch (errorFatal) {
            console.error(errorFatal);
            if (loadingCard) {
                loadingCard.innerHTML = `
                    <div class="absolute inset-0 bg-red-500/10"></div>
                    <div class="z-10 flex flex-col items-center gap-1 md:gap-2 p-2 md:p-4 text-center">
                        <span class="text-lg md:text-xl">⚠️</span>
                        <span class="text-[8px] md:text-[10px] font-bold text-red-400">Error interno</span>
                        <span class="text-white/50 text-[6px] px-2 break-words w-full">${String(errorFatal.message || '').slice(0, 100)}</span>
                        <button class="retry-btn mt-1 bg-white/10 px-2 py-1 rounded-md text-[8px] text-white hover:bg-white/20 border border-white/10">Cerrar</button>
                    </div>
                `;
                const retryBtn = loadingCard.querySelector('.retry-btn');
                if (retryBtn) retryBtn.onclick = () => loadingCard.remove();
            }
        } finally {
            setTimeout(() => { updateControlsForModel(); }, 100);
        }
    };

    updateControlsForModel();
    return container;
}
