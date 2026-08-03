import { onAuthStateChanged } from 'firebase/auth';
import { AuthModal } from './AuthModal.js';
import { auth } from '../lib/firebase.js';

// Preparado para activar el plan mensual cuando el producto salga de beta.
const MONTHLY_SUBSCRIPTION_REQUIRED = false;

export function KreateEditPage() {
    const root = document.createElement('section');
    root.className = 'flex-1 min-h-0 w-full bg-[#080808] relative';

    let unsubscribe = null;

    const renderGate = () => {
        root.innerHTML = `
            <div class="absolute inset-0 flex items-center justify-center p-5 bg-[#080808]">
                <div class="w-full max-w-md border border-white/10 bg-[#111] rounded-lg p-7 text-center shadow-2xl">
                    <div class="w-12 h-12 mx-auto mb-5 rounded-lg bg-[#f4c542] text-black flex items-center justify-center font-black text-xl">K</div>
                    <span class="inline-flex px-2.5 py-1 mb-3 rounded-full border border-[#f4c542]/30 bg-[#f4c542]/10 text-[#f4c542] text-[10px] font-black uppercase">Beta</span>
                    <h1 class="text-white text-2xl font-black mb-3">KreateEdit</h1>
                    <p class="text-white/55 text-sm leading-relaxed mb-6">Inicia sesión con tu cuenta de KreateIA para editar tus vídeos, imágenes y generaciones guardadas.</p>
                    <button type="button" data-kreateedit-login class="w-full min-h-11 px-5 bg-[#f4c542] hover:bg-[#ffd85a] text-black font-black text-sm rounded-lg transition-colors">Iniciar sesión en KreateIA</button>
                </div>
            </div>
        `;

        root.querySelector('[data-kreateedit-login]').addEventListener('click', () => {
            document.body.appendChild(AuthModal());
        });
    };

    const renderEditor = () => {
        if (MONTHLY_SUBSCRIPTION_REQUIRED) {
            // Aquí se conectará la comprobación del plan KreateEdit cuando se active.
        }

        const currentParams = new URLSearchParams(window.location.search);
        const editorParams = new URLSearchParams();
        ['import', 'type', 'name'].forEach(key => {
            if (currentParams.has(key)) editorParams.set(key, currentParams.get(key));
        });
        const editorUrl = `/kreateedit/${editorParams.size ? `?${editorParams.toString()}` : ''}`;

        root.innerHTML = `
            <iframe
                src="${editorUrl}"
                title="KreateEdit Beta"
                class="absolute inset-0 w-full h-full border-0 bg-[#080808]"
                allow="clipboard-read; clipboard-write"
            ></iframe>
        `;
    };

    unsubscribe = onAuthStateChanged(auth, user => {
        if (user) renderEditor();
        else renderGate();
    });

    const observer = new MutationObserver(() => {
        if (!root.isConnected) {
            if (unsubscribe) unsubscribe();
            observer.disconnect();
        }
    });
    queueMicrotask(() => observer.observe(document.body, { childList: true, subtree: true }));

    return root;
}
