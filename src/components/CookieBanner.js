export function CookieBanner() {
    // Si el usuario ya aceptó o rechazó las cookies, no mostramos el banner
    if (localStorage.getItem('kreateia_cookies_accepted')) return null;

    const banner = document.createElement('div');
    // Diseño flotante inferior izquierdo (estilo SaaS moderno)
    banner.className = 'fixed bottom-0 left-0 right-0 md:bottom-6 md:left-6 md:right-auto md:max-w-sm bg-[#111]/95 backdrop-blur-xl border border-white/10 p-5 rounded-t-2xl md:rounded-2xl shadow-2xl z-[999] animate-fade-in-up';
    
    banner.innerHTML = `
        <div class="flex items-center gap-3 mb-3">
            <span class="text-2xl drop-shadow-[0_0_10px_rgba(255,176,0,0.5)]">🍪</span>
            <h3 class="text-white font-bold text-sm">Valoramos tu privacidad</h3>
        </div>
        <p class="text-white/50 text-xs mb-4 leading-relaxed">
            Utilizamos cookies propias y de terceros para personalizar tu experiencia, ofrecer servicios B2B adaptados y analizar nuestro tráfico.
        </p>
        <div class="flex gap-2">
            <button id="accept-cookies" class="flex-1 bg-[#FFB000] text-black px-4 py-2.5 rounded-xl text-xs font-bold hover:shadow-[0_0_15px_rgba(255,176,0,0.4)] hover:scale-105 active:scale-95 transition-all">
                Aceptar Todas
            </button>
            <button id="reject-cookies" class="flex-1 bg-white/5 text-white/70 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-white/10 transition-all border border-white/5">
                Solo Esenciales
            </button>
        </div>
    `;

    // Lógica de los botones
    banner.querySelector('#accept-cookies').onclick = () => {
        localStorage.setItem('kreateia_cookies_accepted', 'true');
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(20px)';
        setTimeout(() => banner.remove(), 300);
    };

    banner.querySelector('#reject-cookies').onclick = () => {
        localStorage.setItem('kreateia_cookies_accepted', 'false');
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(20px)';
        setTimeout(() => banner.remove(), 300);
    };

    return banner;
}
