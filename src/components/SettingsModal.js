import { auth, db, APP_ID } from '../lib/firebase.js';
import { signOut, deleteUser } from 'firebase/auth';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { PricingModal } from './PricingModal.js';

// ── Modales de contenido legal ────────────────────────────────────────────────
function openLegalModal(title, contentHtml) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);backdrop-filter:blur(16px);z-index:999999;display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow-y:auto';
    const box = document.createElement('div');
    box.style.cssText = 'background:#0d0d0d;border:1px solid #2a2a2a;border-radius:20px;width:100%;max-width:700px;padding:36px 40px;color:#ccc;font-size:14px;line-height:1.8;margin:auto;position:relative';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.style.cssText = 'position:absolute;top:16px;right:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;color:#666;cursor:pointer;padding:6px 10px;font-size:13px';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    box.innerHTML = `<h1 style="color:#fff;font-size:20px;font-weight:900;margin:0 0 24px;padding-right:40px">${title}</h1>${contentHtml}`;
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

const TERMINOS_CONTENT = `
    <p>Bienvenido a <strong style="color:#fff">KreateIA Studio</strong>. Al usar nuestra plataforma, aceptas los siguientes términos.</p>

    <h3 style="color:#fff;margin:20px 0 8px">1. Descripción del servicio</h3>
    <p>KreateIA Studio es una plataforma de generación de contenido con inteligencia artificial (imágenes, vídeo y música) operada por KreateIA. El acceso se realiza mediante cuenta registrada y sistema de créditos prepago.</p>

    <h3 style="color:#fff;margin:20px 0 8px">2. Uso de créditos</h3>
    <p>Los créditos se descuentan automáticamente al completar cada generación. El coste exacto se muestra antes de confirmar. Los créditos no caducan y no son reembolsables salvo fallo técnico imputable al servicio.</p>

    <h3 style="color:#fff;margin:20px 0 8px">3. Propiedad del contenido generado</h3>
    <p>El contenido generado a través de la plataforma es propiedad del usuario que lo genera. KreateIA no reclama derechos sobre el mismo. El usuario es responsable de que el contenido generado cumpla la legislación aplicable.</p>

    <h3 style="color:#fff;margin:20px 0 8px">4. Contenido prohibido</h3>
    <p>Está prohibido generar contenido que infrinja derechos de autor, contenido sexual explícito, contenido que incite a la violencia o al odio, deepfakes sin consentimiento, o cualquier contenido ilegal según la legislación española y europea.</p>

    <h3 style="color:#fff;margin:20px 0 8px">5. Limitación de responsabilidad</h3>
    <p>KreateIA no garantiza la disponibilidad ininterrumpida del servicio. No somos responsables de los daños derivados del uso del contenido generado por terceros.</p>

    <h3 style="color:#fff;margin:20px 0 8px">6. Modificaciones</h3>
    <p>Nos reservamos el derecho a modificar estos términos. Los cambios sustanciales se notificarán por email con al menos 15 días de antelación.</p>

    <h3 style="color:#fff;margin:20px 0 8px">7. Legislación aplicable</h3>
    <p>Estos términos se rigen por la legislación española. Para cualquier controversia, las partes se someten a los juzgados y tribunales de Murcia, España.</p>

    <p style="color:#555;font-size:12px;margin-top:24px;border-top:1px solid #2a2a2a;padding-top:12px">
        KreateIA · C/ Lino León Martínez, 6 BJ · Torre-Pacheco, Murcia 30700 · info@kreateia.com<br>
        Última actualización: enero 2026
    </p>
`;

const PRIVACIDAD_CONTENT = `
    <p>En cumplimiento del <strong style="color:#fff">Reglamento (UE) 2016/679 (RGPD)</strong> y la Ley Orgánica 3/2018 (LOPDGDD), te informamos sobre el tratamiento de tus datos personales.</p>

    <h3 style="color:#fff;margin:20px 0 8px">1. Responsable del tratamiento</h3>
    <div style="padding:12px 16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;font-size:13px;color:#999">
        <strong style="color:#fff">KreateIA</strong><br>
        C/ Lino León Martínez, 6 BJ · Torre-Pacheco, Murcia 30700<br>
        Email: <a href="mailto:info@kreateia.com" style="color:#f59e0b">info@kreateia.com</a>
    </div>

    <h3 style="color:#fff;margin:20px 0 8px">2. Datos que recogemos</h3>
    <ul style="padding-left:20px;display:flex;flex-direction:column;gap:6px;color:#999">
        <li><strong style="color:#ccc">Datos de cuenta:</strong> dirección de email, identificador único de usuario.</li>
        <li><strong style="color:#ccc">Datos de uso:</strong> generaciones realizadas, créditos consumidos, historial de transacciones.</li>
        <li><strong style="color:#ccc">Datos de pago:</strong> procesados íntegramente por Stripe. KreateIA no almacena datos de tarjetas.</li>
    </ul>

    <h3 style="color:#fff;margin:20px 0 8px">3. Finalidad y base legal</h3>
    <ul style="padding-left:20px;display:flex;flex-direction:column;gap:6px;color:#999">
        <li>Prestación del servicio — base legal: ejecución del contrato (art. 6.1.b RGPD)</li>
        <li>Gestión de pagos — base legal: ejecución del contrato</li>
        <li>Comunicaciones sobre el servicio — base legal: interés legítimo</li>
        <li>Comunicaciones comerciales — base legal: consentimiento (art. 6.1.a RGPD)</li>
    </ul>

    <h3 style="color:#fff;margin:20px 0 8px">4. Conservación de datos</h3>
    <p style="font-size:13px">Los datos se conservan mientras la cuenta esté activa. Tras la eliminación de cuenta, los datos se borran en un plazo máximo de 30 días, salvo obligación legal de conservación.</p>

    <h3 style="color:#fff;margin:20px 0 8px">5. Tus derechos</h3>
    <p style="font-size:13px">Tienes derecho a <strong style="color:#ccc">acceder, rectificar, suprimir, oponerte, limitar el tratamiento y portar</strong> tus datos. Puedes ejercerlos escribiendo a <a href="mailto:info@kreateia.com" style="color:#f59e0b">info@kreateia.com</a>. También puedes reclamar ante la <a href="https://www.aepd.es" target="_blank" style="color:#f59e0b">AEPD</a>.</p>

    <h3 style="color:#fff;margin:20px 0 8px">6. Transferencias internacionales</h3>
    <p style="font-size:13px">Usamos Firebase (Google) y Stripe, ambos con certificaciones de adecuación al RGPD y cláusulas contractuales tipo aprobadas por la Comisión Europea.</p>

    <p style="color:#555;font-size:12px;margin-top:24px;border-top:1px solid #2a2a2a;padding-top:12px">
        Última actualización: enero 2026
    </p>
`;

