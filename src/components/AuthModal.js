import { auth, googleProvider, db, APP_ID, ADMIN_EMAIL } from '../lib/firebase.js';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export function AuthModal(onSuccessCallback) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[9999] p-4 animate-fade-in';
    
    let isLoginMode = true;

    const modal = document.createElement('div');
    modal.className = 'w-full max-w-[420px] bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 shadow-[0_0_80px_rgba(0,0,0,0.8)] relative overflow-hidden';

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

            <button id="google-btn" class="w-full bg-white hover:bg-zinc-200 text-black font-bold rounded-2xl px-4 py-4 transition-all flex items-center justify-center shadow-lg active:scale-95 mb-6">
                <svg class="w-5 h-5 mr-3" viewBox="0 0 24 24">
                   <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                   <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                   <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                   <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continuar con Google
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
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid);
            const snap = await getDoc(userRef);
            const isAdmin = user.email === ADMIN_EMAIL;
            
            if (!snap.exists()) {
                const newProfile = { 
                    email: user.email || 'Usuario Social', 
                    credits: isAdmin ? 99999 : 0, 
                    role: isAdmin ? 'admin' : 'user', 
                    uid: user.uid 
                };
                await setDoc(userRef, newProfile);
            } else {
                const currentData = snap.data();
                if (isAdmin && currentData.role !== 'admin') {
                    await updateDoc(userRef, { role: 'admin', credits: Math.max(currentData.credits, 99999) });
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
        modal.querySelector('#toggle-mode-btn').onclick = () => {
            isLoginMode = !isLoginMode;
            renderUI();
        };

        modal.querySelector('#close-btn').onclick = () => {
            document.body.removeChild(overlay);
        };

        modal.querySelector('#google-btn').onclick = async () => {
            try {
                const result = await signInWithPopup(auth, googleProvider);
                await handleSuccessfulAuth(result.user);
            } catch (err) {
                showError("El inicio con Google fue cancelado o falló.");
            }
        };

        modal.querySelector('#email-form').onsubmit = async (e) => {
            e.preventDefault();
            const email = modal.querySelector('#email-input').value.trim();
            const password = modal.querySelector('#password-input').value.trim();
            setButtonLoading(true);

            try {
                let userCredential;
                if (isLoginMode) {
                    userCredential = await signInWithEmailAndPassword(auth, email, password);
                } else {
                    userCredential = await createUserWithEmailAndPassword(auth, email, password);
                }
                await handleSuccessfulAuth(userCredential.user);
            } catch (err) {
                setButtonLoading(false);
                if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                    showError("Credenciales incorrectas.");
                } else if (err.code === 'auth/email-already-in-use') {
                    showError("El correo ya está registrado.");
                } else {
                    showError("Error de autenticación: " + err.message);
                }
            }
        };
    };

    renderUI();
    overlay.appendChild(modal);

    return overlay;
}
