import { AuthModal } from './AuthModal.js';
import { createUploadPicker } from './UploadPicker.js';
import { createControlBtn, createDropdownSystem } from './dropdowns.js';
import { auth, db, APP_ID } from '../lib/firebase.js';
import {
    collection, addDoc, query, orderBy, limit, getDocs,
    serverTimestamp, doc, getDoc, updateDoc, increment
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const V_MODELS = [
    { uiId: 'kreate-2',        name: 'KreateVideo 2',          desc: 'Seedance v2 · T2V / I2V / V2V' },
    { uiId: 'kreate-2-extend', name: 'KreateVideo 2 Extend',   desc: 'Alarga el último vídeo generado' },
    { uiId: 'veo-fast',        name: 'KreateVideo Fast',        desc: 'Veo 3.1 · Generación rápida' },
    { uiId: 'veo-i2v',         name: 'KreateVideo Fast I2V',    desc: 'Veo 3.1 · Imagen a vídeo' },
    { uiId: 'kling-mc',        name: 'KreateMotion Control',    desc: 'Kling v3 · Control de cámara' }
];

const getApiId = (uiId, mode) => {
    if (uiId === 'kreate-2-extend') return 'sd-2-vip-extend';
    if (uiId === 'veo-fast')        return 'veo3.1-fast-text-to-video';
    if (uiId === 'veo-i2v')         return 'veo3.1-lite-image-to-video';
    if (uiId === 'kling-mc')        return 'kling-v3.0-std-motion-control';
    if (uiId === 'kreate-2') {
        if (mode === 'i2v') return 'seedance-2-vip-image-to-video-fast';
        if (mode === 'v2v') return 'seedance-2.0-omni-reference-480p';
        return 'seedance-v2.0-t2v';
    }
    return 'seedance-v2.0-t2v';
};

const getVideoCost = (apiId) => {
    // Precio MuAPI real + 35% margen. 1 CR = $0.01
    const costMap = {
        'seedance-v2.0-t2v':                     0.75,
        'seedance-2-vip-image-to-video-fast':     1.05,
        'seedance-2.0-omni-reference-480p':       1.44,
        'sd-2-vip-extend':                        1.05,
        'veo3.1-fast-text-to-video':              0.40,
        'veo3.1-lite-image-to-video':             0.30,
        'kling-v3.0-std-motion-control':          1.63,
    };
    const base = costMap[apiId] || 0.75;
    return Math.ceil(base * 1.35 * 100);
};

const AR_LABELS = {
    '16:9': 'Landscape', '9:16': 'Vertical', '4:3': 'Clásico',
    '3:4': 'Retrato', '1:1': 'Cuadrado', '21:9': 'Cine'
};

const buildVideoParams = ({ finalApiId, promptText, selectedAr, selectedDuration, selectedQuality, uploadedImageUrl, uploadedVideoUrl, lastGenerationId }) => {
    const duration = parseInt(selectedDuration) || 5;
    const quality  = selectedQuality || 'basic';
    if (['seedance-v2.0-t2v','veo3.1-fast-text-to-video','kling-v3.0-std-motion-control'].includes(finalApiId))
        return { prompt: promptText, aspect_ratio: selectedAr, duration, quality };
    if (finalApiId === 'seedance-2-vip-image-to-video-fast') {
        let p = promptText || 'Animate this image';
        if (!p.includes('@image1')) p = `@image1 ${p}`;
        return { prompt: p, images_list: [uploadedImageUrl], aspect_ratio: selectedAr, duration, quality };
    }
    if (finalApiId === 'veo3.1-lite-image-to-video') {
        let p = promptText || 'Animate this image smoothly';
        if (!p.includes('@image1')) p = `@image1 ${p}`;
        return { prompt: p, images_list: [uploadedImageUrl], aspect_ratio: selectedAr, duration, quality };
    }
    if (finalApiId === 'seedance-2.0-omni-reference-480p') {
        let p = promptText || 'Create a cinematic video';
        if (!p.includes('@video1')) p = `@video1 ${p}`;
        return { prompt: p, video_files: [uploadedVideoUrl], aspect_ratio: selectedAr, duration, quality };
    }
    if (finalApiId === 'sd-2-vip-extend') {
        if (!lastGenerationId) throw new Error('No hay request_id para extender.');
        const p = { request_id: lastGenerationId, duration, quality };
        if (promptText) p.prompt = promptText;
        if (selectedAr)  p.aspect_ratio = selectedAr;
        return p;
    }
    return { prompt: promptText, aspect_ratio: selectedAr, duration, quality };
};

const extractVideoUrl = (d) => {
    if (!d) return null;
    if (d.output?.outputs?.length) return d.output.outputs[0];
    if (d.outputs?.length)         return d.outputs[0];
    if (d.url)                     return d.url;
    if (d.video_url)               return d.video_url;
    if (d.output?.url)             return d.output.url;
    return null;
};

export function VideoStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center bg-[#050505] relative p-2 md:p-6 pb-24 overflow-y-auto custom-scrollbar overflow-x-hidden';

    let selectedUiId      = 'kreate-2';
    let selectedModelName = 'KreateVideo 2';
    let selectedAr        = '16:9';
    let selectedDuration  = 5;
    let selectedQuality   = 'basic';
    let uploadedImageUrl  = null;
    let uploadedVideoUrl  = null;
    let lastGenerationId  = null;

    const dd = createDropdownSystem();

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

    // HERO
    const hero = document.createElement('div');
    hero.className = 'flex flex-col items-center mb-6 md:mb-16 mt-4 md:mt-0 animate-fade-in-up shrink-0';
    hero.innerHTML = `
        <div class="mb-6 md:mb-10 relative group">
            <div class="absolute inset-0 bg-[#FFB000]/20 blur-[60px] md:blur-[100px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-1000"></div>
            <div class="relative w-16 h-16 md:w-32 md:h-32 bg-[#111] rounded-2xl md:rounded-3xl flex items-center justify-center border border-white/5 overflow-hidden">
                <div class="w-10 h-10 md:w-16 md:h-16 bg-[#FFB000]/10 rounded-xl flex items-center justify-center border border-[#FFB000]/20 relative z-10">
                    <svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[#FFB000]"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                </div>
            </div>
        </div>
        <h1 class="text-xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-2 md:mb-4 text-center px-4">Estudio de Vídeo</h1>
        <p class="text-white/40 text-[10px] md:text-sm font-medium text-center px-4">Anima imágenes y crea vídeos increíbles con IA</p>
    `;
    container.appendChild(hero);

    // PROMPT BAR
    const promptWrapper = document.createElement('div');
    promptWrapper.className = 'w-full max-w-4xl relative z-40 shrink-0 px-2 md:px-0';

    const bar = document.createElement('div');
    bar.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:24px;padding:16px 20px;display:flex;flex-direction:column;gap:14px';

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;align-items:flex-start;gap:12px';

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Describe el vídeo que quieres crear...';
    textarea.style.cssText = 'flex:1;background:transparent;border:none;color:#fff;font-size:15px;resize:none;outline:none;padding-top:4px;line-height:1.5;min-height:40px;max-height:200px;overflow-y:auto;font-family:inherit';
    textarea.rows = 1;
    textarea.oninput = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, window.innerWidth < 768 ? 120 : 200) + 'px';
    };

    // GENERATE BTN
    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.style.cssText = 'display:flex;align-items:center;gap:8px;padding:11px 22px;background:#f59e0b;border:none;border-radius:100px;cursor:pointer;font-size:13px;font-weight:700;color:#000;transition:background .15s;white-space:nowrap;flex-shrink:0;-webkit-tap-highlight-color:transparent';
    generateBtn.addEventListener('mouseenter', () => generateBtn.style.background = '#fbbf24');
    generateBtn.addEventListener('mouseleave', () => generateBtn.style.background = '#f59e0b');

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
    });

    // UPLOAD IMAGEN
    let showVideoIcon;
    const picker = createUploadPicker({
        anchorContainer: container,
        onSelect: ({ url }) => {
            uploadedImageUrl = url; uploadedVideoUrl = null; lastGenerationId = null;
            if (showVideoIcon) showVideoIcon();
            selectedUiId = 'kreate-2'; selectedModelName = 'KreateVideo 2';
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

    // UPLOAD VIDEO
    const videoFileInput = document.createElement('input');
    videoFileInput.type = 'file'; videoFileInput.accept = 'video/*'; videoFileInput.className = 'hidden';

    const videoPickerBtn = document.createElement('button');
    videoPickerBtn.type = 'button';
    videoPickerBtn.title = 'Subir vídeo de referencia';
    videoPickerBtn.style.cssText = 'width:40px;height:40px;flex-shrink:0;border-radius:12px;border:1px solid #2a2a2a;background:#1a1a1a;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;margin-top:2px;-webkit-tap-highlight-color:transparent';

    const videoIconEl = document.createElement('div');
    videoIconEl.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%';
    videoIconEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`;

    const videoSpinnerEl = document.createElement('div');
    videoSpinnerEl.style.cssText = 'display:none;align-items:center;justify-content:center;width:100%;height:100%';
    videoSpinnerEl.innerHTML = `<div style="width:14px;height:14px;border:2px solid #f59e0b33;border-top-color:#f59e0b;border-radius:50%;animation:spin 1s linear infinite"></div>`;

    const videoReadyEl = document.createElement('div');
    videoReadyEl.style.cssText = 'display:none;align-items:center;justify-content:center;width:100%;height:100%';
    videoReadyEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;

    videoPickerBtn.appendChild(videoFileInput);
    videoPickerBtn.appendChild(videoIconEl);
    videoPickerBtn.appendChild(videoSpinnerEl);
    videoPickerBtn.appendChild(videoReadyEl);

    showVideoIcon = () => {
        videoIconEl.style.display = 'flex'; videoSpinnerEl.style.display = 'none'; videoReadyEl.style.display = 'none';
        videoPickerBtn.style.borderColor = '#2a2a2a'; videoPickerBtn.style.background = '#1a1a1a';
    };
    const showVideoSpinner = () => {
        videoIconEl.style.display = 'none'; videoSpinnerEl.style.display = 'flex'; videoReadyEl.style.display = 'none';
    };
    const showVideoReady = () => {
        videoIconEl.style.display = 'none'; videoSpinnerEl.style.display = 'none'; videoReadyEl.style.display = 'flex';
        videoPickerBtn.style.borderColor = '#f59e0b66'; videoPickerBtn.style.background = '#f59e0b11';
    };

    videoPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (uploadedVideoUrl) { uploadedVideoUrl = null; showVideoIcon(); textarea.placeholder = 'Describe el vídeo que quieres crear...'; updateControlsForModel(); }
        else videoFileInput.click();
    });

    videoFileInput.onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        if (!auth?.currentUser) { if (typeof AuthModal === 'function') return AuthModal(() => videoFileInput.click()); return alert('Inicia sesión.'); }
        showVideoSpinner();
        try {
            const token = await auth.currentUser.getIdToken();
            const fd = new FormData(); fd.append('file', file);
            const resp = await fetch('/api/v1/upload_file', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
            if (!resp.ok) throw new Error(`Error subiendo: ${resp.status}`);
            const data = await resp.json();
            const url  = data.url || data.file_url || data.data?.url;
            if (!url) throw new Error('No se recibió URL.');
            uploadedVideoUrl = url; uploadedImageUrl = null; lastGenerationId = null;
            selectedUiId = 'kreate-2'; selectedModelName = 'KreateVideo 2';
            showVideoReady(); textarea.placeholder = 'Vídeo cargado — describe qué quieres generar...'; updateControlsForModel();
        } catch (err) { showVideoIcon(); alert(`Error al subir vídeo: ${err.message}`); }
        videoFileInput.value = '';
    };

    topRow.appendChild(videoPickerBtn);
    topRow.appendChild(textarea);
    bar.appendChild(topRow);

    // EXTEND BANNER
    const extendBanner = document.createElement('div');
    extendBanner.style.cssText = 'display:none;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;background:#3b82f611;border:1px solid #3b82f633;border-radius:12px;font-size:12px;color:#60a5fa';
    extendBanner.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <span>Extendiendo vídeo anterior. Prompt opcional.</span>
        </div>
        <button id="cancel-extend" style="background:none;border:none;cursor:pointer;color:#60a5fa;opacity:.6;padding:2px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
    `;
    bar.appendChild(extendBanner);
    extendBanner.querySelector('#cancel-extend').addEventListener('click', () => {
        lastGenerationId = null; selectedUiId = 'kreate-2'; selectedModelName = 'KreateVideo 2';
        textarea.placeholder = 'Describe el vídeo que quieres crear...'; updateControlsForModel();
    });

    // CONTROLS ROW
    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding-top:12px;border-top:1px solid #1f1f1f';

    const controlsLeft = document.createElement('div');
    controlsLeft.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;flex:1;min-width:0';

    const modelBtn    = createControlBtn(`<div style="width:16px;height:16px;background:#f59e0b;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#000;flex-shrink:0">K</div>`, selectedModelName, 'v-model-btn');
    const arBtn       = createControlBtn(`<svg style="opacity:.5;flex-shrink:0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`, selectedAr, 'v-ar-btn');
    const durationBtn = createControlBtn(`<svg style="opacity:.5;flex-shrink:0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`, `${selectedDuration}s`, 'v-duration-btn');
    const qualityBtn  = createControlBtn(`<svg style="opacity:.5;flex-shrink:0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.8 5.5 21l2-7.5L2 9h7z"/></svg>`, 'Básica', 'v-quality-btn');

    controlsLeft.appendChild(modelBtn);
    controlsLeft.appendChild(arBtn);
    controlsLeft.appendChild(durationBtn);
    controlsLeft.appendChild(qualityBtn);
    bottomRow.appendChild(controlsLeft);
    bottomRow.appendChild(generateBtn);
    bar.appendChild(bottomRow);
    promptWrapper.appendChild(bar);
    container.appendChild(promptWrapper);

    container.appendChild(Object.assign(document.createElement('div'), {
        style: 'text-align:center;padding:8px 16px',
        innerHTML: '<p style="color:#333;font-size:11px">Puedes lanzar varios vídeos a la vez sin esperar</p>'
    }));

    // UPDATE UI
    function updateControlsForModel() {
        const mode       = getCurrentMode();
        const finalApiId = getApiId(selectedUiId, mode);
        const cost       = getVideoCost(finalApiId);

        updateLabel('v-model-btn-label',    selectedModelName);
        updateLabel('v-ar-btn-label',       selectedAr);
        updateLabel('v-duration-btn-label', `${selectedDuration}s`);
        updateLabel('v-quality-btn-label',  selectedQuality === 'high' ? 'Alta' : 'Básica');

        extendBanner.style.display = selectedUiId === 'kreate-2-extend' ? 'flex' : 'none';

        generateBtn.innerHTML = `Generar ✨ <span style="background:rgba(0,0,0,.25);padding:2px 8px;border-radius:100px;font-size:11px;font-family:monospace">${cost} 🪙</span>`;
    }

    // DROPDOWN HANDLERS
    const AR_ITEMS_BASIC    = ['16:9','9:16','4:3','3:4'].map(v => ({ id: v, name: v, sub: AR_LABELS[v] }));
    const AR_ITEMS_EXTENDED = ['21:9','16:9','4:3','1:1','3:4','9:16'].map(v => ({ id: v, name: v, sub: AR_LABELS[v] }));
    const DURATION_ITEMS    = [5,10,15].map(v => ({ id: String(v), name: `${v} segundos` }));
    const QUALITY_ITEMS     = [{ id: 'basic', name: 'Básica' }, { id: 'high', name: 'Alta' }];

    // Modelos con uiId como id para el dropdown
    const V_MODELS_DD = V_MODELS.map(m => ({ ...m, id: m.uiId }));

    modelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dd.openModels(V_MODELS_DD, selectedUiId, modelBtn, (id) => {
            const m = V_MODELS.find(x => x.uiId === id);
            if (!m) return;
            selectedUiId = m.uiId; selectedModelName = m.name;
            if (m.uiId !== 'kreate-2-extend') lastGenerationId = null;
            updateControlsForModel();
        });
    });

    arBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const finalApiId = getApiId(selectedUiId, getCurrentMode());
        const items = ['sd-2-vip-extend','seedance-2.0-omni-reference-480p'].includes(finalApiId) ? AR_ITEMS_EXTENDED : AR_ITEMS_BASIC;
        dd.openList('Relación de aspecto', items, selectedAr, arBtn, (val) => {
            selectedAr = val; updateControlsForModel();
        });
    });

    durationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dd.openList('Duración', DURATION_ITEMS, String(selectedDuration), durationBtn, (val) => {
            selectedDuration = parseInt(val); updateControlsForModel();
        });
    });

    qualityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dd.openList('Calidad', QUALITY_ITEMS, selectedQuality, qualityBtn, (val) => {
            selectedQuality = val; updateControlsForModel();
        });
    });

    // GALERÍA
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
            const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await fetch(url).then(r => r.blob())), download: filename });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } catch { window.open(url, '_blank'); }
    };

    const renderCard = (entry, isPrepend = false) => {
        galleryHeader.classList.remove('hidden');
        const card = document.createElement('div');
        card.id = `card-${entry.id}`;
        card.className = 'relative aspect-video rounded-xl md:rounded-2xl overflow-hidden bg-white/5 border border-white/10 group animate-fade-in-up';
        card.innerHTML = `
            <video src="${entry.url}" autoplay loop muted playsinline class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"></video>
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 md:p-4">
                <p class="text-white text-[10px] md:text-xs font-medium line-clamp-2 mb-2 leading-tight">${entry.prompt || 'Vídeo generado'}</p>
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                        <span class="text-[8px] md:text-[10px] text-white/70 bg-black/60 px-1.5 py-0.5 rounded-md border border-white/10">${entry.duration || 5}s</span>
                        <span class="text-[8px] md:text-[10px] text-[#FFB000] font-bold bg-[#FFB000]/10 px-1.5 py-0.5 rounded-md border border-[#FFB000]/20">${entry.quality === 'high' ? 'Alta' : 'Básica'}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="extend-btn p-1.5 md:p-2 bg-[#3B82F6]/20 hover:bg-[#3B82F6] text-[#3B82F6] hover:text-white rounded-lg transition-all border border-[#3B82F6]/30" title="Extender">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        </button>
                        <button class="download-btn p-1.5 md:p-2 bg-white/20 hover:bg-[#FFB000] hover:text-black text-white rounded-lg transition-all border border-white/20" title="Descargar">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
        const rid = entry.request_id || entry.muapi_request_id || null;
        const extendBtn = card.querySelector('.extend-btn');
        if (!rid) { extendBtn.style.display = 'none'; } else {
            extendBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                lastGenerationId = rid; selectedUiId = 'kreate-2-extend'; selectedModelName = 'KreateVideo 2 Extend';
                uploadedImageUrl = null; uploadedVideoUrl = null; showVideoIcon();
                textarea.placeholder = 'Opcional: describe cómo continuar este vídeo...';
                updateControlsForModel(); container.scrollTo({ top: 0, behavior: 'smooth' }); textarea.focus();
            });
        }
        card.querySelector('.download-btn').addEventListener('click', (e) => { e.stopPropagation(); downloadFile(entry.url, `KreateVideo-${Date.now()}.mp4`); });
        if (isPrepend) galleryGrid.prepend(card); else galleryGrid.appendChild(card);
    };

    const loadFirebaseHistory = async (user) => {
        try {
            const q    = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'video_generations'), orderBy('createdAt', 'desc'), limit(20));
            const snap = await getDocs(q);
            snap.forEach((d) => renderCard({ id: d.id, ...d.data() }));
        } catch (err) { console.error('[VideoStudio] Historial:', err); }
    };

    onAuthStateChanged(auth, (user) => { if (user) loadFirebaseHistory(user); });

    // GENERACIÓN
    async function handleGenerate() {
        const promptText  = textarea.value.trim();
        const currentMode = getCurrentMode();
        const finalApiId  = getApiId(selectedUiId, currentMode);
        const cost        = getVideoCost(finalApiId);

        if (!auth?.currentUser) {
            if (typeof AuthModal === 'function') return AuthModal(() => handleGenerate());
            return alert('Debes iniciar sesión.');
        }
        if (['seedance-v2.0-t2v','veo3.1-fast-text-to-video','kling-v3.0-std-motion-control'].includes(finalApiId) && !promptText)
            return alert('Escribe un prompt para generar el vídeo.');
        if (finalApiId === 'seedance-2-vip-image-to-video-fast' && !uploadedImageUrl)
            return alert('Sube una imagen de referencia primero.');
        if (finalApiId === 'veo3.1-lite-image-to-video' && !uploadedImageUrl)
            return alert('Sube una imagen de referencia para KreateVideo Fast I2V.');
        if (finalApiId === 'seedance-2.0-omni-reference-480p' && !uploadedVideoUrl)
            return alert('Sube un vídeo de referencia primero.');
        if (finalApiId === 'sd-2-vip-extend' && !lastGenerationId)
            return alert('No hay vídeo anterior para extender.');

        const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid);
        let userSnap;
        try { userSnap = await getDoc(userRef); } catch { return alert('Error consultando saldo.'); }
        const credits = userSnap.exists() ? (userSnap.data().credits || 0) : 0;
        const isAdmin = userSnap.exists() && userSnap.data().role === 'admin';
        if (!isAdmin && credits < cost) return alert(`⚠️ Saldo insuficiente.\n\nNecesitas ${cost} 🪙 y tienes ${credits} 🪙.`);

        galleryHeader.classList.remove('hidden');
        const params      = buildVideoParams({ finalApiId, promptText, selectedAr, selectedDuration, selectedQuality, uploadedImageUrl, uploadedVideoUrl, lastGenerationId });
        const cleanPrompt = String(params.prompt || promptText || '').replace(/@image\d/g,'').replace(/@video\d/g,'').trim();

        const loadingCard = document.createElement('div');
        loadingCard.className = 'relative aspect-video rounded-xl md:rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex flex-col items-center justify-center';
        loadingCard.innerHTML = `
            <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
            <div class="absolute inset-0 animate-pulse" style="background:linear-gradient(135deg,#3b82f608,#f59e0b08)"></div>
            <div class="z-10 flex flex-col items-center gap-3">
                <div style="width:36px;height:36px;border:3px solid #f59e0b33;border-top-color:#f59e0b;border-radius:50%;animation:spin 1s linear infinite"></div>
                <span class="status-text" style="font-size:12px;font-weight:700;color:#f59e0b">Enviando petición...</span>
            </div>
            <div class="absolute bottom-3 left-3 right-3" style="font-size:9px;text-align:center;color:#444;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${cleanPrompt || 'Procesando...'}</div>
        `;
        galleryGrid.prepend(loadingCard);
        const statusText = loadingCard.querySelector('.status-text');
        textarea.value = ''; textarea.style.height = 'auto';

        try {
            const token = await auth.currentUser.getIdToken();
            const req   = await fetch(`/api/v1/${finalApiId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(params)
            });
            if (!req.ok) { const t = await req.text(); throw new Error(`Error (${req.status}): ${t.slice(0,200)}`); }

            let res = await req.json();
            console.log('[VideoStudio] Respuesta inicial:', res);

            if (res.request_id && !extractVideoUrl(res)) {
                statusText.textContent = 'Renderizando (1-3 min)...';
                let attempts = 0;
                while (attempts < 150) {
                    await new Promise(r => setTimeout(r, 2000));
                    attempts++;
                    try {
                        const poll = await fetch(`/api/v1/predictions/${res.request_id}/result`, { headers: { 'Authorization': `Bearer ${token}` } });
                        if (!poll.ok) { if (poll.status >= 500) continue; throw new Error(`Poll ${poll.status}`); }
                        const p = await poll.json();
                        if (extractVideoUrl(p)) { res = p; break; }
                        const st = (p.status || p.output?.status || '').toLowerCase();
                        if (st === 'failed' || st === 'error') throw new Error(p.error || 'La generación falló.');
                    } catch (pe) { if (attempts >= 150) throw pe; }
                    const e = attempts * 2;
                    statusText.textContent = `Renderizando... ${Math.floor(e/60)}min ${e%60}s`;
                }
            }

            const finalUrl = extractVideoUrl(res);
            if (!finalUrl) throw new Error('No se recibió URL del vídeo.');

            if (!isAdmin) { try { await updateDoc(userRef, { credits: increment(-cost) }); } catch {} }

            const rid = res.request_id || res.output?.id || res.id || null;
            const entryData = { url: finalUrl, prompt: cleanPrompt || 'Vídeo generado', model: finalApiId, duration: selectedDuration, quality: selectedQuality, aspect_ratio: selectedAr, type: 'video', request_id: rid, muapi_request_id: rid, createdAt: serverTimestamp() };
            let realId = rid || Date.now().toString();
            try { const ref = await addDoc(collection(db,'artifacts',APP_ID,'public','data','users',auth.currentUser.uid,'video_generations'), entryData); realId = ref.id; } catch {}

            loadingCard.remove();
            renderCard({ id: realId, ...entryData }, true);
            if (finalApiId === 'sd-2-vip-extend') { lastGenerationId = null; selectedUiId = 'kreate-2'; selectedModelName = 'KreateVideo 2'; }

        } catch (err) {
            console.error('[VideoStudio] Error:', err);
            loadingCard.innerHTML = `
                <div class="absolute inset-0" style="background:#ef444411"></div>
                <div class="z-10 flex flex-col items-center gap-2 p-4 text-center">
                    <span style="font-size:20px">⚠️</span>
                    <span style="font-size:10px;font-weight:700;color:#f87171">Error al generar</span>
                    <span style="font-size:8px;color:#666;word-break:break-word;max-width:100%">${String(err.message||'').slice(0,120)}</span>
                    <button onclick="this.closest('[id^=card]').remove()" style="margin-top:4px;background:#ffffff11;border:1px solid #ffffff22;border-radius:8px;padding:4px 10px;font-size:9px;color:#fff;cursor:pointer">Cerrar</button>
                </div>
            `;
        }
        updateControlsForModel();
    }

    generateBtn.addEventListener('click', (e) => { e.stopPropagation(); handleGenerate(); });

    // Añadir keyframes spin al documento
    if (!document.querySelector('#kreate-spin-style')) {
        const s = document.createElement('style');
        s.id = 'kreate-spin-style';
        s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
    }

    updateControlsForModel();
    return container;
}
