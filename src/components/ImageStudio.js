Sí. Pega este archivo completo en `src/components/ImageStudio.js`.

```js
import {
    getAspectRatiosForModel,
    getResolutionsForModel,
    getAspectRatiosForI2IModel,
    getResolutionsForI2IModel,
    getMaxImagesForI2IModel
} from '../lib/models.js';
import { AuthModal } from './AuthModal.js';
import { createUploadPicker } from './UploadPicker.js';
import { createControlBtn, createDropdownSystem } from './dropdowns.js';
import { auth, db, APP_ID } from '../lib/firebase.js';
import {
    collection,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    serverTimestamp,
    updateDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

async function saveGenerationTask({ type, endpoint, requestId, prompt, userId }) {
    try {
        return addDoc(
            collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', userId, 'generation_tasks'),
            {
                type,
                endpoint,
                request_id: requestId || null,
                prompt: (prompt || '').slice(0, 200),
                status: 'running',
                result_url: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }
        );
    } catch(e) {
        console.warn('saveGenerationTask failed:', e.message);
        return null;
    }
}

const ACTIVE_T2I = [
    { id: 'nano-banana-2', name: 'KreateImage 2', desc: 'Generación de imágenes en alta calidad' }
];

const ACTIVE_I2I = [
    { id: 'nano-banana-2-edit', name: 'KreateImage 2 Edit', desc: 'Edición de imágenes con IA' }
];

const STYLE_PRESETS = [
    'Ninguno',
    'Fotorrealista',
    'Anime',
    'Cinematográfico',
    'Pintura al Óleo',
    'Acuarela',
    'Arte Digital',
    'Arte Conceptual',
    'Cyberpunk'
];

const getModelCost = (id, resolution = '720p') => {
    const base = id === 'nano-banana-2' ? 16
        : id === 'nano-banana-2-edit' ? 8
        : 8;

    const multipliers = { '720p': 1, '1080p': 1.5, '2k': 2, '4k': 4 };
    const mult = multipliers[String(resolution).toLowerCase()] || 1;

    return Math.ceil(base * mult);
};

function isDynamicModelId(id) {
    return String(id || '').startsWith('tool:');
}

function dynamicModelId(toolId) {
    return 'tool:' + toolId;
}

function getToolIdFromModelId(id) {
    return String(id || '').replace(/^tool:/, '');
}

function getSchemaField(tool, names) {
    const schema = Array.isArray(tool && tool.schema) ? tool.schema : [];
    const wanted = names.map(v => String(v).toLowerCase());

    return schema.find(field => {
        const key = String((field && field.key) || '').toLowerCase();
        const paramKey = String((field && field.paramKey) || '').toLowerCase();
        const muapiKey = String((field && field.muapiKey) || '').toLowerCase();

        return wanted.includes(key) || wanted.includes(paramKey) || wanted.includes(muapiKey);
    }) || null;
}

function getFieldOptions(field) {
    if (!Array.isArray(field && field.options)) return [];

    return field.options.map(opt => {
        if (opt && typeof opt === 'object') {
            return String(opt.value || opt.id || opt.label || '');
        }

        return String(opt);
    }).filter(Boolean);
}

function orderedPricingKeys(pricing) {
    const preferred = ['720p', '1080p', '2k', '4k'];
    const keys = Object.keys(pricing || {}).filter(k => k !== 'default');

    return [
        ...preferred.filter(k => keys.includes(k)),
        ...keys.filter(k => !preferred.includes(k)),
    ];
}

function getDynamicAspectRatios(tool) {
    const field = getSchemaField(tool, ['aspect_ratio', 'aspectRatio']);
    const options = getFieldOptions(field);

    return options.length ? options : ['1:1', '9:16', '16:9'];
}

function getDynamicResolutions(tool) {
    const field = getSchemaField(tool, ['quality', 'resolution']);
    const options = getFieldOptions(field);

    if (options.length) return options;

    const pricingKeys = orderedPricingKeys((tool && tool.pricing) || {});
    return pricingKeys.length ? pricingKeys : ['720p'];
}

function getDynamicToolCost(tool, resolution = '720p') {
    const pricing = (tool && tool.pricing) || {};
    const selected = String(resolution || '720p');
    const value = pricing[selected] || pricing.default || tool.costCredits || tool.cost || 0;

    return Math.max(0, Math.ceil(Number(value) || 0));
}

function extractImageUrl(data) {
    return (data && data.url)
        || (data && data.image_url)
        || (data && data.output && data.output.url)
        || (data && data.output && data.output.image_url)
        || (data && data.output && data.output.outputs && data.output.outputs[0])
        || (data && data.outputs && data.outputs[0])
        || (data && data.data && data.data.url)
        || (data && data.data && data.data.image_url)
        || (data && data.data && data.data.outputs && data.data.outputs[0])
        || (data && data.images && data.images[0] && data.images[0].url)
        || null;
}

export function ImageStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center bg-app-bg relative p-2 md:p-6 pb-24 overflow-y-auto custom-scrollbar overflow-x-hidden';

    let selectedModel = ACTIVE_T2I[0].id;
    let selectedModelName = ACTIVE_T2I[0].name;
    let selectedAr = '1:1';
    let uploadedImageUrls = [];
    let imageMode = false;
    let negativePrompt = '';
    let showAdvanced = false;
    let selectedStyle = 'Ninguno';
    let selectedResolution = '720p';
    let dynamicT2I = [];
    let dynamicFieldValues = {};
    let dynamicFieldsPanel = null;
    let publicToolsLoaded = false;

    const dd = createDropdownSystem();

    const getCurrentModels = () => {
        return imageMode ? ACTIVE_I2I : [...ACTIVE_T2I, ...dynamicT2I];
    };

    const getSelectedDynamicTool = () => {
        if (!isDynamicModelId(selectedModel)) return null;
        return dynamicT2I.find(tool => tool.id === selectedModel) || null;
    };

    const getCurrentAspectRatios = (id) => {
        const tool = dynamicT2I.find(t => t.id === id);
        if (tool) return getDynamicAspectRatios(tool);

        return imageMode ? getAspectRatiosForI2IModel(id) : getAspectRatiosForModel(id);
    };

    const getCurrentResolutions = (id) => {
        const tool = dynamicT2I.find(t => t.id === id);
        if (tool) return getDynamicResolutions(tool);

        return imageMode ? getResolutionsForI2IModel(id) : getResolutionsForModel(id);
    };

    const getCurrentCost = () => {
        const tool = getSelectedDynamicTool();
        if (tool) return getDynamicToolCost(tool, selectedResolution);

        return getModelCost(selectedModel, selectedResolution);
    };

    function renderDynamicFields() {
        if (!dynamicFieldsPanel) return;

        const tool = getSelectedDynamicTool();
        dynamicFieldsPanel.innerHTML = '';

        if (!tool || imageMode) {
            dynamicFieldsPanel.style.display = 'none';
            return;
        }

        const baseKeys = new Set([
            'prompt',
            'aspect_ratio',
            'aspectratio',
            'quality',
            'resolution'
        ]);

        const fields = (Array.isArray(tool.schema) ? tool.schema : []).filter(field => {
            const key = String((field && field.key) || '').toLowerCase();
            const paramKey = String((field && field.paramKey) || '').toLowerCase();

            return !baseKeys.has(key) && !baseKeys.has(paramKey);
        });

        if (!fields.length) {
            dynamicFieldsPanel.style.display = 'none';
            return;
        }

        dynamicFieldsPanel.style.display = 'block';

        const inner = document.createElement('div');
        inner.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:16px;padding:14px 16px;display:grid;gap:12px';

        const title = document.createElement('div');
        title.style.cssText = 'color:#fff;font-size:12px;font-weight:800';
        title.textContent = 'Opciones de ' + tool.name;
        inner.appendChild(title);

        fields.forEach(field => {
            const key = field.key;
            if (!key) return;

            const wrap = document.createElement('label');
            wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';

            const label = document.createElement('span');
            label.style.cssText = 'color:#666;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em';
            label.textContent = field.label || key;
            wrap.appendChild(label);

            let input;

            if (field.type === 'textarea') {
                input = document.createElement('textarea');
                input.rows = 3;
                input.style.resize = 'vertical';
            } else if (field.type === 'select') {
                input = document.createElement('select');

                getFieldOptions(field).forEach(option => {
                    const opt = document.createElement('option');
                    opt.value = option;
                    opt.textContent = option;
                    input.appendChild(opt);
                });
            } else if (field.type === 'number' || field.type === 'range') {
                input = document.createElement('input');
                input.type = 'number';
            } else if (field.type === 'boolean') {
                input = document.createElement('select');

                [
                    { value: 'true', label: 'Sí' },
                    { value: 'false', label: 'No' },
                ].forEach(option => {
                    const opt = document.createElement('option');
                    opt.value = option.value;
                    opt.textContent = option.label;
                    input.appendChild(opt);
                });
            } else {
                input = document.createElement('input');
                input.type = 'text';
            }

            input.placeholder = field.placeholder || '';
            input.value = dynamicFieldValues[key] || field.default || '';
            input.style.cssText = 'width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 12px;color:#fff;font-size:13px;outline:none;font-family:inherit';

            input.addEventListener('input', () => {
                dynamicFieldValues[key] = input.value;
            });

            input.addEventListener('change', () => {
                dynamicFieldValues[key] = input.value;
            });

            wrap.appendChild(input);
            inner.appendChild(wrap);
        });

        dynamicFieldsPanel.appendChild(inner);
    }

    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.style.cssText = 'display:flex;align-items:center;gap:8px;padding:11px 22px;background:#3b82f6;border:none;border-radius:100px;cursor:pointer;font-size:13px;font-weight:700;color:#fff;transition:background .15s;white-space:nowrap;flex-shrink:0;-webkit-tap-highlight-color:transparent';
    generateBtn.addEventListener('mouseenter', () => generateBtn.style.background = '#60a5fa');
    generateBtn.addEventListener('mouseleave', () => generateBtn.style.background = '#3b82f6');

    const updateControlsForMode = () => {
        const ars = getCurrentAspectRatios(selectedModel);
        if (ars && ars.length && !ars.includes(selectedAr)) selectedAr = ars[0];

        const mLabel = container.querySelector('#model-btn-label');
        if (mLabel) mLabel.textContent = selectedModelName;

        const aLabel = container.querySelector('#ar-btn-label');
        if (aLabel) aLabel.textContent = selectedAr;

        const validRes = getCurrentResolutions(selectedModel);

        if (validRes && validRes.length && !validRes.includes(selectedResolution)) {
            selectedResolution = validRes[0];
        }

        const qBtn = container.querySelector('#quality-btn');

        if (qBtn) {
            qBtn.style.display = validRes && validRes.length ? 'flex' : 'none';

            const qLabel = container.querySelector('#quality-btn-label');
            if (validRes && validRes.length && qLabel) qLabel.textContent = selectedResolution;
        }

        const cost = getCurrentCost();

        generateBtn.innerHTML = 'Generar <span style="background:rgba(255,255,255,.2);padding:2px 8px;border-radius:100px;font-size:11px;font-family:monospace">' + cost + ' CR</span>';
        renderDynamicFields();
    };

    const hero = document.createElement('div');
    hero.className = 'flex flex-col items-center mb-6 md:mb-16 mt-4 md:mt-0 animate-fade-in-up shrink-0';
    hero.innerHTML = `
        <div class="mb-6 md:mb-10 relative group">
            <div class="absolute inset-0 bg-[#3B82F6]/20 blur-[60px] md:blur-[100px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-1000"></div>
            <div class="relative w-16 h-16 md:w-32 md:h-32 bg-[#0a0a0a] rounded-2xl md:rounded-3xl flex items-center justify-center border border-white/5 overflow-hidden">
                <div class="w-10 h-10 md:w-16 md:h-16 bg-[#3B82F6]/10 rounded-xl flex items-center justify-center border border-[#3B82F6]/20 relative z-10">
                    <svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[#3B82F6]"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
            </div>
        </div>
        <h1 class="text-xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-2 md:mb-4 text-center px-4">Estudio de Imagen</h1>
        <p class="text-white/40 text-[10px] md:text-sm font-medium text-center px-4">Crea y edita imágenes increíbles con IA</p>
    `;
    container.appendChild(hero);

    const promptWrapper = document.createElement('div');
    promptWrapper.className = 'w-full max-w-4xl relative z-40 shrink-0 px-2 md:px-0';

    const bar = document.createElement('div');
    bar.style.cssText = 'background:#111;border:1px solid #2a2a2a;border-radius:24px;padding:16px 20px;display:flex;flex-direction:column;gap:14px';

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;align-items:flex-start;gap:12px';

    function applyPickedImages(urls) {
        uploadedImageUrls = (urls || []).filter(Boolean);
        if (!uploadedImageUrls.length) return;

        if (!imageMode) {
            imageMode = true;
            selectedModel = ACTIVE_I2I[0].id;
            selectedModelName = ACTIVE_I2I[0].name;
            updateControlsForMode();
            picker.setMaxImages(getMaxImagesForI2IModel(selectedModel));
        }

        textarea.placeholder = uploadedImageUrls.length > 1
            ? uploadedImageUrls.length + ' imágenes seleccionadas'
            : 'Describe cómo editar esta imagen (opcional)';
    }

    async function uploadDroppedImageFile(file, token) {
        const fd = new FormData();
        fd.append('file', file);

        const resp = await fetch('/api/v1/upload_file', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + token,
            },
            body: fd,
        });

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            throw new Error(data.error || data.message || 'Error subiendo imagen: ' + resp.status);
        }

        const url = data.url
            || data.file_url
            || data.image_url
            || (data.output && data.output.url)
            || (data.data && data.data.url)
            || (data.output && data.output.outputs && data.output.outputs[0])
            || (data.outputs && data.outputs[0]);

        if (!url) throw new Error('No se recibió URL de la imagen subida.');

        return url;
    }

    async function handleDroppedImageFiles(fileList) {
        if (!auth.currentUser) {
            alert('Debes iniciar sesión para subir imágenes.');
            return;
        }

        const files = Array.from(fileList || []).filter(file => file.type.startsWith('image/'));

        if (!files.length) {
            alert('Arrastra una imagen válida.');
            return;
        }

        imageMode = true;
        selectedModel = ACTIVE_I2I[0].id;
        selectedModelName = ACTIVE_I2I[0].name;

        const maxImages = getMaxImagesForI2IModel(selectedModel) || 1;
        const selectedFiles = files.slice(0, maxImages);

        updateControlsForMode();
        picker.setMaxImages(maxImages);

        const oldBorder = bar.style.border;
        const oldBackground = bar.style.background;

        bar.style.border = '1px solid #3b82f6';
        bar.style.background = '#0b1220';
        textarea.placeholder = 'Subiendo ' + selectedFiles.length + ' imagen(es)...';

        try {
            const token = await auth.currentUser.getIdToken();
            const urls = [];

            for (const file of selectedFiles) {
                const url = await uploadDroppedImageFile(file, token);
                urls.push(url);
            }

            applyPickedImages(urls);
        } catch (err) {
            alert(err.message || 'No se pudo subir la imagen.');
            textarea.placeholder = 'Describe la imagen que quieres crear...';
        } finally {
            bar.style.border = oldBorder;
            bar.style.background = oldBackground;
        }
    }

    const picker = createUploadPicker({
        anchorContainer: container,
        onSelect: ({ url, urls }) => {
            applyPickedImages(urls || [url]);
        },
        onClear: () => {
            uploadedImageUrls = [];
            imageMode = false;
            selectedModel = ACTIVE_T2I[0].id;
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
    textarea.style.cssText = 'flex:1;background:transparent;border:none;color:#fff;font-size:15px;resize:none;outline:none;padding-top:4px;line-height:1.5;min-height:40px;max-height:200px;overflow-y:auto;font-family:inherit';
    textarea.rows = 1;
    textarea.oninput = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, window.innerWidth < 768 ? 120 : 200) + 'px';
    };
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            generateBtn.click();
        }
    });

    topRow.appendChild(textarea);
    bar.appendChild(topRow);

    let imageDragDepth = 0;

    function setImageDropActive(active) {
        bar.style.border = active ? '1px solid #3b82f6' : '1px solid #2a2a2a';
        bar.style.background = active ? '#0b1220' : '#111';
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        bar.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (eventName === 'dragenter') imageDragDepth++;
            setImageDropActive(true);
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        bar.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();

            imageDragDepth = Math.max(0, imageDragDepth - 1);

            if (eventName === 'drop') {
                imageDragDepth = 0;
                setImageDropActive(false);
                handleDroppedImageFiles(e.dataTransfer && e.dataTransfer.files);
                return;
            }

            if (imageDragDepth === 0) setImageDropActive(false);
        });
    });

    const bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding-top:12px;border-top:1px solid #1f1f1f';

    const controlsLeft = document.createElement('div');
    controlsLeft.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;flex:1;min-width:0';

    const modelBtn = createControlBtn(
        '<div style="width:16px;height:16px;background:#3b82f6;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#fff;flex-shrink:0">K</div>',
        selectedModelName,
        'model-btn'
    );

    const arBtn = createControlBtn(
        '<svg style="opacity:.5;flex-shrink:0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
        selectedAr,
        'ar-btn'
    );

    const qualityBtn = createControlBtn(
        '<svg style="opacity:.5;flex-shrink:0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 2L3 6v15a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"/></svg>',
        '720p',
        'quality-btn'
    );

    const advancedBtn = createControlBtn(
        '<svg style="opacity:.5;flex-shrink:0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>',
        'Avanzado',
        'advanced-btn'
    );

    controlsLeft.appendChild(modelBtn);
    controlsLeft.appendChild(arBtn);
    controlsLeft.appendChild(qualityBtn);
    controlsLeft.appendChild(advancedBtn);
    bottomRow.appendChild(controlsLeft);
    bottomRow.appendChild(generateBtn);
    bar.appendChild(bottomRow);
    promptWrapper.appendChild(bar);

    dynamicFieldsPanel = document.createElement('div');
    dynamicFieldsPanel.style.cssText = 'display:none;margin-top:12px';
    promptWrapper.appendChild(dynamicFieldsPanel);

    container.appendChild(promptWrapper);

    container.appendChild(Object.assign(document.createElement('div'), {
        style: 'text-align:center;padding:8px 16px',
        innerHTML: '<p style="color:#333;font-size:11px">Puedes lanzar varias generaciones a la vez sin esperar</p>'
    }));

    const advancedPanel = document.createElement('div');
    advancedPanel.style.cssText = 'display:none;width:100%;max-width:56rem;margin-top:12px;padding:0 8px';
    advancedPanel.innerHTML = `
        <div style="background:#111;border:1px solid #2a2a2a;border-radius:16px;padding:16px 20px;display:flex;flex-direction:column;gap:14px">
            <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid #1f1f1f">
                <span style="color:#fff;font-size:13px;font-weight:700">Opciones avanzadas</span>
                <button id="close-adv-btn" style="background:none;border:none;cursor:pointer;color:#555;padding:4px">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
            <div>
                <div style="color:#555;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Estilos predefinidos</div>
                <div id="style-presets" style="display:flex;flex-wrap:wrap;gap:6px"></div>
            </div>
            <div>
                <div style="color:#555;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Prompt negativo</div>
                <input type="text" id="neg-prompt" placeholder="Qué excluir de la imagen..." style="width:100%;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;outline:none;font-family:inherit">
            </div>
        </div>
    `;
    container.appendChild(advancedPanel);

    const presetsContainer = advancedPanel.querySelector('#style-presets');

    STYLE_PRESETS.forEach(s => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'padding:6px 12px;background:' + (s === selectedStyle ? '#3b82f622' : '#1a1a1a') + ';border:' + (s === selectedStyle ? '1px solid #3b82f666' : '1px solid #2a2a2a') + ';border-radius:100px;color:' + (s === selectedStyle ? '#60a5fa' : '#666') + ';font-size:11px;font-weight:600;cursor:pointer;transition:all .15s';
        btn.textContent = s;

        btn.addEventListener('click', () => {
            selectedStyle = s;

            presetsContainer.querySelectorAll('button').forEach(b => {
                const active = b.textContent === s;
                b.style.background = active ? '#3b82f622' : '#1a1a1a';
                b.style.border = active ? '1px solid #3b82f666' : '1px solid #2a2a2a';
                b.style.color = active ? '#60a5fa' : '#666';
            });
        });

        presetsContainer.appendChild(btn);
    });

    advancedPanel.querySelector('#neg-prompt').addEventListener('input', (e) => {
        negativePrompt = e.target.value;
    });

    advancedPanel.querySelector('#close-adv-btn').addEventListener('click', () => advancedBtn.click());

    advancedBtn.addEventListener('click', () => {
        showAdvanced = !showAdvanced;
        advancedPanel.style.display = showAdvanced ? 'block' : 'none';

        const l = container.querySelector('#advanced-btn-label');
        if (l) l.textContent = showAdvanced ? 'Ocultar' : 'Avanzado';
    });

    modelBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        dd.openModels(getCurrentModels(), selectedModel, modelBtn, (id) => {
            const m = getCurrentModels().find(x => x.id === id);
            if (!m) return;

            selectedModel = m.id;
            selectedModelName = m.name;

            if (isDynamicModelId(selectedModel)) {
                imageMode = false;
                uploadedImageUrls = [];
                dynamicFieldValues = {};
                textarea.placeholder = 'Describe la imagen que quieres crear...';
            }

            updateControlsForMode();
        });
    });

    arBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        const ars = (getCurrentAspectRatios(selectedModel) || []).map(v => ({ id: v, name: v }));

        dd.openList('Relación de aspecto', ars, selectedAr, arBtn, (val) => {
            selectedAr = val;

            const l = container.querySelector('#ar-btn-label');
            if (l) l.textContent = val;
        });
    });

    qualityBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        const res = (getCurrentResolutions(selectedModel) || []).map(v => ({ id: v, name: v }));

        dd.openList('Resolución', res, container.querySelector('#quality-btn-label') ? container.querySelector('#quality-btn-label').textContent : '', qualityBtn, (val) => {
            selectedResolution = val;

            const l = container.querySelector('#quality-btn-label');
            if (l) l.textContent = val;

            updateControlsForMode();
        });
    });

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
        card.innerHTML = '<img src="' + entry.url + '" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy"><div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 md:p-4 flex flex-col justify-end"><p class="text-white text-[10px] md:text-xs line-clamp-2 leading-tight">' + (entry.prompt || '') + '</p></div>';

        card.onclick = async () => {
            const blob = await fetch(entry.url).then(r => r.blob());
            window.open(URL.createObjectURL(blob), '_blank');
        };

        if (isPrepend) galleryGrid.prepend(card);
        else galleryGrid.appendChild(card);
    };

    const loadHistory = async (user) => {
        try {
            const q = query(
                collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'generations'),
                orderBy('createdAt', 'desc'),
                limit(20)
            );

            const snap = await getDocs(q);
            snap.forEach(d => renderCard({ id: d.id, ...d.data() }));
        } catch (e) {}
    };

    const loadPublicTools = async () => {
        if (publicToolsLoaded || !auth.currentUser) return;
        publicToolsLoaded = true;

        try {
            const q = query(
                collection(db, 'public_ai_tools'),
                where('enabled', '==', true)
            );

            const snap = await getDocs(q);

            dynamicT2I = snap.docs
                .map(d => {
                    const data = d.data() || {};

                    return {
                        id: dynamicModelId(d.id),
                        toolId: d.id,
                        name: data.name || d.id,
                        desc: data.description || '',
                        section: data.section || '',
                        pricing: data.pricing || {},
                        schema: Array.isArray(data.schema) ? data.schema : [],
                        dynamic: true,
                    };
                })
                .filter(tool => tool.section === 'kreateimage');

            updateControlsForMode();
        } catch (e) {
            console.warn('[KreateImage] No se pudieron cargar herramientas públicas:', e.message);
        }
    };

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await loadPublicTools();
            loadHistory(user);
        }
    });

    generateBtn.addEventListener('click', async () => {
        const promptText = textarea.value.trim();

        if (!auth.currentUser) return alert('Debes iniciar sesión.');
        if (!imageMode && !promptText) return alert('Por favor, escribe un prompt.');

        const dynamicTool = getSelectedDynamicTool();
        const isDynamicTool = !imageMode && !!dynamicTool;

        galleryHeader.classList.remove('hidden');

        const loadingCard = document.createElement('div');
        loadingCard.className = 'relative aspect-square rounded-xl md:rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex flex-col items-center justify-center';
        loadingCard.innerHTML = '<div style="width:32px;height:32px;border:3px solid #3b82f633;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:8px"></div><span style="font-size:10px;font-weight:700;color:#60a5fa">Generando...</span>';

        galleryGrid.prepend(loadingCard);

        textarea.value = '';
        textarea.style.height = 'auto';

        try {
            let finalPrompt = promptText || (imageMode ? 'Edición de imagen' : '');

            if (selectedStyle && selectedStyle !== 'Ninguno') {
                finalPrompt += ', estilo ' + selectedStyle.toLowerCase();
            }

            const token = await auth.currentUser.getIdToken();

            let endpointLabel = imageMode ? 'generate/image/edit' : 'generate/image/create';
            let req;

            if (isDynamicTool) {
                endpointLabel = 'tools/run:' + dynamicTool.toolId;

                req = await fetch('/api/v1/tools/run', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + token,
                    },
                    body: JSON.stringify({
                        toolId: dynamicTool.toolId,
                        inputs: {
                            ...dynamicFieldValues,
                            prompt: finalPrompt,
                            aspect_ratio: selectedAr,
                            quality: selectedResolution,
                            resolution: selectedResolution,
                            ...(negativePrompt && { negative_prompt: negativePrompt }),
                        },
                    }),
                });
            } else {
                const route = imageMode ? 'generate/image/edit' : 'generate/image/create';

                req = await fetch('/api/v1/' + route, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + token,
                    },
                    body: JSON.stringify({
                        prompt: finalPrompt,
                        aspect_ratio: selectedAr,
                        resolution: selectedResolution,
                        ...(imageMode && { images_list: uploadedImageUrls }),
                        ...(negativePrompt && { negative_prompt: negativePrompt }),
                    }),
                });
            }

            let res = await req.json().catch(() => ({}));

            if (!req.ok) {
                throw new Error(res.error || 'Error en el servidor: ' + req.status);
            }

            const requestId = res.request_id || res.id || (res.output && res.output.id) || null;
            let generationTaskRef = null;

            if (requestId && auth.currentUser) {
                generationTaskRef = await saveGenerationTask({
                    type: 'image',
                    endpoint: endpointLabel,
                    requestId,
                    prompt: finalPrompt,
                    userId: auth.currentUser.uid,
                }).catch(() => null);
            }

            let imageUrl = extractImageUrl(res);

            if (requestId && !imageUrl) {
                let attempts = 0;

                while (attempts < 60) {
                    await new Promise(r => setTimeout(r, 2000));
                    attempts++;

                    const poll = await fetch('/api/v1/predictions/' + requestId + '/result', {
                        headers: {
                            Authorization: 'Bearer ' + token,
                        },
                    });

                    const p = await poll.json().catch(() => ({}));

                    if (!poll.ok) {
                        throw new Error(p.error || 'Error consultando resultado: ' + poll.status);
                    }

                    imageUrl = extractImageUrl(p);

                    if (imageUrl) {
                        res = { ...p, url: imageUrl };
                        break;
                    }

                    const status = String(
                        p.status
                        || (p.output && p.output.status)
                        || (p.data && p.data.status)
                        || ''
                    ).toLowerCase();

                    if (status === 'failed' || status === 'error') {
                        throw new Error(p.error || p.message || 'Error en la generación.');
                    }
                }
            }

            if (imageUrl && !res.url) res.url = imageUrl;

            if (generationTaskRef && res.url) {
                updateDoc(generationTaskRef, {
                    status: 'completed',
                    result_url: res.url,
                    updatedAt: serverTimestamp(),
                }).catch(() => {});
            }

            if (!res || !res.url) throw new Error('No se recibió URL de la imagen.');

            const entry = {
                url: res.url,
                prompt: finalPrompt,
                model: isDynamicTool ? dynamicTool.toolId : selectedModel,
                aspect_ratio: selectedAr,
                createdAt: serverTimestamp(),
            };

            const docRef = await addDoc(
                collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', auth.currentUser.uid, 'generations'),
                entry
            );

            loadingCard.remove();
            renderCard({ id: docRef.id, ...entry }, true);

        } catch (e) {
            loadingCard.innerHTML = `
                <div class="absolute inset-0" style="background:#ef444411"></div>
                <div class="z-10 flex flex-col items-center gap-2 p-3 text-center">
                    <span style="font-size:18px;color:#f87171">!</span>
                    <span style="font-size:9px;font-weight:700;color:#f87171">Error al generar</span>
                    <span style="font-size:8px;color:#555">${String(e.message || '').slice(0, 80)}</span>
                    <button onclick="this.closest('.aspect-square').remove()" style="margin-top:4px;background:#ffffff11;border:1px solid #ffffff22;border-radius:8px;padding:4px 10px;font-size:9px;color:#fff;cursor:pointer">Cerrar</button>
                </div>
            `;
        }
    });

    updateControlsForMode();
    return container;
}
```
