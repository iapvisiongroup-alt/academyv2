export function SettingsModal(onClose) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in-up';
    
    const modal = document.createElement('div');
    modal.className = 'bg-[#0a0a0a] border border-white/10 rounded-2xl p-0 w-full max-w-sm shadow-2xl flex flex-col overflow-hidden';
    
    // --- Header del Modal ---
    const header = document.createElement('div');
    header.className = 'p-6 bg-gradient-to-br from-white/5 to-transparent border-b border-white/5 relative';
    
    // Botón cerrar (X)
    const closeBtn = document.createElement('button');
    closeBtn.className = 'absolute top-4 right-4 text-white/40 hover:text-white transition-colors';
    closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
    closeBtn.onclick = () => {
        document.body.removeChild(overlay);
        if (onClose) onClose();
    };
    
    header.innerHTML = `
        <h2 class="text-xl font-bold text-white mb-1">Mi Cuenta</h2>
        <div class="flex items-center gap-3 mt-4">
            <div class="w-12 h-12 rounded-full bg-gradient-to-tr from-[#3B82F6] to-[#FFB000] flex items-center justify-center text-white font-bold text-lg shadow-[0_0_15px_rgba(255,176,0,0.3)]">
                U
            </div>
            <div class="flex flex-col">
                <span class="text-sm font-bold text-white">Usuario Pro</span>
                <span class="text-xs text-white/50">usuario@kreateia.com</span>
            </div>
        </div>
    `;
    header.appendChild(closeBtn);

    // --- Cuerpo de Opciones ---
    const body = document.createElement('div');
    body.className = 'flex flex-col p-2';

    const createMenuOption = (icon, label, isDestructive = false, isPremium = false) => {
        const btn = document.createElement('button');
        btn.className = `w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
            isDestructive 
                ? 'text-red-400 hover:bg-red-500/10' 
                : 'text-white/80 hover:bg-white/5 hover:text-white'
        }`;
        
        btn.innerHTML = `
            <div class="opacity-70">${icon}</div>
            <span class="text-sm font-medium flex-1 text-left">${label}</span>
            ${isPremium ? '<span class="text-[9px] uppercase tracking-wider font-bold bg-gradient-to-r from-[#FF6B00] to-[#FFB000] text-black px-2 py-0.5 rounded-full">Pro</span>' : ''}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-30"><path d="M9 18l6-6-6-6"/></svg>
        `;
        return btn;
    };

    // Opción: Suscripción
    const subBtn = createMenuOption(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
        'Suscripción y Créditos',
        false,
        true
    );
    subBtn.onclick = () => {
        alert('Próximamente: Redirección a la tabla de precios y facturación Stripe.');
    };

    // Opción: Preferencias
    const prefBtn = createMenuOption(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
        'Preferencias de la cuenta'
    );

    // Opción: Soporte
    const supportBtn = createMenuOption(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
        'Soporte Técnico'
    );

    const divider = document.createElement('div');
    divider.className = 'h-px w-full bg-white/5 my-2';

    // Opción: Cerrar Sesión
    const logoutBtn = createMenuOption(
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>',
        'Cerrar Sesión',
        true
    );
    logoutBtn.onclick = () => {
        // Por ahora simulamos el cierre borrando el localstorage (luego será con Firebase)
        localStorage.removeItem('muapi_key');
        alert('Sesión cerrada. Serás redirigido a la pantalla de inicio.');
        document.body.removeChild(overlay);
        window.location.reload();
    };

    body.appendChild(subBtn);
    body.appendChild(prefBtn);
    body.appendChild(supportBtn);
    body.appendChild(divider);
    body.appendChild(logoutBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);

    // Close on outside click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
            if (onClose) onClose();
        }
    });

    return overlay;
}
