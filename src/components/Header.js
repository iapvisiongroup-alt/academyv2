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
    // CORRECCIÓN MÓVIL: En lugar de justificar entre extremos, hacemos que el contenido pueda envolverse y deslizar
    navBar.className = 'w-full min-h-[64px] bg-[#030303] flex items-center justify-between px-3 md:px-6 border-b border-white/5 backdrop-blur-md bg-opacity-95 flex-wrap md:flex-nowrap gap-y-2 py-2 md:py-0';

    const leftPart = document.createElement('div');
    // CORRECCIÓN MÓVIL: En móvil, el logo y el menú ocuparán todo el ancho.
    leftPart.className = 'flex flex-col md:flex-row items-center gap-2 md:gap-8 w-full md:w-auto overflow-hidden';

    // Top Bar (Logo + Botones derechos en móvil)
    const topBarMobile = document.createElement('div');
    topBarMobile.className = 'flex items-center justify-between w-full md:w-auto';

    // Logo KreateIA
    const logoContainer = document.createElement('div');
    logoContainer.className = 'flex items-center gap-2 cursor-pointer hover:scale-105 transition-transform shrink-0';
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
        <div class="flex items-center font-bold tracking-tight text-lg">
            <span style="background: linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%); -webkit-background-clip: text; color: transparent;">Kreate</span>
            <span style="background: linear-gradient(135deg, #FF6B00 0%, #FFB000 100%); -webkit-background-clip: text; color: transparent; margin-left: 2px;">IA</span>
            <span class="ml-2 text-white/50 font-medium text-sm hidden sm:block">Studio</span>
        </div>
    `;
    logoContainer.onclick = () => navigate('image');

    // ==========================================
    // CONTENEDOR DERECHO (Botones usuario)
    // ==========================================
    const rightPart = document.createElement('div');
    rightPart.className = 'flex items-center gap-2 md:gap-4 shrink-0';

    topBarMobile.appendChild(logoContainer);
    topBarMobile.appendChild(rightPart); // Movemos los botones al lado del logo en móvil
    
    leftPart.appendChild(topBarMobile);

    // ==========================================
    // MENÚ DESLIZABLE (CARRUSEL)
    // ==========================================
    const menu = document.createElement('nav');
    // CORRECCIÓN MÓVIL: Quitado el 'hidden'. Añadido overflow-x-auto y no-scrollbar para que se deslice con el dedo.
    menu.className = 'flex items-center gap-4 md:gap-6 text-[12px] md:text-[13px] font-bold text-white/50 w-full overflow-x-auto custom-scrollbar md:overflow-visible pb-1 md:pb-0 whitespace-nowrap mask-edges';
    
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
        link.className = `hover:text-white transition-all cursor-pointer relative group shrink-0 ${item.id === 'image' ? 'text-[#FFB000]' : ''}`;

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

            // Hacer scroll suave hacia el elemento pulsado en móvil
            link.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

            navigate(item.id);
        };

        menu.appendChild(link);
    });

    leftPart.appendChild(menu);

    let unsubscribeSnapshot = null;

    // Función para repintar la parte derecha
    const updateRightUI = (user, credits = '...', role = 'user') => {
        rightPart.innerHTML = '';

        if (!user) {
            const loginBtn = document.createElement('button');
            loginBtn.className = 'px-3 py-1.5 md:px-5 md:py-2 bg-gradient-to-r from-[#3B82F6] to-[#FFB000] text-black font-black text-[10px] md:text-sm uppercase rounded-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(255,176,0,0.3)] flex items-center gap-1.5 md:gap-2';
            loginBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="md:w-4 md:h-4"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
                <span class="hidden sm:inline">Iniciar Sesión</span>
                <span class="sm:hidden">Entrar</span>
            `;
            loginBtn.onclick = () => {
                document.body.appendChild(AuthModal());
            };
            rightPart.appendChild(loginBtn);

        } else {
            if (role === 'admin') {
                const adminBtn = document.createElement('button');
                adminBtn.className = 'w-7 h-7 md:w-9 md:h-9 rounded-xl bg-gradient-to-br from-[#FFB000]/20 to-transparent border border-[#FFB000]/50 flex items-center justify-center text-sm md:text-xl shadow-[0_0_15px_rgba(255,176,0,0.2)] hover:scale-105 transition-transform mr-0 md:mr-2';
                adminBtn.title = 'Panel de Control Maestro';
                adminBtn.textContent = '👑';
                adminBtn.onclick = () => {
                    document.body.appendChild(AdminPanel());
                };
                rightPart.appendChild(adminBtn);
            }

            const creditsBadge = document.createElement('div');
            creditsBadge.className = 'flex items-center gap-1 md:gap-2 bg-white/5 border border-white/10 px-2 py-1 md:px-3 md:py-1.5 rounded-lg md:rounded-xl cursor-pointer hover:bg-white/10 hover:border-white/30 transition-all shadow-inner group';
            creditsBadge.title = 'Añadir más créditos';
            creditsBadge.onclick = () => {
                document.body.appendChild(PricingModal());
            };
            creditsBadge.innerHTML = `
                <span class="text-[10px] md:text-sm">🪙</span>
                <span class="text-white font-bold text-[10px] md:text-sm font-mono tracking-tight">${credits}</span>
                <span class="bg-[#3B82F6]/20 text-[#3B82F6] rounded px-1 text-[8px] md:text-xs font-bold group-hover:bg-[#3B82F6] group-hover:text-white transition-colors hidden sm:inline">+</span>
            `;

            const userBtn = document.createElement('button');
            userBtn.className = 'w-7 h-7 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-tr from-[#3B82F6] to-[#FFB000] flex items-center justify-center text-black font-black text-xs md:text-sm uppercase shadow-[0_0_10px_rgba(255,176,0,0.4)] hover:scale-105 transition-transform border border-white/20';
            const initial = user.email ? user.email.charAt(0) : 'U';
            userBtn.textContent = initial;
            userBtn.onclick = () => {
                document.body.appendChild(SettingsModal());
            };

            rightPart.appendChild(creditsBadge);
            rightPart.appendChild(userBtn);
        }
    };

    updateRightUI(null);

    onAuthStateChanged(auth, (user) => {
        if (user) {
            updateRightUI(user, '...');
            
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid);
            unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const currentCredits = data.credits !== undefined ? data.credits : 0;
                    const role = data.role || 'user'; 
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

    // Añadimos unos estilos CSS rápidos para ocular la barra de scroll nativa fea en móvil y hacer efecto difuminado en los bordes
    const style = document.createElement('style');
    style.innerHTML = `
        .custom-scrollbar::-webkit-scrollbar { display: none; }
        .custom-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @media (max-width: 768px) {
            .mask-edges {
                -webkit-mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
                mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
            }
        }
    `;
    document.head.appendChild(style);

    header.appendChild(navBar);

    return header;
}
