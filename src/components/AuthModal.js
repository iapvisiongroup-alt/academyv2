import { auth, googleProvider, db, APP_ID } from '../lib/firebase.js';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const TURNSTILE_SITE_KEY = '0x4AAAAAAEFjz6hn06HAmx8l';
let turnstileScriptPromise = null;

function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileScriptPromise) return turnstileScriptPromise;

    turnstileScriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-kreateia-turnstile]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.turnstile), { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.kreateiaTurnstile = 'true';
        script.onload = () => resolve(window.turnstile);
        script.onerror = () => reject(new Error('No se pudo cargar la comprobacion anti-bots.'));
        document.head.appendChild(script);
    }).catch(error => {
        turnstileScriptPromise = null;
        document.querySelector('script[data-kreateia-turnstile]')?.remove();
        throw error;
    });

    return turnstileScriptPromise;
}

export function AuthModal(onSuccessCallback) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[9999] p-4 animate-fade-in';
    
    let isLoginMode = true;
    let turnstileToken = '';
    let turnstileWidgetId = null;
    let humanVerifiedUntil = 0;
    let humanVerification = null;
    let authBusy = false;

    const modal = document.createElement('div');
    modal.className = 'w-full max-w-[420px] max-h-[calc(100dvh-2rem)] bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 shadow-[0_0_80px_rgba(0,0,0,0.8)] relative overflow-y-auto';

    const renderUI = () => {
        modal.innerHTML = `
            <div class="flex justify-center mb-6 relative">
                <div class="w-20 h-20 bg-gradient-to-tr from-[#3B82F6]/20 to-[#FFB000]/20 rounded-full flex items-center justify-center border border-white/10 shadow-[0_0_30px_rgba(255,176,0,0.2)]">
                    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-12 h-12">
                        <circle cx="50" cy="50" r="40" stroke="white" stroke-width="2" stroke-dasharray="15 10" opacity="0.2" />
                        <circle cx="50" cy="50" r="12" fill="white" />
                        <circle cx="80" cy="50" r="6" fill="#FFB000"></circle>
                        <path d="M20 50C20 33.4315 33.4315 20 50 20C66.5685 20 80 33.4315 80 50" stroke="#3B82F6" stroke-width="6" stroke-linecap="round" />
                        <path d="M80 50C80 66.5685 66.5685 80 50 80C33.4315 80 20 66.5685 20 50" stroke="#FF6B00" stroke-width="6" stroke-linecap="round" />
                    </svg>
                </div>
            </div>
            <div class="flex justify-center mb-2 font-bold tracking-tight text-3xl">
                <span style="background: linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%); -webkit-background-clip: text; color: transparent;">Kreate</span>
                <span style="background: linear-gradient(135deg, #FF6B00 0%, #FFB000 100%); -webkit-background-clip: text; color: transparent; margin-left: 2px; filter: drop-shadow(0px 0px 10px rgba(255,176,0,0.4))">IA</span>
            </div>
            <p class="text-white/50 text-center mb-8 text-sm font-medium">
                ${isLoginMode ? 'Accede a tu cuenta de creador' : 'Únete a la revolución generativa'}
            </p>

            <div id="error-msg" class="hidden items-start text-red-400 text-sm mb-6 bg-red-500/10 p-4 rounded-2xl border border-red-500/20 backdrop-blur-md"></div>

            <div class="rounded-2xl border border-white/10 bg-white/[.03] p-2 min-h-[66px] flex items-center justify-center mb-4">
                <div id="turnstile-container" class="w-full"></div>
            </div>
            <button id="retry-security-btn" type="button" class="hidden w-full mb-4 text-sm text-blue-400">Reintentar comprobación</button>

            <button id="google-btn" type="button" disabled class="w-full bg-white hover:bg-zinc-200 text-black font-bold rounded-2xl px-4 py-4 transition-all flex items-center justify-center shadow-lg active:scale-95 mb-6 disabled:opacity-50 disabled:cursor-wait">
                <svg class="w-5 h-5 mr-3" viewBox="0 0 24 24">
                   <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                   <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                   <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                   <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span id="google-label">Comprobando seguridad...</span>
            </button>

            <div class="flex items-center my-6 py-2 opacity-50">
                <hr class="flex-grow border-white/20"/>
                <span class="px-4 text-[10px] font-bold text-white uppercase tracking-widest">O con Email</span>
                <hr class="flex-grow border-white/20"/>
            </div>

            <form id="email-form" class="space-y-4">
                <input id="email-input" type="email" required class="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-[#FFB000]/50 transition-colors placeholder:text-white/30" placeholder="Tu correo electrónico" />
                <input id="password-input" type="password" required minlength="6" class="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-[#FFB000]/50 transition-colors placeholder:text-white/30" placeholder="Contraseña" />

                <button type="submit" id="submit-btn" class="w-full bg-gradient-to-r from-[#3B82F6] to-[#FFB000] text-black font-black uppercase rounded-2xl px-4 py-4 mt-2 transition-all shadow-[0_0_20px_rgba(255,176,0,0.3)] active:scale-95 flex items-center justify-center">
                    ${isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta'}
                </button>
            </form>

            <div class="mt-8 text-center">
                <p class="text-sm text-white/50">
                    ${isLoginMode ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
                    <button id="toggle-mode-btn" class="text-[#3B82F6] hover:text-[#60A5FA] ml-2 font-bold transition-colors">
                        ${isLoginMode ? 'Crea una aquí' : 'Inicia Sesión'}
                    </button>
                </p>
                <button id="close-btn" class="mt-6 text-xs text-white/30 hover:text-white transition-colors">Continuar navegando sin sesión</button>
            </div>
        `;

        setupListeners();
        renderTurnstile();
    };

    const renderTurnstile = async () => {
        const container = modal.querySelector('#turnstile-container');
        if (!container) return;

        turnstileToken = '';
        turnstileWidgetId = null;
        humanVerifiedUntil = 0;
        humanVerification = null;

        try {
            const turnstile = await loadTurnstile();
            if (!container.isConnected || !turnstile) return;

            turnstileWidgetId = turnstile.render(container, {
                sitekey: TURNSTILE_SITE_KEY,
                action: 'auth',
                theme: 'dark',
                size: 'flexible',
                appearance: 'always',
                callback: token => {
                    if (!container.isConnected) return;
                    turnstileToken = token;
                    modal.querySelector('#retry-security-btn').classList.add('hidden');
                    verifyHuman().then(() => {
                        updateGoogleButton();
                    }).catch(error => { if (container.isConnected) { showError(error.message); modal.querySelector('#retry-security-btn').classList.remove('hidden'); } });
                },
                'expired-callback': () => {
                    turnstileToken = '';
                    humanVerifiedUntil = 0;
                    updateGoogleButton();
                    modal.querySelector('#retry-security-btn').classList.remove('hidden');
                },
                'error-callback': () => {
                    turnstileToken = '';
                    humanVerifiedUntil = 0;
                    updateGoogleButton();
                    showError('No se pudo completar la comprobacion de seguridad.');
                    modal.querySelector('#retry-security-btn').classList.remove('hidden');
                },
            });
        } catch {
            showError('No se pudo cargar la comprobacion de seguridad.');
            modal.querySelector('#retry-security-btn').classList.remove('hidden');
        }
    };

    const resetTurnstile = () => {
        turnstileToken = '';
        humanVerifiedUntil = 0;
        humanVerification = null;
        updateGoogleButton();
        if (window.turnstile && turnstileWidgetId !== null) {
            window.turnstile.reset(turnstileWidgetId);
        }
    };

    const verifyHuman = async () => {
        if (Date.now() < humanVerifiedUntil) return;
        if (humanVerification?.token === turnstileToken) return humanVerification.promise;
        if (!turnstileToken) {
            throw new Error('Completa la comprobacion de seguridad.');
        }

        const token = turnstileToken;
        const verification = (async () => {
            const response = await fetch('/api/v1/auth/verify-turnstile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            });
            const data = await response.json().catch(() => ({}));
            if (token !== turnstileToken || !overlay.isConnected) throw new Error('La comprobación ha caducado. Vuelve a intentarlo.');

            if (!response.ok || !data.ok) {
                humanVerifiedUntil = 0;
                turnstileToken = '';
                updateGoogleButton();
                throw new Error(data.error || 'Comprobacion de seguridad rechazada.');
            }
            humanVerifiedUntil = Date.now() + 120000;
        })();
        humanVerification = { token, promise: verification };
        try { await verification; } finally { if (humanVerification?.promise === verification) humanVerification = null; }
    };

    const updateGoogleButton = () => {
        const button = modal.querySelector('#google-btn');
        button.disabled = authBusy || Date.now() >= humanVerifiedUntil;
        modal.querySelector('#google-label').textContent = authBusy ? 'Conectando con Google...' : button.disabled ? 'Completa la comprobación de seguridad' : 'Continuar con Google';
    };

    const showError = (msg) => {
        const errDiv = modal.querySelector('#error-msg');
        errDiv.textContent = msg;
        errDiv.classList.remove('hidden');
        errDiv.classList.add('flex');
    };

    const setButtonLoading = (isLoading) => {
        const btn = modal.querySelector('#submit-btn');
        if (isLoading) {
            btn.disabled = true;
            btn.innerHTML = `<span class="animate-spin mr-2">◌</span> Procesando...`;
        } else {
            btn.disabled = false;
            btn.innerHTML = isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta';
        }
    };

    const handleSuccessfulAuth = async (user) => {
        try {
            const userEmail = String(user.email || '').trim().toLowerCase();
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid);
            const snap = await getDoc(userRef);
            if (!snap.exists()) {
                const newProfile = { 
                    email: userEmail,
                    uid: user.uid,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                await setDoc(userRef, newProfile);
            } else {
                const currentData = snap.data();
                const updates = {};

                if (!currentData.email && userEmail) updates.email = userEmail;
                if (currentData.uid !== user.uid) updates.uid = user.uid;

                if (Object.keys(updates).length) {
                    updates.updatedAt = new Date().toISOString();
                    await updateDoc(userRef, updates);
                }
            }
            
            document.body.removeChild(overlay);
            if (onSuccessCallback) onSuccessCallback();

        } catch (err) {
            console.error(err);
            showError("Error al sincronizar tu perfil de creador.");
        }
    };

    const setupListeners = () => {
        modal.querySelector('#retry-security-btn').onclick = () => {
            modal.querySelector('#retry-security-btn').classList.add('hidden');
            if (window.turnstile && turnstileWidgetId !== null) resetTurnstile();
            else renderTurnstile();
        };
        modal.querySelector('#toggle-mode-btn').onclick = () => {
            if (window.turnstile && turnstileWidgetId !== null) {
                window.turnstile.remove(turnstileWidgetId);
            }
            isLoginMode = !isLoginMode;
            renderUI();
        };

        modal.querySelector('#close-btn').onclick = () => {
            document.body.removeChild(overlay);
        };

        modal.querySelector('#google-btn').onclick = async () => {
            if (authBusy) return;
            try {
                if (Date.now() >= humanVerifiedUntil) { resetTurnstile(); throw new Error('Completa de nuevo la comprobación de seguridad.'); }
                authBusy = true;
                updateGoogleButton();
                humanVerifiedUntil = 0;
                // Keep popup creation in the original click, without awaiting network requests.
                const result = await signInWithPopup(auth, googleProvider);
                await handleSuccessfulAuth(result.user);
            } catch (err) {
                resetTurnstile();
                const messages = {
                    'auth/popup-blocked': 'El navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes para kreateia.com y vuelve a intentarlo.',
                    'auth/popup-closed-by-user': 'La ventana de Google se ha cerrado antes de terminar. Vuelve a intentarlo.',
                    'auth/unauthorized-domain': 'Este dominio no está autorizado para iniciar sesión con Google. Contacta con KreateIA.',
                    'auth/network-request-failed': 'No se pudo conectar con Google. Revisa la conexión y vuelve a intentarlo.',
                };
                showError(messages[err.code] || err.message || 'No se pudo iniciar sesión con Google.');
            } finally {
                authBusy = false;
                if (overlay.isConnected) updateGoogleButton();
            }
        };

        modal.querySelector('#email-form').onsubmit = async (e) => {
            e.preventDefault();
            if (authBusy) return;
            const email = modal.querySelector('#email-input').value.trim();
            const password = modal.querySelector('#password-input').value.trim();
            setButtonLoading(true);
            authBusy = true;
            updateGoogleButton();

            try {
                await verifyHuman();
                humanVerifiedUntil = 0;
                let userCredential;
                if (isLoginMode) {
                    userCredential = await signInWithEmailAndPassword(auth, email, password);
                } else {
                    userCredential = await createUserWithEmailAndPassword(auth, email, password);
                }
                await handleSuccessfulAuth(userCredential.user);
            } catch (err) {
                setButtonLoading(false);
                resetTurnstile();
                if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                    showError("Credenciales incorrectas.");
                } else if (err.code === 'auth/email-already-in-use') {
                    showError("El correo ya está registrado.");
                } else {
                    showError("Error de autenticación: " + err.message);
                }
            } finally {
                authBusy = false;
                if (overlay.isConnected) { setButtonLoading(false); updateGoogleButton(); }
            }
        };
    };

    overlay.appendChild(modal);
    renderUI();

    return overlay;
}
