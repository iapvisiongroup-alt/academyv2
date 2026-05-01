import { auth } from '../lib/firebase.js';

export function PricingModal() {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/95 backdrop-blur-2xl flex items-center justify-center z-[99999] p-4 animate-fade-in overflow-y-auto';

    const modal = document.createElement('div');
    modal.className = 'w-full max-w-5xl bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-6 md:p-10 shadow-[0_0_80px_rgba(0,0,0,0.8)] relative my-auto';

    modal.innerHTML = `
        <button id="close-pricing-btn" class="absolute top-6 right-6 text-white/30 hover:text-white p-2 transition-colors bg-white/5 rounded-full hover:bg-white/10">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>

        <div class="text-center mb-10 mt-4">
            <h2 class="text-3xl md:text-5xl font-black text-white mb-4 tracking-tight">Recarga tus <span class="text-transparent bg-clip-text bg-gradient-to-r from-[#3B82F6] to-[#FFB000]">Créditos</span></h2>
            <p class="text-white/50 text-sm md:text-base max-w-xl mx-auto">Sin suscripciones mensuales. Paga solo por lo que usas. Los créditos nunca caducan y sirven para todas nuestras herramientas de IA.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <!-- Plan Básico -->
            <div class="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col hover:border-[#3B82F6]/50 transition-colors group">
                <div class="text-[#3B82F6] font-bold tracking-widest text-xs uppercase mb-2">Iniciación</div>
                <div class="flex items-baseline gap-1 mb-4">
                    <span class="text-4xl font-black text-white">9,99€</span>
                </div>
                <div class="flex items-center gap-2 mb-8 bg-black/30 w-fit px-3 py-1.5 rounded-lg border border-white/5">
                    <span>🪙</span> <span class="text-white font-bold">1,000 CR</span>
                </div>
                <ul class="space-y-3 text-sm text-white/60 mb-8 flex-grow">
                    <li class="flex gap-2">✓ <span>~250 Imágenes Flux</span></li>
                    <li class="flex gap-2">✓ <span>~10 Vídeos IA (5s)</span></li>
                    <li class="flex gap-2">✓ <span>Soporte estándar</span></li>
                </ul>
                <button class="buy-btn w-full py-3 rounded-xl font-bold bg-white/10 text-white hover:bg-[#3B82F6] hover:text-white transition-all" data-plan="starter">
                    Comprar 1k Créditos
                </button>
            </div>

            <!-- Plan Pro (Destacado) -->
            <div class="bg-gradient-to-b from-[#FFB000]/20 to-transparent border-2 border-[#FFB000] rounded-3xl p-6 md:p-8 flex flex-col relative transform md:-translate-y-4 shadow-[0_0_30px_rgba(255,176,0,0.15)]">
                <div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#FFB000] text-black font-black text-[10px] uppercase tracking-widest px-4 py-1 rounded-full">Más Popular</div>
                <div class="text-[#FFB000] font-bold tracking-widest text-xs uppercase mb-2">Creador Pro</div>
                <div class="flex items-baseline gap-1 mb-4">
                    <span class="text-4xl font-black text-white">24,99€</span>
                    <span class="text-white/30 text-sm line-through">29,99€</span>
                </div>
                <div class="flex items-center gap-2 mb-8 bg-black/30 w-fit px-3 py-1.5 rounded-lg border border-[#FFB000]/30">
                    <span>🪙</span> <span class="text-white font-bold">3,000 CR</span>
                </div>
                <ul class="space-y-3 text-sm text-white/80 mb-8 flex-grow">
                    <li class="flex gap-2">✓ <span>~750 Imágenes Flux</span></li>
                    <li class="flex gap-2">✓ <span>~30 Vídeos IA (5s)</span></li>
                    <li class="flex gap-2">✓ <span>~15 Lip Syncs (10s)</span></li>
                    <li class="flex gap-2">✓ <span>Prioridad en generación</span></li>
                </ul>
                <button class="buy-btn w-full py-4 rounded-xl font-black bg-[#FFB000] text-black hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,176,0,0.4)]" data-plan="pro">
                    Comprar 3k Créditos
                </button>
            </div>

            <!-- Plan Max -->
            <div class="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col hover:border-white/30 transition-colors">
                <div class="text-white/50 font-bold tracking-widest text-xs uppercase mb-2">Estudio Max</div>
                <div class="flex items-baseline gap-1 mb-4">
                    <span class="text-4xl font-black text-white">69,99€</span>
                </div>
                <div class="flex items-center gap-2 mb-8 bg-black/30 w-fit px-3 py-1.5 rounded-lg border border-white/5">
                    <span>🪙</span> <span class="text-white font-bold">10,000 CR</span>
                </div>
                <ul class="space-y-3 text-sm text-white/60 mb-8 flex-grow">
                    <li class="flex gap-2">✓ <span>Generaciones masivas</span></li>
                    <li class="flex gap-2">✓ <span>Uso intensivo de Modo Cine</span></li>
                    <li class="flex gap-2">✓ <span>Máxima prioridad</span></li>
                    <li class="flex gap-2">✓ <span>Soporte VIP 24/7</span></li>
                </ul>
                <button class="buy-btn w-full py-3 rounded-xl font-bold bg-white/10 text-white hover:bg-white hover:text-black transition-all" data-plan="max">
                    Comprar 10k Créditos
                </button>
            </div>
        </div>
        
        <div class="text-center mt-8 flex items-center justify-center gap-2 opacity-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span class="text-xs font-medium">Pagos seguros procesados por Stripe. Cifrado SSL de 256 bits.</span>
        </div>
    `;

    modal.querySelector('#close-pricing-btn').onclick = () => document.body.removeChild(overlay);

    // Lógica temporal para los botones de compra
    const buttons = modal.querySelectorAll('.buy-btn');
    buttons.forEach(btn => {
        btn.onclick = () => {
            const plan = btn.getAttribute('data-plan');
            const user = auth.currentUser;
            
            if (!user) {
                alert("Debes iniciar sesión primero para comprar créditos.");
                document.body.removeChild(overlay);
                return;
            }

            // Aquí inyectaremos los Payment Links de Stripe más adelante
            const stripeLinks = {
                starter: "https://buy.stripe.com/TU_ENLACE_STARTER",
                pro: "https://buy.stripe.com/TU_ENLACE_PRO",
                max: "https://buy.stripe.com/TU_ENLACE_MAX"
            };

            // Mandamos al usuario a Stripe, pasándole su email para que sepamos quién ha pagado
            const checkoutUrl = `${stripeLinks[plan]}?prefilled_email=${encodeURIComponent(user.email)}`;
            
            alert(`AQUÍ SE ABRIRÁ STRIPE.\n\nSimulando redirección a:\n${checkoutUrl}\n\n(En el siguiente paso configuraremos tus enlaces reales)`);
            // window.location.href = checkoutUrl; // Descomentar esto cuando tengamos los enlaces reales
        };
    });

    overlay.onclick = (e) => {
        if(e.target === overlay) document.body.removeChild(overlay);
    }

    overlay.appendChild(modal);
    return overlay;
}
