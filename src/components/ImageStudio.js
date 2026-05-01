import { muapi } from '../lib/muapi.js';
import {
    t2iModels, getAspectRatiosForModel, getResolutionsForModel, getQualityFieldForModel,
    i2iModels, getAspectRatiosForI2IModel, getResolutionsForI2IModel, getQualityFieldForI2IModel,
    getMaxImagesForI2IModel
} from '../lib/models.js';
import { ENHANCE_TAGS, QUICK_PROMPTS } from '../lib/promptUtils.js';
import { AuthModal } from './AuthModal.js';
import { createUploadPicker } from './UploadPicker.js';
import { savePendingJob, removePendingJob, getPendingJobs } from '../lib/pendingJobs.js';

import { auth, db, APP_ID } from '../lib/firebase.js';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

function createInlineInstructions(type) {
    const el = document.createElement('div');
    el.className = 'w-full text-center text-white/30 text-sm flex flex-col items-center gap-2 py-2';
    const icon = type === 'image' ? '🖼️' : '🎬';
    el.innerHTML = `
        <p>${icon} Escribe un prompt arriba y haz clic en <span class="text-[#FFB000] font-semibold">Generar</span> para crear tu ${type === 'image' ? 'imagen' : 'vídeo'}.</p>
        <p class="text-xs text-white/20">Consejo: Sé descriptivo — incluye estilo, iluminación, estado de ánimo y el sujeto para obtener los mejores resultados.</p>
    `;
    return el;
}

