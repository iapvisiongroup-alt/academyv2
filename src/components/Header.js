import { SettingsModal } from './SettingsModal.js';

export function Header(navigate) {
    const header = document.createElement('header');
    header.className = 'w-full flex flex-col z-50 sticky top-0';

    // 2. Main Navigation Bar
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

    const menu = document.createElement('nav');
    menu.className = 'hidden lg:flex items-center gap-6 text-[13px] font-bold text-white/50';
    
    // Rutas y traducciones (Academia de IA añadida aquí)
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
            // Eliminar estado activo de todas las pestañas
            Array.from(menu.children).forEach(child => {
                child.classList.remove('text-[#FFB000]');
                const oldDot = child.querySelector('.active-dot');
                if(oldDot) oldDot.remove();
            });
            
            // Añadir estado activo a la seleccionada
            link.classList.add('text-[#FFB000]');
            const dot = document.createElement('div');
            dot.className = 'absolute -bottom-1.5 left-0 right-0 h-[2px] bg-[#FFB000] rounded-full shadow-[0_0_8px_rgba(255,176,0,0.6)] active-dot';
            link.appendChild(dot);

            // Enviar la ruta exacta al router (main.js)
            navigate(item.id);
        };

        menu.appendChild(link);
    });

    leftPart.appendChild(logoContainer);
    leftPart.appendChild(menu);

    const rightPart = document.createElement('div');
    rightPart.className = 'flex items-center gap-4';

    const keyBtn = document.createElement('button');
    keyBtn.className = 'p-2 text-white/50 hover:text-[#FFB000] transition-colors';
    keyBtn.title = 'Ajustes Muapi';
    keyBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3m-3-3l-2.25-2.25"/>
        </svg>
    `;
    keyBtn.onclick = () => {
        document.body.appendChild(SettingsModal());
    };

    rightPart.appendChild(keyBtn);

    navBar.appendChild(leftPart);
    navBar.appendChild(rightPart);

    header.appendChild(navBar);

    return header;
}
