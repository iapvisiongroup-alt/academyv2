import { auth } from '../lib/firebase.js';

const CREDIT_PLANS = {
    starter: {
        id: 'starter',
        name: 'Iniciación',
        price: '9,99€',
        credits: 1000,
        shortCredits: '1.000 CR',
        button: 'Comprar 1.000 créditos',
        accent: '#3B82F6',
        featured: false,
        stripeUrl: 'https://buy.stripe.com/5kQdRbdff73IfNI7wr2B203',
        highlights: [
            '1.000 créditos añadidos a tu cuenta',
            'Válidos para imagen, vídeo y música',
            'El coste se muestra antes de generar',
            'Sin suscripción mensual',
        ],
    },
    pro: {
        id: 'pro',
        name: 'Creador Pro',
        price: '24,99€',
        credits: 3000,
        shortCredits: '3.000 CR',
        button: 'Comprar 3.000 créditos',
        accent: '#FFB000',
        featured: true,
        stripeUrl: 'https://buy.stripe.com/fZu14p2AB0Fkato8Av2B204',
        highlights: [
            '3.000 créditos añadidos a tu cuenta',
            'Mejor equilibrio para crear contenido frecuente',
            'Úsalos en KreateImage, KreateVideo y KreateMusic',
            'El consumo depende de calidad, duración y resolución',
        ],
    },
    max: {
        id: 'max',
        name: 'Estudio Max',
        price: '69,99€',
        credits: 10000,
        shortCredits: '10.000 CR',
        button: 'Comprar 10.000 créditos',
        accent: '#FFFFFF',
        featured: false,
        stripeUrl: 'https://buy.stripe.com/3cI8wR7UV9bQ7hc4kf2B205',
        highlights: [
            '10.000 créditos añadidos a tu cuenta',
            'Pensado para uso intensivo',
            'Ideal para generar varias piezas y variaciones',
            'Sin límites artificiales por tipo de herramienta',
        ],
    },
};

function buildCheckoutUrl(plan, user) {
    const url = new URL(plan.stripeUrl);

    if (user.email) {
        url.searchParams.set('prefilled_email', user.email);
    }

    // Mantengo plan___uid por compatibilidad con tu webhook actual.
    // En backend valida siempre el plan usando el Payment Link real, no solo este texto.
    url.searchParams.set('client_reference_id', `${plan.id}___${user.uid}`);
    url.searchParams.set('utm_source', 'kreateia');
    url.searchParams.set('utm_medium', 'credits_modal');
    url.searchParams.set('utm_content', plan.id);

    return url.toString();
}

export function PricingModal() {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/95 backdrop-blur-2xl flex items-center justify-center z-[99999] p-4 animate-fade-in overflow-y-auto';

    const modal = document.createElement('div');
    modal.className = 'w-full max-w-5xl bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-6 md:p-10 shadow-[0_0_80px_rgba(0,0,0,0.8)] relative my-auto';

    const planCards = Object.values(CREDIT_PLANS).map(plan => {
        const isPro = plan.featured;
        const border = isPro ? 'border-2 border-[#FFB000]' : 'border border-white/10';
        const bg = isPro ? 'bg-gradient-to-b from-[#FFB000]/20 to-transparent' : 'bg-white/5';
        const lift = isPro ? 'relative transform md:-translate-y-4 shadow-[0_0_30px_rgba(255,176,0,0.15)]' : '';
        const btnClass = isPro
            ? 'bg-[#FFB000] text-black hover:scale-105 shadow-[0_0_20px_rgba(255,176,0,0.4)]'
            : 'bg-white/10 text-white hover:bg-white hover:text-black';

        return `
            <div class="${bg} ${border} rounded-3xl p-6 md:p-8 flex flex-col transition-colors ${lift}" style="--accent:${plan.accent}">
                ${isPro ? '<div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#FFB000] text-black font-black text-[10px] uppercase tracking-widest px-4 py-1 rounded-full">Más Popular</div>' : ''}

                <div class="font-bold tracking-widest text-xs uppercase mb-2" style="color:${plan.accent}">
                    ${plan.name}
                </div>

                <div class="flex items-baseline gap-1 mb-4">
                    <span class="text-4xl font-black text-white">${plan.price}</span>
                </div>

                <div class="flex items-center gap-2 mb-6 bg-black/30 w-fit px-3 py-1.5 rounded-lg border border-white/10">
                    <span>🪙</span>
                    <span class="text-white font-bold">${plan.shortCredits}</span>
                </div>

                <p class="text-white/45 text-xs leading-relaxed mb-6">
                    Los créditos se añaden a tu saldo y se consumen según la herramienta, resolución, duración y calidad elegida.
                </p>

                <ul class="space-y-3 text-sm ${isPro ? 'text-white/80' : 'text-white/60'} mb-8 flex-grow">
                    ${plan.highlights.map(item => `
                        <li class="flex gap-2">
                            <span style="color:${plan.accent}">✓</span>
                            <span>${item}</span>
                        </li>
                    `).join('')}
                </ul>

                <button class="buy-btn w-full py-3 rounded-xl font-bold transition-all ${btnClass}" data-plan="${plan.id}">
                    ${plan.button}
                </button>
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <button id="close-pricing-btn" class="absolute top-6 right-6 text-white/30 hover:text-white p-2 transition-colors bg-white/5 rounded-full hover:bg-white/10">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </button>

        <div class="text-center mb-10 mt-4">
            <h2 class="text-3xl md:text-5xl font-black text-white mb-4 tracking-tight">
                Recarga tus
                <span class="text-transparent bg-clip-text bg-gradient-to-r from-[#3B82F6] to-[#FFB000]">
                    Créditos
                </span>
            </h2>

            <p class="text-white/50 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
                Compra créditos para usar en KreateImage, KreateVideo y KreateMusic. Antes de cada generación verás el coste exacto.
            </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            ${planCards}
        </div>

        <div class="max-w-4xl mx-auto mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
            <p class="text-white/70 text-xs md:text-sm leading-relaxed m-0">
                <strong class="text-white">Información importante:</strong>
                los ejemplos de consumo no se calculan aquí porque cada herramienta tiene costes distintos.
                Una imagen, un vídeo o una canción pueden consumir más o menos créditos según resolución, duración, calidad y modo seleccionado.
            </p>
        </div>

        <div class="text-center mt-6 flex items-center justify-center gap-2 opacity-60">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span class="text-xs font-medium">Pagos procesados de forma segura por Stripe.</span>
        </div>
    `;

    modal.querySelector('#close-pricing-btn').onclick = () => {
        document.body.removeChild(overlay);
    };

    modal.querySelectorAll('.buy-btn').forEach(btn => {
        btn.onclick = () => {
            const planId = btn.getAttribute('data-plan');
            const plan = CREDIT_PLANS[planId];
            const user = auth.currentUser;

            if (!user) {
                alert('Debes iniciar sesión primero para comprar créditos.');
                document.body.removeChild(overlay);
                return;
            }

            if (!plan) {
                alert('Plan no válido.');
                return;
            }

            window.location.href = buildCheckoutUrl(plan, user);
        };
    });

    overlay.onclick = (e) => {
        if (e.target === overlay) document.body.removeChild(overlay);
    };

    overlay.appendChild(modal);
    return overlay;
}