export function ImageStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center justify-center bg-app-bg relative p-4 md:p-6 overflow-y-auto custom-scrollbar overflow-x-hidden';

    // --- State ---
    const defaultModel = t2iModels[0];
    let selectedModel = defaultModel.id;
    let selectedModelName = defaultModel.name;
    let selectedAr = defaultModel.inputs?.aspect_ratio?.default || '1:1';
    let dropdownOpen = null;
    let uploadedImageUrls = []; 
    let imageMode = false; 

    // Advanced parameters state
    let negativePrompt = '';
    let guidanceScale = 7.5;
    let steps = 25;
    let seed = -1;
    let showAdvanced = false;
    let selectedStyle = 'Ninguno';
    let batchCount = 1;

    // New advanced controls
    let customWidth = 0;  
    let customHeight = 0;
    let referenceStrength = 50;  
    let selectedLora = '';  
    let loraWeight = 1.0;

    // Quick tools panel state
    let showToolsPanel = false;

    const getCurrentModels = () => imageMode ? i2iModels : t2iModels;
    const getCurrentAspectRatios = (id) => imageMode ? getAspectRatiosForI2IModel(id) : getAspectRatiosForModel(id);
    const getCurrentResolutions = (id) => imageMode ? getResolutionsForI2IModel(id) : getResolutionsForModel(id);
    const getCurrentQualityField = (id) => imageMode ? getQualityFieldForI2IModel(id) : getQualityFieldForModel(id);

    // ==========================================
    // 1. HERO SECTION
    // ==========================================
    const hero = document.createElement('div');
    hero.className = 'flex flex-col items-center mb-10 md:mb-20 animate-fade-in-up transition-all duration-700';
    hero.innerHTML = `
        <div class="mb-10 relative group">
             <div class="absolute inset-0 bg-[#3B82F6]/20 blur-[100px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-1000"></div>
             <div class="relative w-24 h-24 md:w-32 md:h-32 bg-[#0a0a0a] rounded-3xl flex items-center justify-center border border-white/5 overflow-hidden">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-[#3B82F6] opacity-20 absolute -right-4 -bottom-4">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                </svg>
                <div class="w-16 h-16 bg-[#3B82F6]/10 rounded-2xl flex items-center justify-center border border-[#3B82F6]/20 shadow-glow relative z-10">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-[#3B82F6]">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                    </svg>
                </div>
                <div class="absolute top-4 right-4 text-[#FFB000] animate-pulse">✨</div>
             </div>
        </div>
        <h1 class="text-2xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-4 selection:bg-[#FFB000] selection:text-black text-center px-4">Estudio de Imagen</h1>
        <p class="text-white/50 text-sm font-medium tracking-wide opacity-60">Transforma imágenes con IA — escala, estiliza, anima y más</p>
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

    const picker = createUploadPicker({
        anchorContainer: container,
        onSelect: ({ url, urls }) => {
            uploadedImageUrls = urls || [url];
            if (!imageMode) {
                imageMode = true;
                selectedModel = i2iModels[0].id;
                selectedModelName = i2iModels[0].name;
                selectedAr = getAspectRatiosForI2IModel(selectedModel)[0];
                document.getElementById('model-btn-label').textContent = selectedModelName;
                document.getElementById('ar-btn-label').textContent = selectedAr;
                const validResolutions = getResolutionsForI2IModel(selectedModel);
                qualityBtn.style.display = validResolutions.length > 0 ? 'flex' : 'none';
                if (validResolutions.length > 0) document.getElementById('quality-btn-label').textContent = validResolutions[0];
                picker.setMaxImages(getMaxImagesForI2IModel(selectedModel));
            }
            textarea.placeholder = uploadedImageUrls.length > 1
                ? `${uploadedImageUrls.length} imágenes seleccionadas — describe la transformación (opcional)`
                : 'Describe cómo transformar esta imagen (opcional)';
        },
        onClear: () => {
            uploadedImageUrls = [];
            imageMode = false;
            selectedModel = t2iModels[0].id;
            selectedModelName = t2iModels[0].name;
            selectedAr = getAspectRatiosForModel(selectedModel)[0];
            document.getElementById('model-btn-label').textContent = selectedModelName;
            document.getElementById('ar-btn-label').textContent = selectedAr;
            const t2iResolutions = getResolutionsForModel(selectedModel);
            qualityBtn.style.display = t2iResolutions.length > 0 ? 'flex' : 'none';
            if (t2iResolutions.length > 0) document.getElementById('quality-btn-label').textContent = t2iResolutions[0];
            picker.setMaxImages(1);
            textarea.placeholder = 'Describe la imagen que quieres crear';
        }
    });
    topRow.appendChild(picker.trigger);
    container.appendChild(picker.panel);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Describe la imagen que quieres crear';
    textarea.className = 'flex-1 bg-transparent border-none text-white text-base md:text-xl placeholder:text-muted focus:outline-none resize-none pt-2.5 leading-relaxed min-h-[40px] max-h-[150px] md:max-h-[250px] overflow-y-auto custom-scrollbar';
    textarea.rows = 1;
    textarea.oninput = () => {
        textarea.style.height = 'auto';
        const maxHeight = window.innerWidth < 768 ? 150 : 250;
        textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
    };

    // --- NUEVO: ATAJO DE LA TECLA ENTER ---
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            generateBtn.click();
        }
    });
    // --------------------------------------

    topRow.appendChild(textarea);
    bar.appendChild(topRow);

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
        <div class="w-5 h-5 bg-[#3B82F6] rounded-md flex items-center justify-center shadow-lg shadow-[#3B82F6]/20">
            <span class="text-[10px] font-black text-white">M</span>
        </div>
    `, selectedModelName, 'model-btn', 'Seleccionar modelo de IA');

    const arBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
    `, selectedAr, 'ar-btn', 'Cambiar relación de aspecto');

    const qualityBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50"><path d="M6 2L3 6v15a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"/></svg>
    `, '720p', 'quality-btn', 'Ajustar calidad de salida');

    controlsLeft.appendChild(modelBtn);
    controlsLeft.appendChild(arBtn);
    controlsLeft.appendChild(qualityBtn);
    
    const advancedBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 001.82-.33 1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-1.82.33A1.65 1.65 0 0019.4 9a1.65 1.65 0 00-1.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    `, 'Avanzado', 'advanced-btn', 'Mostrar opciones avanzadas');
    controlsLeft.appendChild(advancedBtn);
    
    const toolsBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-white/50"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
    `, 'Herramientas', 'tools-btn', 'Inicios rápidos y mejorador de prompts');
    controlsLeft.appendChild(toolsBtn);

    const _initResolutions = getResolutionsForModel(defaultModel.id);
    qualityBtn.style.display = _initResolutions.length > 0 ? 'flex' : 'none';
    if (_initResolutions.length > 0) {
        const qlabel = qualityBtn.querySelector('#quality-btn-label');
        if (qlabel) qlabel.textContent = _initResolutions[0];
    }

    const generateBtn = document.createElement('button');
    generateBtn.className = 'bg-[#FFB000] text-black px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-[1.5rem] font-black text-sm md:text-base hover:shadow-[0_0_20px_rgba(255,176,0,0.4)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2.5 w-full sm:w-auto shadow-lg';
    generateBtn.setAttribute('data-tooltip', 'Generar imagen con IA');
    generateBtn.innerHTML = `Generar ✨`;

    bottomRow.appendChild(controlsLeft);
    bottomRow.appendChild(generateBtn);
    bar.appendChild(bottomRow);
    promptWrapper.appendChild(bar);
    container.appendChild(promptWrapper);

    const inlineInstructions = createInlineInstructions('image');
    inlineInstructions.classList.add('max-w-4xl', 'mt-8');
    container.appendChild(inlineInstructions);

    // ==========================================
    // 3. QUICK TOOLS PANEL
    // ==========================================
    const toolsPanel = document.createElement('div');
    toolsPanel.className = 'w-full max-w-4xl mt-6 animate-fade-in-up hidden';
    toolsPanel.id = 'tools-panel';
    
    toolsPanel.innerHTML = `
        <div class="bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
            <div class="flex items-center justify-between pb-3 border-b border-white/5">
                <h3 class="text-sm font-bold text-white">Herramientas Rápidas</h3>
                <button id="close-tools-btn" class="text-white/40 hover:text-white transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
            
            <div class="flex flex-col lg:flex-row gap-6">
                <div class="flex-1">
                    <h4 class="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Inicios Rápidos</h4>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        ${QUICK_PROMPTS.map(q => `
                            <button class="quick-starter-btn px-3 py-2 rounded-lg text-xs font-bold bg-white/5 text-white/50 hover:bg-white/10 hover:text-[#FFB000] transition-all text-left border border-white/5 hover:border-[#FFB000]/30" data-prompt="${q.prompt}">
                                ${q.label}
                            </button>
                        `).join('')}
                    </div>
                </div>
                
                <div class="flex-1">
                    <h4 class="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Mejorador de Prompt</h4>
                    <div class="flex flex-col gap-3">
                        <input type="text" id="base-prompt-input" 
                            placeholder="Escribe el prompt base..."
                            class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#3B82F6]/50 transition-colors">
                        
                        <div>
                            <label class="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2 block">Etiquetas de Mejora</label>
                            <div id="enhance-tags-area" class="flex flex-wrap gap-1.5">
                                ${Object.entries(ENHANCE_TAGS).map(([category, tags]) => 
                                    tags.map(tag => `<button class="enhance-tag-btn px-2 py-1 rounded-full text-[10px] font-bold bg-white/5 text-white/50 hover:bg-white/10 transition-all" data-tag="${tag}">${tag}</button>`).join('')
                                ).join('')}
                            </div>
                        </div>
                        
                        <div class="flex flex-col gap-2">
                            <label class="text-[10px] font-bold text-white/30 uppercase tracking-wider">Prompt Mejorado</label>
                            <div id="enhanced-prompt-display" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs min-h-[40px] text-white/30">Tu prompt mejorado aparecerá aquí...</div>
                            <div class="flex gap-2">
                                <button id="copy-enhanced-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-white/50 hover:bg-white/10 transition-all">
                                    Copiar
                                </button>
                                <button id="use-enhanced-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FFB000] text-black hover:shadow-[0_0_10px_rgba(255,176,0,0.3)] transition-all">
                                    Usar en Generador
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(toolsPanel);

    // ==========================================
    // 4. ADVANCED OPTIONS PANEL
    // ==========================================
    const STYLE_PRESETS = ['Ninguno', 'Fotorrealista', 'Anime', 'Cinematográfico', 'Pintura al Óleo', 'Acuarela', 'Arte Digital', 'Arte Conceptual', 'Cyberpunk'];
    
    const advancedPanel = document.createElement('div');
    advancedPanel.className = 'w-full max-w-4xl mt-6 animate-fade-in-up hidden';
    advancedPanel.id = 'advanced-panel';
    advancedPanel.innerHTML = `
        <div class="bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
            <div class="flex items-center justify-between pb-3 border-b border-white/5">
                <h3 class="text-sm font-bold text-white">Opciones Avanzadas</h3>
                <button id="close-adv-btn" class="text-white/40 hover:text-white transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
            
            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-white/50 uppercase tracking-wider">Estilos Predefinidos</label>
                <div class="flex gap-2 flex-wrap">
                    ${STYLE_PRESETS.map(s => `<button class="style-preset-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-white/50 hover:bg-white/10 transition-all" data-style="${s}">${s}</button>`).join('')}
                </div>
            </div>
            
            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-white/50 uppercase tracking-wider">Prompt Negativo</label>
                <input type="text" id="negative-prompt-input" 
                    placeholder="Qué excluir de la imagen (ej. borroso, distorsionado, marcas de agua)"
                    class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#3B82F6]/50 transition-colors">
            </div>
            
            <div class="flex gap-4 flex-wrap">
                <div class="flex-1 min-w-[200px] flex flex-col gap-2">
                    <div class="flex items-center justify-between">
                        <label class="text-xs font-bold text-white/50 uppercase tracking-wider">Escala de Guía</label>
                        <span id="guidance-value" class="text-xs font-bold text-[#FFB000]">7.5</span>
                    </div>
                    <input type="range" id="guidance-slider" min="1" max="20" step="0.5" value="7.5" 
                        class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#FFB000]">
                </div>
                
                <div class="flex-1 min-w-[200px] flex flex-col gap-2">
                    <div class="flex items-center justify-between">
                        <label class="text-xs font-bold text-white/50 uppercase tracking-wider">Pasos</label>
                        <span id="steps-value" class="text-xs font-bold text-[#FFB000]">25</span>
                    </div>
                    <input type="range" id="steps-slider" min="1" max="50" step="1" value="25" 
                        class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#FFB000]">
                </div>
            </div>
            
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                    <label class="text-xs font-bold text-white/50 uppercase tracking-wider">Semilla</label>
                    <button id="randomize-seed-btn" class="text-xs font-bold text-[#3B82F6] hover:text-[#3B82F6]/80 transition-colors">Aleatorio</button>
                </div>
                <input type="number" id="seed-input" 
                    placeholder="-1 para aleatorio"
                    value="-1"
                    class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#3B82F6]/50 transition-colors">
            </div>
            
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                    <label class="text-xs font-bold text-white/50 uppercase tracking-wider">Cantidad de Imágenes</label>
                    <span id="batch-value" class="text-xs font-bold text-[#FFB000]">1</span>
                </div>
                <input type="range" id="batch-slider" min="1" max="4" step="1" value="1" 
                    class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#FFB000]">
            </div>
            
            <div class="flex gap-4 flex-wrap">
                <div class="flex-1 min-w-[120px] flex flex-col gap-2">
                    <label class="text-xs font-bold text-white/50 uppercase tracking-wider">Ancho</label>
                    <input type="number" id="width-input" 
                        placeholder="Auto"
                        value=""
                        class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#3B82F6]/50 transition-colors">
                </div>
                <div class="flex-1 min-w-[120px] flex flex-col gap-2">
                    <label class="text-xs font-bold text-white/50 uppercase tracking-wider">Alto</label>
                    <input type="number" id="height-input" 
                        placeholder="Auto"
                        value=""
                        class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#3B82F6]/50 transition-colors">
                </div>
            </div>
            
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                    <label class="text-xs font-bold text-white/50 uppercase tracking-wider">Fuerza de Referencia</label>
                    <span id="reference-strength-value" class="text-xs font-bold text-[#FFB000]">50%</span>
                </div>
                <input type="range" id="reference-strength-slider" min="0" max="100" step="5" value="50" 
                    class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#FFB000]">
                <p class="text-xs text-white/30">Cuánto preservar de las características de la imagen de referencia</p>
            </div>
            
            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-white/50 uppercase tracking-wider">Modelo LoRA (Opcional)</label>
                <input type="text" id="lora-input" 
                    placeholder="ej., civitai:1642876@1864626"
                    class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#3B82F6]/50 transition-colors">
                <div class="flex items-center gap-2 mt-1">
                    <label class="text-xs font-bold text-white/50">Peso LoRA:</label>
                    <input type="number" id="lora-weight-input" 
                        value="1.0" min="0" max="4" step="0.1"
                        class="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#3B82F6]/50 transition-colors">
                </div>
                <p class="text-xs text-white/30">Introduce un ID de modelo LoRA desde Civitai (formato: civitai:id@version)</p>
            </div>
        </div>
    `;
    container.appendChild(advancedPanel);

    const toggleAdvanced = () => {
        showAdvanced = !showAdvanced;
        advancedPanel.classList.toggle('hidden', !showAdvanced);
        document.getElementById('advanced-btn-label').textContent = showAdvanced ? 'Menos' : 'Avanzado';
    };
    
    advancedBtn.onclick = toggleAdvanced;
    const closeAdvBtn = advancedPanel.querySelector('#close-adv-btn');
    if (closeAdvBtn) closeAdvBtn.onclick = toggleAdvanced;
    
    const toggleTools = () => {
        showToolsPanel = !showToolsPanel;
        toolsPanel.classList.toggle('hidden', !showToolsPanel);
        if (showToolsPanel) {
            if (!showAdvanced) {
                showAdvanced = true;
                advancedPanel.classList.remove('hidden');
            }
        }
    };
    
    toolsBtn.onclick = toggleTools;
    const closeToolsBtn = toolsPanel.querySelector('#close-tools-btn');
    if (closeToolsBtn) closeToolsBtn.onclick = toggleTools;
    
    const quickStarterBtns = toolsPanel.querySelectorAll('.quick-starter-btn');
    quickStarterBtns.forEach(btn => {
        btn.onclick = () => {
            const prompt = btn.dataset.prompt;
            textarea.value = prompt;
            textarea.style.height = 'auto';
            const maxHeight = window.innerWidth < 768 ? 150 : 250;
            textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
            showToolsPanel = false;
            toolsPanel.classList.add('hidden');
        };
    });
    
    const enhanceSelectedTags = new Set();
    const basePromptInput = toolsPanel.querySelector('#base-prompt-input');
    const enhancedPromptDisplay = toolsPanel.querySelector('#enhanced-prompt-display');
    
    const updateEnhancedPrompt = () => {
        const base = basePromptInput?.value?.trim() || '';
        const tags = Array.from(enhanceSelectedTags).join(', ');
        const enhanced = [base, tags].filter(p => p).join(', ');
        if (enhancedPromptDisplay) {
            enhancedPromptDisplay.textContent = enhanced || 'Tu prompt mejorado aparecerá aquí...';
            enhancedPromptDisplay.classList.toggle('text-white/30', !enhanced);
        }
    };
    
    if (basePromptInput) {
        basePromptInput.oninput = updateEnhancedPrompt;
    }
    
    const enhanceTagBtns = toolsPanel.querySelectorAll('.enhance-tag-btn');
    enhanceTagBtns.forEach(btn => {
        btn.onclick = () => {
            const tag = btn.dataset.tag;
            if (enhanceSelectedTags.has(tag)) {
                enhanceSelectedTags.delete(tag);
                btn.classList.remove('bg-[#3B82F6]', 'text-white');
                btn.classList.add('bg-white/5', 'text-white/50');
            } else {
                enhanceSelectedTags.add(tag);
                btn.classList.remove('bg-white/5', 'text-white/50');
                btn.classList.add('bg-[#3B82F6]', 'text-white');
            }
            updateEnhancedPrompt();
        };
    });
    
    const copyEnhancedBtn = toolsPanel.querySelector('#copy-enhanced-btn');
    if (copyEnhancedBtn) {
        copyEnhancedBtn.onclick = () => {
            const text = enhancedPromptDisplay?.textContent || '';
            if (text && text !== 'Tu prompt mejorado aparecerá aquí...') {
                navigator.clipboard.writeText(text);
                copyEnhancedBtn.textContent = '¡Copiado!';
                setTimeout(() => { copyEnhancedBtn.textContent = 'Copiar'; }, 1500);
            }
        };
    }
    
    const useEnhancedBtn = toolsPanel.querySelector('#use-enhanced-btn');
    if (useEnhancedBtn) {
        useEnhancedBtn.onclick = () => {
            const text = enhancedPromptDisplay?.textContent || '';
            if (text && text !== 'Tu prompt mejorado aparecerá aquí...') {
                textarea.value = text;
                textarea.style.height = 'auto';
                const maxHeight = window.innerWidth < 768 ? 150 : 250;
                textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
                showToolsPanel = false;
                toolsPanel.classList.add('hidden');
            }
        };
    }
    
    const negPromptInput = advancedPanel.querySelector('#negative-prompt-input');
    if (negPromptInput) negPromptInput.oninput = (e) => { negativePrompt = e.target.value; };
    
    const guidanceSlider = advancedPanel.querySelector('#guidance-slider');
    const guidanceValue = advancedPanel.querySelector('#guidance-value');
    if (guidanceSlider && guidanceValue) {
        guidanceSlider.oninput = (e) => {
            guidanceScale = parseFloat(e.target.value);
            guidanceValue.textContent = guidanceScale;
        };
    }
    
    const stepsSlider = advancedPanel.querySelector('#steps-slider');
    const stepsValue = advancedPanel.querySelector('#steps-value');
    if (stepsSlider && stepsValue) {
        stepsSlider.oninput = (e) => {
            steps = parseInt(e.target.value);
            stepsValue.textContent = steps;
        };
    }
    
    const seedInput = advancedPanel.querySelector('#seed-input');
    if (seedInput) seedInput.oninput = (e) => { seed = parseInt(e.target.value) || -1; };
    
    const randSeedBtn = advancedPanel.querySelector('#randomize-seed-btn');
    if (randSeedBtn) {
        randSeedBtn.onclick = () => {
            seed = Math.floor(Math.random() * 999999999);
            if (seedInput) seedInput.value = seed;
        };
    }
    
    const batchSlider = advancedPanel.querySelector('#batch-slider');
    const batchValueEl = advancedPanel.querySelector('#batch-value');
    if (batchSlider && batchValueEl) {
        batchSlider.oninput = (e) => {
            batchCount = parseInt(e.target.value);
            batchValueEl.textContent = batchCount;
        };
    }
    
    const widthInput = advancedPanel.querySelector('#width-input');
    if (widthInput) {
        widthInput.oninput = (e) => { customWidth = parseInt(e.target.value) || 0; };
    }
    
    const heightInput = advancedPanel.querySelector('#height-input');
    if (heightInput) {
        heightInput.oninput = (e) => { customHeight = parseInt(e.target.value) || 0; };
    }
    
    const refStrengthSlider = advancedPanel.querySelector('#reference-strength-slider');
    const refStrengthValue = advancedPanel.querySelector('#reference-strength-value');
    if (refStrengthSlider && refStrengthValue) {
        refStrengthSlider.oninput = (e) => {
            referenceStrength = parseInt(e.target.value);
            refStrengthValue.textContent = referenceStrength + '%';
        };
    }
    
    const loraInput = advancedPanel.querySelector('#lora-input');
    if (loraInput) {
        loraInput.oninput = (e) => { selectedLora = e.target.value.trim(); };
    }
    
    const loraWeightInput = advancedPanel.querySelector('#lora-weight-input');
    if (loraWeightInput) {
        loraWeightInput.oninput = (e) => { loraWeight = parseFloat(e.target.value) || 1.0; };
    }
    
    advancedPanel.querySelectorAll('.style-preset-btn').forEach(btn => {
        btn.onclick = () => {
            selectedStyle = btn.dataset.style;
            advancedPanel.querySelectorAll('.style-preset-btn').forEach(b => {
                b.classList.remove('bg-[#3B82F6]/20', 'text-[#3B82F6]', 'border-[#3B82F6]/30');
                b.classList.add('bg-white/5', 'text-white/50');
            });
            btn.classList.add('bg-[#3B82F6]/20', 'text-[#3B82F6]', 'border-[#3B82F6]/30');
            btn.classList.remove('bg-white/5', 'text-white/50');
        };
    });

    // ==========================================
    // 3. DROPDOWNS 
    // ==========================================
    const dropdown = document.createElement('div');
    dropdown.className = 'absolute bottom-[102%] left-2 z-50 transition-all opacity-0 pointer-events-none scale-95 origin-bottom-left glass rounded-3xl p-3 translate-y-2 w-[calc(100vw-3rem)] max-w-xs shadow-4xl border border-white/10 flex flex-col bg-[#111]/95 backdrop-blur-xl';

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
                        <div class="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5 border border-white/5 focus-within:border-[#3B82F6]/50 transition-colors">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-white/30"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                            <input type="text" id="model-search" placeholder="Buscar modelos..." class="bg-transparent border-none text-xs text-white focus:ring-0 w-full p-0 outline-none">
                        </div>
                    </div>
                    <div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 py-2 shrink-0">Modelos Disponibles</div>
                    <div id="model-list-container" class="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2"></div>
                </div>
            `;
            const list = dropdown.querySelector('#model-list-container');

            const renderModels = (filter = '') => {
                list.innerHTML = '';
                const filtered = getCurrentModels().filter(m => m.name.toLowerCase().includes(filter.toLowerCase()) || m.id.toLowerCase().includes(filter.toLowerCase()));

                filtered.forEach(m => {
                    const item = document.createElement('div');
                    item.className = `flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all border border-transparent hover:border-white/5 ${selectedModel === m.id ? 'bg-white/5 border-white/5' : ''}`;
                    item.innerHTML = `
                        <div class="flex items-center gap-3.5">
                             <div class="w-10 h-10 ${m.family === 'kontext' ? 'bg-[#3B82F6]/10 text-[#3B82F6]' : m.family === 'effects' ? 'bg-purple-500/10 text-purple-400' : 'bg-[#FFB000]/10 text-[#FFB000]'} border border-white/5 rounded-xl flex items-center justify-center font-black text-sm shadow-inner uppercase">${m.name.charAt(0)}</div>
                             <div class="flex flex-col gap-0.5">
                                <span class="text-xs font-bold text-white tracking-tight">${m.name}</span>
                             </div>
                        </div>
                        ${selectedModel === m.id ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                    `;
                    item.onclick = (e) => {
                        e.stopPropagation();
                        selectedModel = m.id;
                        selectedModelName = m.name;
                        const availableArs = getCurrentAspectRatios(selectedModel);
                        selectedAr = availableArs[0];
                        document.getElementById('model-btn-label').textContent = selectedModelName;
                        document.getElementById('ar-btn-label').textContent = selectedAr;

                        const validResolutions = getCurrentResolutions(selectedModel);
                        qualityBtn.style.display = validResolutions.length > 0 ? 'flex' : 'none';
                        if (validResolutions.length > 0) {
                            document.getElementById('quality-btn-label').textContent = validResolutions[0];
                        }

                        if (imageMode) {
                            picker.setMaxImages(getMaxImagesForI2IModel(selectedModel));
                        }

                        closeDropdown();
                    };
                    list.appendChild(item);
                });
            };

            renderModels();

            const searchInput = dropdown.querySelector('#model-search');
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
                    document.getElementById('ar-btn-label').textContent = r;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);
        } else if (type === 'quality') {
            dropdown.classList.add('max-w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Resolución</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';

            const options = getCurrentResolutions(selectedModel);

            options.forEach(opt => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100">${opt}</span>
                     ${document.getElementById('quality-btn-label').textContent === opt ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    document.getElementById('quality-btn-label').textContent = opt;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);
        }

        // Position dropdown
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

    modelBtn.onclick = (e) => {
        e.stopPropagation();
        if (dropdownOpen === 'model') closeDropdown();
        else {
            dropdownOpen = 'model';
            showDropdown('model', modelBtn);
        }
    };

    arBtn.onclick = (e) => {
        e.stopPropagation();
        if (dropdownOpen === 'ar') closeDropdown();
        else {
            dropdownOpen = 'ar';
            showDropdown('ar', arBtn);
        }
    };

    qualityBtn.onclick = (e) => {
        e.stopPropagation();
        if (dropdownOpen === 'quality') closeDropdown();
        else {
            dropdownOpen = 'quality';
            showDropdown('quality', qualityBtn);
        }
    };

    window.onclick = () => closeDropdown();
    container.appendChild(dropdown);

    // ==========================================
    // 4. CANVAS AREA + HISTORY
    // ==========================================
    const generationHistory = [];

    const historySidebar = document.createElement('div');
    historySidebar.className = 'fixed right-0 top-0 h-full w-20 md:w-24 bg-black/60 backdrop-blur-xl border-l border-white/5 z-50 flex flex-col items-center py-4 gap-3 overflow-y-auto transition-all duration-500 translate-x-full opacity-0';
    historySidebar.id = 'history-sidebar';

    const historyLabel = document.createElement('div');
    historyLabel.className = 'text-[9px] font-bold text-white/50 uppercase tracking-widest mb-2 rotate-0';
    historyLabel.textContent = 'Historial';
    historySidebar.appendChild(historyLabel);

    const historyList = document.createElement('div');
    historyList.className = 'flex flex-col gap-2 w-full px-2';
    historySidebar.appendChild(historyList);

    container.appendChild(historySidebar);

    // Main canvas
    const canvas = document.createElement('div');
    canvas.className = 'absolute inset-0 flex flex-col items-center justify-center p-4 min-[800px]:p-16 z-10 opacity-0 pointer-events-none transition-all duration-1000 translate-y-10 scale-95';

    const imageContainer = document.createElement('div');
    imageContainer.className = 'relative group';

    const resultImg = document.createElement('img');
    resultImg.className = 'max-h-[60vh] max-w-[80vw] rounded-3xl shadow-3xl border border-white/10 interactive-glow object-contain';
    imageContainer.appendChild(resultImg);

    // Canvas Controls
    const canvasControls = document.createElement('div');
    canvasControls.className = 'mt-6 flex gap-3 opacity-0 transition-opacity delay-500 duration-500 justify-center';

    const regenerateBtn = document.createElement('button');
    regenerateBtn.className = 'bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white';
    regenerateBtn.textContent = '↻ Regenerar';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'bg-[#FFB000] text-black px-6 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(255,176,0,0.4)] hover:scale-105 active:scale-95';
    downloadBtn.textContent = '↓ Descargar';

    const newPromptBtn = document.createElement('button');
    newPromptBtn.className = 'bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white';
    newPromptBtn.textContent = '+ Nuevo';

    canvasControls.appendChild(regenerateBtn);
    canvasControls.appendChild(downloadBtn);
    canvasControls.appendChild(newPromptBtn);

    canvas.appendChild(imageContainer);
    canvas.appendChild(canvasControls);
    container.appendChild(canvas);

    const showImageInCanvas = (imageUrl) => {
        hero.classList.add('hidden');
        promptWrapper.classList.add('hidden');

        resultImg.src = imageUrl;
        resultImg.onload = () => {
            canvas.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10', 'scale-95');
            canvas.classList.add('opacity-100', 'translate-y-0', 'scale-100');
            canvasControls.classList.remove('opacity-0');
            canvasControls.classList.add('opacity-100');
        };
    };

    // MAGIA FIREBASE: Modificamos la función para que guarde en la nube
    const addToHistory = async (entry) => {
        // 1. Lo añadimos a la interfaz local al instante
        generationHistory.unshift(entry);
        localStorage.setItem('muapi_history', JSON.stringify(generationHistory.slice(0, 50)));

        // 2. Si el usuario ha iniciado sesión, lo guardamos en su base de datos de Firebase
        if (auth.currentUser) {
            try {
                const user = auth.currentUser;
                const genRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'generations');
                await addDoc(genRef, {
                    ...entry,
                    type: 'image',
                    createdAt: serverTimestamp()
                });
            } catch (error) {
                console.error("Error guardando en Firebase:", error);
            }
        }

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
                <img src="${entry.url}" alt="${entry.prompt?.substring(0, 30) || 'Generado'}" class="w-full aspect-square object-cover">
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <button class="hist-download p-1.5 bg-[#FFB000] rounded-lg text-black hover:scale-110 transition-transform" title="Descargar">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    </button>
                </div>
            `;

            thumb.onclick = (e) => {
                if (e.target.closest('.hist-download')) {
                    downloadImage(entry.url, `muapi-${entry.id || idx}.jpg`);
                    return;
                }
                showImageInCanvas(entry.url);
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

    const downloadImage = async (url, filename) => {
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

    // MAGIA FIREBASE: Cargar el historial desde la nube al entrar
    const loadFirebaseHistory = async (user) => {
        try {
            const genRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'generations');
            // Pedimos las últimas 50 imágenes, de la más nueva a la más antigua
            const q = query(genRef, orderBy('createdAt', 'desc'), limit(50));
            const snap = await getDocs(q);

            if (!snap.empty) {
                generationHistory.length = 0; // Vaciamos la memoria local
                snap.forEach(doc => {
                    const data = doc.data();
                    generationHistory.push({
                        id: doc.id,
                        url: data.url,
                        prompt: data.prompt,
                        model: data.model,
                        aspect_ratio: data.aspect_ratio,
                        timestamp: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString()
                    });
                });
                
                if (generationHistory.length > 0) {
                    historySidebar.classList.remove('translate-x-full', 'opacity-0');
                    historySidebar.classList.add('translate-x-0', 'opacity-100');
                    renderHistory();
                }
            }
        } catch (error) {
            console.error("Error cargando historial de Firebase:", error);
        }
    };

    // Escuchar si el usuario ha iniciado sesión
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Si está conectado, cargamos sus imágenes desde Firebase
            loadFirebaseHistory(user);
        } else {
            // Si no está conectado, probamos a cargar si hizo alguna de prueba en LocalStorage
            try {
                const saved = JSON.parse(localStorage.getItem('muapi_history') || '[]');
                if (saved.length > 0) {
                    generationHistory.length = 0;
                    saved.forEach(e => generationHistory.push(e));
                    historySidebar.classList.remove('translate-x-full', 'opacity-0');
                    historySidebar.classList.add('translate-x-0', 'opacity-100');
                    renderHistory();
                }
            } catch (e) { /* ignore */ }
        }
    });

    (async () => {
        const pending = getPendingJobs('image');
        if (!pending.length) return;

        const banner = document.createElement('div');
        banner.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-[#111] border border-white/10 text-white text-sm px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3';
        banner.innerHTML = `<span class="animate-spin text-[#FFB000]">◌</span> <span class="banner-text">Reanudando ${pending.length} generación(es) pendiente(s)...</span>`;
        document.body.appendChild(banner);

        let remaining = pending.length;
        pending.forEach(async (job) => {
            const elapsedAttempts = Math.floor((Date.now() - job.submittedAt) / job.interval);
            const attemptsLeft = Math.max(1, job.maxAttempts - elapsedAttempts);
            try {
                // --- ARREGLO: Ya no pasamos la apiKey aquí ---
                const result = await muapi.pollForResult(job.requestId, attemptsLeft, job.interval);
                const url = result.outputs?.[0] || result.url || result.output?.url;
                if (url) {
                    addToHistory({ id: job.requestId, url, ...job.historyMeta, timestamp: new Date().toISOString() });
                }
            } catch (e) {
                console.warn('[ImageStudio] Fallo al reanudar tarea:', job.requestId, e.message);
            } finally {
                removePendingJob(job.requestId);
                remaining--;
                if (remaining === 0) banner.remove();
                else banner.querySelector('.banner-text').textContent = `Reanudando ${remaining} generación(es) pendiente(s)...`;
            }
        });
    })();

    downloadBtn.onclick = () => {
        const current = resultImg.src;
        if (current) {
            const entry = generationHistory.find(e => e.url === current);
            downloadImage(current, `muapi-${entry?.id || 'image'}.jpg`);
        }
    };

    regenerateBtn.onclick = () => {
        generateBtn.click();
    };

    newPromptBtn.onclick = () => {
        canvas.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10', 'scale-95');
        canvas.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
        canvasControls.classList.add('opacity-0');
        canvasControls.classList.remove('opacity-100');
        hero.classList.remove('hidden', 'opacity-0', 'scale-95', '-translate-y-10', 'pointer-events-none');
        promptWrapper.classList.remove('hidden', 'opacity-40');
        textarea.value = '';
        picker.reset();
        uploadedImageUrls = [];
        picker.setMaxImages(1);
        imageMode = false;
        selectedModel = t2iModels[0].id;
        selectedModelName = t2iModels[0].name;
        selectedAr = getAspectRatiosForModel(selectedModel)[0];
        document.getElementById('model-btn-label').textContent = selectedModelName;
        document.getElementById('ar-btn-label').textContent = selectedAr;
        const resetResolutions = getResolutionsForModel(selectedModel);
        qualityBtn.style.display = resetResolutions.length > 0 ? 'flex' : 'none';
        if (resetResolutions.length > 0) document.getElementById('quality-btn-label').textContent = resetResolutions[0];
        textarea.placeholder = 'Describe la imagen que quieres crear';
        textarea.focus();
    };

    // ==========================================
    // 5. GENERATION LOGIC
    // ==========================================
    generateBtn.onclick = async () => {
        const prompt = textarea.value.trim();
        if (imageMode) {
            if (uploadedImageUrls.length === 0) {
                alert('Por favor, sube una imagen de referencia primero.');
                return;
            }
        } else {
            if (!prompt) {
                alert('Por favor, escribe un prompt para generar una imagen.');
                return;
            }
        }

        // --- ARREGLO PRINCIPAL: Comprobamos Firebase en vez de API Key ---
        if (!auth.currentUser) {
            alert('Debes iniciar sesión para generar imágenes.');
            return;
        }
        // -----------------------------------------------------------------

        hero.classList.add('opacity-0', 'scale-95', '-translate-y-10', 'pointer-events-none');
        generateBtn.disabled = true;
        generateBtn.innerHTML = `<span class="animate-spin inline-block mr-2 text-black">◌</span> Generando...`;

        let hadError = false;
        let capturedRequestId = null;
        const historyMeta = { prompt, model: selectedModel, aspect_ratio: selectedAr };

        try {
            let res;
            const qualityLabel = document.getElementById('quality-btn-label')?.textContent;
            if (imageMode) {
                const genParams = {
                    model: selectedModel,
                    images_list: uploadedImageUrls,
                    image_url: uploadedImageUrls[0], 
                    aspect_ratio: selectedAr,
                    onRequestId: (rid) => {
                        capturedRequestId = rid;
                        savePendingJob({ requestId: rid, studioType: 'image', historyMeta, maxAttempts: 60, interval: 2000, submittedAt: Date.now() });
                    }
                };
                if (prompt) genParams.prompt = prompt;
                const qualityField = getCurrentQualityField(selectedModel);
                if (qualityField && qualityLabel) genParams[qualityField] = qualityLabel;
                res = await muapi.generateI2I(genParams);
            } else {
                const genParams = {
                    model: selectedModel,
                    prompt,
                    aspect_ratio: selectedAr,
                    onRequestId: (rid) => {
                        capturedRequestId = rid;
                        savePendingJob({ requestId: rid, studioType: 'image', historyMeta, maxAttempts: 60, interval: 2000, submittedAt: Date.now() });
                    }
                };
                const qualityField = getCurrentQualityField(selectedModel);
                if (qualityField && qualityLabel) genParams[qualityField] = qualityLabel;
                res = await muapi.generateImage(genParams);
            }

            console.log('[ImageStudio] Full response:', res);

            if (res && res.url) {
                if (capturedRequestId) removePendingJob(capturedRequestId);
                
                // Usamos la nueva función conectada a Firebase
                addToHistory({
                    id: res.id || capturedRequestId || Date.now().toString(),
                    url: res.url,
                    prompt: prompt,
                    model: selectedModel,
                    aspect_ratio: selectedAr,
                    timestamp: new Date().toISOString()
                });
                showImageInCanvas(res.url);
            } else {
                console.error('[ImageStudio] No image URL in response:', res);
                throw new Error('La API no devolvió ninguna URL de imagen');
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