export function SettingsModal() {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[9999] p-4 animate-fade-in';

    const modal = document.createElement('div');
    modal.className = 'w-full max-w-3xl bg-[#0a0a0a] border border-white/10 rounded-[2rem] p-6 md:p-8 shadow-[0_0_80px_rgba(0,0,0,0.8)] relative flex flex-col md:flex-row gap-8 overflow-hidden';

    const user = auth.currentUser;
    const userEmail = user ? user.email : 'Usuario';
    const initial = userEmail.charAt(0).toUpperCase();

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
            <button class="tab-btn active w-full text-left px-4 py-3 rounded-xl bg-white/10 text-white font-bold transition-colors" data-tab="profile">👤 Mi Perfil</button>
            <button class="tab-btn w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 text-white/50 hover:text-white font-bold transition-colors" data-tab="billing">💳 Créditos y Pagos</button>
            <button class="tab-btn w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 text-white/50 hover:text-white font-bold transition-colors" data-tab="legal">⚖️ Legal y Privacidad</button>
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
                        <label class="text-[11px] text-white/50 uppercase tracking-widest font-bold mb-2 block">Correo Electrónico Vinculado</label>
                        <input type="text" disabled value="${userEmail}" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/50 cursor-not-allowed font-mono text-sm" />
                        <p class="text-[11px] text-[#3B82F6] mt-2">✓ Verificado mediante proveedor de acceso.</p>
                    </div>
                </div>
            </div>

            <!-- Pestaña: Facturación -->
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

            <!-- Pestaña: Legal -->
            <div id="tab-legal" class="tab-content hidden animate-fade-in">
                <h3 class="text-xl font-bold text-white mb-6">Legal y Privacidad</h3>
                <div class="space-y-3 mb-10">
                    <button id="btn-terminos" class="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm text-white font-medium border border-white/5 cursor-pointer">
                        Términos y Condiciones
                        <span class="text-white/30">→</span>
                    </button>
                    <button id="btn-privacidad" class="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm text-white font-medium border border-white/5 cursor-pointer">
                        Política de Privacidad
                        <span class="text-white/30">→</span>
                    </button>
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

    // ── Tabs ──────────────────────────────────────────────────────────────────
    const tabBtns     = modal.querySelectorAll('.tab-btn');
    const tabContents = modal.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => { b.classList.remove('bg-white/10','text-white'); b.classList.add('text-white/50'); });
            tabContents.forEach(c => c.classList.add('hidden'));
            btn.classList.remove('text-white/50');
            btn.classList.add('bg-white/10','text-white');
            modal.querySelector(`#tab-${btn.getAttribute('data-tab')}`).classList.remove('hidden');
        };
    });

    // ── Créditos ──────────────────────────────────────────────────────────────
    if (user) {
        getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid)).then(snap => {
            const el = modal.querySelector('#settings-credits-display');
            if (el) el.textContent = snap.exists() ? (snap.data().credits || 0) : 0;
        });
    }

    // ── Botones ───────────────────────────────────────────────────────────────
    modal.querySelector('#close-modal-btn').onclick   = () => overlay.remove();
    modal.querySelector('#logout-btn').onclick        = async () => { await signOut(auth); overlay.remove(); };
    modal.querySelector('#open-pricing-btn').onclick  = () => { overlay.remove(); document.body.appendChild(PricingModal()); };

    // Términos y Condiciones
    modal.querySelector('#btn-terminos').onclick = () => {
        openLegalModal('Términos y Condiciones', TERMINOS_CONTENT);
    };

    // Política de Privacidad
    modal.querySelector('#btn-privacidad').onclick = () => {
        openLegalModal('Política de Privacidad', PRIVACIDAD_CONTENT);
    };

    // Eliminar cuenta
    modal.querySelector('#delete-account-btn').onclick = async () => {
        const ok = confirm('⚠️ ATENCIÓN: ¿Estás 100% seguro de que deseas eliminar tu cuenta?\n\nEsta acción borrará tu acceso, tus imágenes generadas y tus créditos. NO HAY MARCHA ATRÁS.');
        if (!ok) return;
        try {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid));
            await deleteUser(user);
            alert('Tu cuenta y todos tus datos han sido eliminados correctamente.');
            overlay.remove();
        } catch (error) {
            if (error.code === 'auth/requires-recent-login') {
                alert('Por seguridad, debes CERRAR SESIÓN y VOLVER A ENTRAR antes de poder eliminar tu cuenta.');
            } else {
                alert('Hubo un error al intentar eliminar la cuenta.');
            }
        }
    };

    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.appendChild(modal);
    return overlay;
}
