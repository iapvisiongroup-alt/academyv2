import { SettingsModal } from './SettingsModal.js';
import { AuthModal } from './AuthModal.js';
import { AdminPanel } from './AdminPanel.js';
import { PricingModal } from './PricingModal.js';
import { auth, db, APP_ID } from '../lib/firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

export function Header(navigate) {
    const header = document.createElement('header');
    header.className = 'w-full flex flex-col z-50 sticky top-0';

    // Main Navigation Bar
    const navBar = document.createElement('div');
    navBar.className = 'w-full h-16 bg-[#030303] flex items-center justify-between px-4 md:px-6 border-b border-white/5 backdrop-blur-md bg-opacity-95';

    const leftPart = document.createElement('div');
    leftPart.className = 'flex items-center gap-8';

    // Logo KreateIA
    const logoContainer = document.createElement('div');
    logoContainer.className = 'flex items-center gap-2 cursor-pointer hover:scale-105 transition-transform';
    logoContainer.innerHTML = `
        <div class="w-8 h-8 flex items-center justify-center drop-shadow-[0_0_10px_rgba(59,130,246,0.3)]">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
                <circle cx="50" cy="50" r="40" stroke="white" stroke-width="2" stroke-dasharray="15 10" opacity="0.2" />
                <circle cx="50" cy="50" r="12" fill="white" />
                <circle cx="80" cy="50" r="6" fill="#FFB000">
                    <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
                </circle>
                <path d="M20 50C20 33.4315 33.4315 20 50 20C66.5685 20 80 33.4315 80 50" stroke="#3B82F6" stroke-width="6" stroke-linecap="round" />
                <path d="M80 50C80 66.5685 66.5685 80 50 80C33.4315 80 20 66.5685 20 50" stroke="#FF6B00" stroke-width="6" stroke-linecap="round" />
            </svg>
        </div>
        <div class="hidden sm:flex items-center font-bold tracking-tight text-lg">
            <span style="background: linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%); -webkit-background-clip: text; color: transparent;">Kreate</span>
            <span style="background: linear-gradient(135deg, #FF6B00 0%, #FFB000 100%); -webkit-background-clip: text; color: transparent; margin-left: 2px;">IA</span>
            <span class="ml-2 text-white/50 font-medium text-sm">Studio</span>
        </div>
    `;
    logoContainer.onclick = () => navigate('image');

    const menu = document.createElement('nav');
    menu.className = 'hidden lg:flex items-center gap-6 text-[13px] font-bold text-white/50';
    
    // Menú de navegación
    const items = [
        { id: 'image', label: 'Estudio de Imagen' },
        { id: 'video', label: 'Estudio de Vídeo' },
        { id: 'lipsync', label: 'Lip Sync' },
        { id: 'cinema', label: 'Modo Cine' },
        { id: 'academy', label: 'Academia de IA' }
    ];

    items.forEach(item => {
        const link = document.createElement('a');
        link.textContent = item.label;
        link.className = `hover:text-white transition-all cursor-pointer relative group ${item.id === 'image' ? 'text-[#FFB000]' : ''}`;

        // Indicador de pestaña activa inicial
        if (item.id === 'image') {
            const dot = document.createElement('div');
            dot.className = 'absolute -bottom-1.5 left-0 right-0 h-[2px] bg-[#FFB000] rounded-full shadow-[0_0_8px_rgba(255,176,0,0.6)] active-dot';
            link.appendChild(dot);
        }

        link.onclick = () => {
            Array.from(menu.children).forEach(child => {
                child.classList.remove('text-[#FFB000]');
                const oldDot = child.querySelector('.active-dot');
                if(oldDot) oldDot.remove();
            });
            
            link.classList.add('text-[#FFB000]');
            const dot = document.createElement('div');
            dot.className = 'absolute -bottom-1.5 left-0 right-0 h-[2px] bg-[#FFB000] rounded-full shadow-[0_0_8px_rgba(255,176,0,0.6)] active-dot';
            link.appendChild(dot);

            navigate(item.id);
        };

        menu.appendChild(link);
    });

    leftPart.appendChild(logoContainer);
    leftPart.appendChild(menu);

    // ==========================================
    // PARTE DERECHA: USUARIO, CRÉDITOS Y LOGIN
    // ==========================================
    const rightPart = document.createElement('div');
    rightPart.className = 'flex items-center gap-3 md:gap-4';

    let unsubscribeSnapshot = null;

    // Función para repintar la parte derecha según si hay usuario o no, y su rol
    const updateRightUI = (user, credits = '...', role = 'user') => {
        rightPart.innerHTML = '';

        if (!user) {
            // --- ESTADO: NO LOGUEADO ---
            const loginBtn = document.createElement('button');
            loginBtn.className = 'px-5 py-2 bg-gradient-to-r from-[#3B82F6] to-[#FFB000] text-black font-black text-xs md:text-sm uppercase rounded-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(255,176,0,0.3)] flex items-center gap-2';
            loginBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
                Iniciar Sesión
            `;
            loginBtn.onclick = () => {
                document.body.appendChild(AuthModal());
            };
            rightPart.appendChild(loginBtn);

        } else {
            // --- ESTADO: LOGUEADO ---
            
            // 1. SI ES ADMIN: Añadimos el botón de la corona
            if (role === 'admin') {
                const adminBtn = document.createElement('button');
                adminBtn.className = 'w-9 h-9 rounded-xl bg-gradient-to-br from-[#FFB000]/20 to-transparent border border-[#FFB000]/50 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(255,176,0,0.2)] hover:scale-105 transition-transform mr-1 md:mr-2';
                adminBtn.title = 'Panel de Control Maestro';
                adminBtn.textContent = '👑';
                adminBtn.onclick = () => {
                    document.body.appendChild(AdminPanel());
                };
                rightPart.appendChild(adminBtn);
            }

            // 2. Mostrar Créditos (Ahora abre el PricingModal)
            const creditsBadge = document.createElement('div');
            creditsBadge.className = 'flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl cursor-pointer hover:bg-white/10 hover:border-white/30 transition-all shadow-inner group';
            creditsBadge.title = 'Añadir más créditos';
            creditsBadge.onclick = () => {
                document.body.appendChild(PricingModal());
            };
            creditsBadge.innerHTML = `
                <span class="text-sm">🪙</span>
                <span class="text-white font-bold text-xs md:text-sm font-mono tracking-tight">${credits}</span>
                <span class="bg-[#3B82F6]/20 text-[#3B82F6] rounded-md px-1.5 text-xs font-bold group-hover:bg-[#3B82F6] group-hover:text-white transition-colors">+</span>
            `;

            // 3. Botón de Usuario (Ajustes)
            const userBtn = document.createElement('button');
            userBtn.className = 'w-9 h-9 rounded-xl bg-gradient-to-tr from-[#3B82F6] to-[#FFB000] flex items-center justify-center text-black font-black text-sm uppercase shadow-[0_0_10px_rgba(255,176,0,0.4)] hover:scale-105 transition-transform border border-white/20';
            const initial = user.email ? user.email.charAt(0) : 'U';
            userBtn.textContent = initial;
            userBtn.onclick = () => {
                document.body.appendChild(SettingsModal());
            };

            rightPart.appendChild(creditsBadge);
            rightPart.appendChild(userBtn);
        }
    };

    // Estado inicial (cargando)
    updateRightUI(null);

    // ==========================================
    // ESCUCHADOR DE FIREBASE (MAGIA EN TIEMPO REAL)
    // ==========================================
    onAuthStateChanged(auth, (user) => {
        if (user) {
            updateRightUI(user, '...');
            
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid);
            unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const currentCredits = data.credits !== undefined ? data.credits : 0;
                    const role = data.role || 'user'; // Leemos el rol de la base de datos
                    updateRightUI(user, currentCredits, role);
                }
            });
        } else {
            if (unsubscribeSnapshot) {
                unsubscribeSnapshot();
                unsubscribeSnapshot = null;
            }
            updateRightUI(null);
        }
    });

    navBar.appendChild(leftPart);
    navBar.appendChild(rightPart);

    header.appendChild(navBar);

    return header;
}
