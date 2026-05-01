import { auth, db, APP_ID } from '../lib/firebase.js';
import { signOut, deleteUser } from 'firebase/auth';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { PricingModal } from './PricingModal.js';

export function SettingsModal() {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[9999] p-4 animate-fade-in';

    const modal = document.createElement('div');
    // Hacemos la ventana más ancha para tener un menú lateral y contenido
    modal.className = 'w-full max-w-3xl bg-[#0a0a0a] border border-white/10 rounded-[2rem] p-6 md:p-8 shadow-[0_0_80px_rgba(0,0,0,0.8)] relative flex flex-col md:flex-row gap-8 overflow-hidden';

    const user = auth.currentUser;
    const userEmail = user ? user.email : 'Usuario';
    const initial = userEmail.charAt(0).toUpperCase();

    // Estructura HTML del Modal con Pestañas
    modal.innerHTML = `
        <!-- Menú Lateral -->
        <div class="w-full md:w-1/3 flex flex-col gap-2 border-b md:border-b-0 md:border-r border-white/10 pb-6 md:pb-0 md:pr-6">
            <div class="flex items-center gap-4 mb-8">
                <div class="w-12 h-12 bg-gradient-to-tr from-[#3B82F6] to-[#FFB000] rounded-full flex items-center justify-center text-black font-black text-xl shadow-[0_0_15px_rgba(255,176,0,0.3)] shrink-0">
                    ${initial}
                </div>
                <div class="overflow-hidden">
                    <p class="text-white font-bold truncate" title="${userEmail}">${userEmail}</p>
                    <p class="text-[#FFB000] text-xs font-bold uppercase tracking-wider">Plan Creador</p>
                </div>
            </div>

            <button class="tab-btn active w-full text-left px-4 py-3 rounded-xl bg-white/10 text-white font-bold transition-colors" data-tab="profile">
                👤 Mi Perfil
            </button>
            <button class="tab-btn w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 text-white/50 hover:text-white font-bold transition-colors" data-tab="billing">
                💳 Créditos y Pagos
            </button>
            <button class="tab-btn w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 text-white/50 hover:text-white font-bold transition-colors" data-tab="legal">
                ⚖️ Legal y Privacidad
            </button>
            
            <div class="mt-auto pt-8">
                <button id="logout-btn" class="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold rounded-xl px-4 py-3 transition-all flex items-center justify-center gap-2">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                    Cerrar Sesión
                </button>
            </div>
        </div>

        <!-- Área de Contenido -->
        <div class="w-full md:w-2/3 relative min-h-[300px]">
            <button id="close-modal-btn" class="absolute -top-2 -right-2 text-white/30 hover:text-white p-2 transition-colors">
                <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <!-- Pestaña: Perfil -->
            <div id="tab-profile" class="tab-content block animate-fade-in">
                <h3 class="text-xl font-bold text-white mb-6">Configuración de Perfil</h3>
                <div class="space-y-4">
                    <div>
                        <label class="text-[11px] text-white/50 uppercase tracking-widest font-bold mb-2 block">Correo Electrónico Viculado</label>
                        <input type="text" disabled value="${userEmail}" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/50 cursor-not-allowed font-mono text-sm" />
                        <p class="text-[11px] text-[#3B82F6] mt-2">✓ Verificado mediante proveedor de acceso.</p>
                    </div>
                </div>
            </div>

            <!-- Pestaña: Facturación y Créditos -->
            <div id="tab-billing" class="tab-content hidden animate-fade-in">
                <h3 class="text-xl font-bold text-white mb-6">Créditos de Generación</h3>
                
                <div class="bg-gradient-to-br from-[#3B82F6]/10 to-[#FFB000]/10 border border-[#FFB000]/30 rounded-2xl p-6 mb-6 shadow-inner">
                    <p class="text-sm text-white/70 mb-1 font-medium">Saldo Disponible</p>
                    <div class="flex items-end gap-2">
                        <span class="text-4xl font-black text-white tracking-tighter" id="settings-credits-display">...</span>
                        <span class="text-[#FFB000] font-bold mb-1 text-lg">CR</span>
                    </div>
                </div>

                <div class="space-y-3">
                    <button id="open-pricing-btn" class="w-full bg-white text-black font-black uppercase tracking-wide py-4 rounded-xl hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                        Comprar más créditos
                    </button>
                    <p class="text-center text-xs text-white/30">Los pagos se procesan de forma segura mediante Stripe.</p>
                </div>
            </div>

            <!-- Pestaña: Legal y Zona de Peligro -->
            <div id="tab-legal" class="tab-content hidden animate-fade-in">
                <h3 class="text-xl font-bold text-white mb-6">Legal y Privacidad</h3>
                <div class="space-y-3 mb-10">
                    <a href="#" class="flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm text-white font-medium border border-white/5">
                        Términos y Condiciones
                        <span class="text-white/30">→</span>
                    </a>
                    <a href="#" class="flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm text-white font-medium border border-white/5">
                        Política de Privacidad
                        <span class="text-white/30">→</span>
                    </a>
                </div>
                
                <div class="border-t border-red-500/20 pt-6">
                    <h4 class="text-red-500 font-bold mb-2">Eliminación de Cuenta</h4>
                    <p class="text-xs text-white/50 mb-4 leading-relaxed">De acuerdo a la normativa RGPD, puedes solicitar la eliminación permanente de tus datos. Perderás acceso a tu historial y a los créditos restantes. No se puede deshacer.</p>
                    <button id="delete-account-btn" class="w-full bg-red-500/10 text-red-500 border border-red-500/30 font-bold py-3 px-4 rounded-xl hover:bg-red-500 hover:text-white transition-colors text-sm">
                        Eliminar mi cuenta permanentemente
                    </button>
                </div>
            </div>
        </div>
    `;

    // LÓGICA DE LAS PESTAÑAS (TABS)
    const tabBtns = modal.querySelectorAll('.tab-btn');
    const tabContents = modal.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.onclick = () => {
            // Desmarcar todos
            tabBtns.forEach(b => {
                b.classList.remove('bg-white/10', 'text-white');
                b.classList.add('text-white/50');
            });
            tabContents.forEach(c => c.classList.add('hidden'));

            // Marcar el seleccionado
            btn.classList.remove('text-white/50');
            btn.classList.add('bg-white/10', 'text-white');
            const targetTab = btn.getAttribute('data-tab');
            modal.querySelector(`#tab-${targetTab}`).classList.remove('hidden');
        };
    });

    // OBTENER CRÉDITOS PARA LA PESTAÑA DE FACTURACIÓN
    if (user) {
        getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid)).then(snap => {
            if(snap.exists()) {
                const creditsDisplay = modal.querySelector('#settings-credits-display');
                if(creditsDisplay) {
                    creditsDisplay.textContent = snap.data().credits || 0;
                }
            }
        });
    }

    // ACCIONES DE BOTONES
    modal.querySelector('#close-modal-btn').onclick = () => document.body.removeChild(overlay);
    
    // Abrir Modal de Precios
    const openPricingBtn = modal.querySelector('#open-pricing-btn');
    if (openPricingBtn) {
        openPricingBtn.onclick = () => {
            document.body.removeChild(overlay);
            document.body.appendChild(PricingModal());
        };
    }

    // 1. CERRAR SESIÓN
    modal.querySelector('#logout-btn').onclick = async () => {
        await signOut(auth);
        document.body.removeChild(overlay);
    };

    // 2. ELIMINAR CUENTA (REQUISITO LEGAL)
    modal.querySelector('#delete-account-btn').onclick = async () => {
        const confirmDelete = confirm("⚠️ ATENCIÓN: ¿Estás 100% seguro de que deseas eliminar tu cuenta?\n\nEsta acción borrará tu acceso, tus imágenes generadas y tus créditos. NO HAY MARCHA ATRÁS.");
        if (confirmDelete) {
            try {
                // Borramos primero su documento de créditos en la base de datos
                await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid));
                // Luego destruimos su usuario en la autenticación de Firebase
                await deleteUser(user);
                
                alert("Tu cuenta y todos tus datos han sido eliminados correctamente.");
                document.body.removeChild(overlay);
            } catch (error) {
                console.error("Error borrando cuenta:", error);
                // Firebase exige que el usuario se haya logueado hace poco para dejarle borrar la cuenta por seguridad
                if (error.code === 'auth/requires-recent-login') {
                    alert("Por seguridad, debes CERRAR SESIÓN y VOLVER A ENTRAR antes de poder eliminar tu cuenta.");
                } else {
                    alert("Hubo un error al intentar eliminar la cuenta.");
                }
            }
        }
    };

    // Cerrar si se hace clic fuera de la ventana
    overlay.onclick = (e) => {
        if(e.target === overlay) document.body.removeChild(overlay);
    }

    overlay.appendChild(modal);
    return overlay;
}
