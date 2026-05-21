export function LandingPage(navigate) {

    const root = document.createElement('div');
    root.style.cssText = 'width:100%;height:100%;overflow-y:auto;overflow-x:hidden;background:#050505;font-family:"SF Pro Display",-apple-system,BlinkMacSystemFont,sans-serif;scroll-behavior:smooth';

    // ── Inject styles ─────────────────────────────────────────────────────────
    if (!document.querySelector('#landing-styles')) {
        const st = document.createElement('style');
        st.id = 'landing-styles';
        st.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Inter:wght@300;400;500;600&display=swap');

            #landing-root { font-family: 'Inter', sans-serif; }
            #landing-root h1, #landing-root h2, #landing-root .syne { font-family: 'Syne', sans-serif; }

            @keyframes lp-fade-up {
                from { opacity:0; transform:translateY(32px); }
                to   { opacity:1; transform:translateY(0); }
            }
            @keyframes lp-fade-in {
                from { opacity:0; } to { opacity:1; }
            }
            @keyframes lp-float {
                0%,100% { transform:translateY(0px) rotate(0deg); }
                50%     { transform:translateY(-12px) rotate(1deg); }
            }
            @keyframes lp-pulse-glow {
                0%,100% { box-shadow:0 0 40px rgba(245,158,11,.15); }
                50%      { box-shadow:0 0 80px rgba(245,158,11,.35); }
            }
            @keyframes lp-scroll-x {
                from { transform:translateX(0); }
                to   { transform:translateX(-50%); }
            }
            @keyframes lp-spin-slow {
                from { transform:rotate(0deg); } to { transform:rotate(360deg); }
            }
            @keyframes lp-shimmer {
                0%   { background-position:200% center; }
                100% { background-position:-200% center; }
            }
            @keyframes lp-counter {
                from { opacity:0; transform:scale(.8); }
                to   { opacity:1; transform:scale(1); }
            }

            .lp-visible { animation: lp-fade-up .7s cubic-bezier(.16,1,.3,1) both; }
            .lp-visible-d1 { animation-delay:.1s; }
            .lp-visible-d2 { animation-delay:.2s; }
            .lp-visible-d3 { animation-delay:.3s; }
            .lp-visible-d4 { animation-delay:.4s; }
            .lp-visible-d5 { animation-delay:.5s; }

            .lp-card-hover {
                transition: transform .3s cubic-bezier(.16,1,.3,1), box-shadow .3s ease, border-color .3s ease;
            }
            .lp-card-hover:hover {
                transform: translateY(-6px);
                box-shadow: 0 24px 60px rgba(0,0,0,.6);
            }

            .lp-shimmer-text {
                background: linear-gradient(90deg, #fff 0%, #f59e0b 30%, #fff 60%, #f59e0b 90%);
                background-size: 200% auto;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                animation: lp-shimmer 4s linear infinite;
            }

            .lp-btn-primary {
                background: linear-gradient(135deg, #f59e0b, #fb923c);
                border: none; border-radius: 100px;
                color: #000; font-weight: 800; cursor: pointer;
                transition: transform .2s, box-shadow .2s;
                position: relative; overflow: hidden;
            }
            .lp-btn-primary::before {
                content:''; position:absolute; inset:0;
                background:linear-gradient(135deg,#fbbf24,#f97316);
                opacity:0; transition:opacity .2s;
            }
            .lp-btn-primary:hover { transform:scale(1.04); box-shadow:0 12px 40px rgba(245,158,11,.4); }
            .lp-btn-primary:hover::before { opacity:1; }
            .lp-btn-primary span { position:relative; z-index:1; }

            .lp-btn-secondary {
                background: transparent;
                border: 1px solid rgba(255,255,255,.2); border-radius: 100px;
                color: #fff; font-weight: 600; cursor: pointer;
                transition: all .2s;
            }
            .lp-btn-secondary:hover { background:rgba(255,255,255,.08); border-color:rgba(255,255,255,.4); }

            .lp-feature-card {
                background: linear-gradient(145deg, #111 0%, #0d0d0d 100%);
                border: 1px solid #1f1f1f;
                border-radius: 20px; padding: 28px;
                transition: all .3s cubic-bezier(.16,1,.3,1);
                cursor: pointer;
                position: relative; overflow: hidden;
            }
            .lp-feature-card::before {
                content:''; position:absolute; inset:0; opacity:0;
                transition: opacity .3s;
                background: radial-gradient(circle at 50% 0%, rgba(245,158,11,.08) 0%, transparent 70%);
            }
            .lp-feature-card:hover { transform:translateY(-8px); border-color:#f59e0b44; box-shadow:0 32px 80px rgba(0,0,0,.5); }
            .lp-feature-card:hover::before { opacity:1; }

            .lp-noise::after {
                content:''; position:absolute; inset:0; pointer-events:none; z-index:0;
                background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
                opacity:.4;
            }
        `;
        document.head.appendChild(st);
    }

    root.id = 'landing-root';

    // ── HERO ──────────────────────────────────────────────────────────────────
    const hero = document.createElement('section');
    hero.style.cssText = 'position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 24px 60px;overflow:hidden;';

    // Animated background orbs
    hero.innerHTML = `
        <div style="position:absolute;inset:0;overflow:hidden;pointer-events:none">
            <div style="position:absolute;top:-20%;left:-10%;width:600px;height:600px;background:radial-gradient(circle,rgba(245,158,11,.12) 0%,transparent 70%);animation:lp-float 8s ease-in-out infinite"></div>
            <div style="position:absolute;bottom:-10%;right:-10%;width:800px;height:800px;background:radial-gradient(circle,rgba(59,130,246,.08) 0%,transparent 70%);animation:lp-float 10s ease-in-out infinite reverse"></div>
            <div style="position:absolute;top:40%;left:50%;transform:translateX(-50%);width:1000px;height:400px;background:radial-gradient(ellipse,rgba(245,158,11,.05) 0%,transparent 70%)"></div>
            <!-- Grid lines -->
            <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:60px 60px;mask-image:radial-gradient(ellipse 80% 80% at 50% 50%,#000 40%,transparent 100%)"></div>
        </div>

        <!-- Badge -->
        <div class="lp-visible" style="display:inline-flex;align-items:center;gap:8px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:100px;padding:6px 16px;margin-bottom:28px">
            <span style="width:6px;height:6px;background:#f59e0b;border-radius:50%;animation:lp-pulse-glow 2s ease-in-out infinite"></span>
            <span style="color:#f59e0b;font-size:12px;font-weight:700;letter-spacing:.05em;font-family:'Syne',sans-serif">PLATAFORMA DE CREACIÓN CON IA</span>
        </div>

        <!-- Headline -->
        <h1 class="syne lp-visible lp-visible-d1" style="font-size:clamp(42px,7vw,96px);font-weight:800;color:#fff;text-align:center;line-height:1.02;margin:0 0 24px;max-width:900px;letter-spacing:-.02em">
            Crea con<br>
            <span class="lp-shimmer-text">Inteligencia Artificial</span><br>
            sin límites
        </h1>

        <!-- Subheadline -->
        <p class="lp-visible lp-visible-d2" style="font-size:clamp(15px,2vw,20px);color:rgba(255,255,255,.5);text-align:center;max-width:560px;line-height:1.6;margin:0 0 40px;font-weight:300">
            Genera imágenes, vídeos y música de calidad profesional en segundos. Todo en un solo lugar.
        </p>

        <!-- CTA Buttons -->
        <div class="lp-visible lp-visible-d3" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-bottom:64px">
            <button class="lp-btn-primary" id="lp-cta-start" style="padding:16px 36px;font-size:16px">
                <span>Empezar gratis →</span>
            </button>
            <button class="lp-btn-secondary" id="lp-cta-explore" style="padding:16px 28px;font-size:15px">
                Ver ejemplos ↓
            </button>
        </div>

        <!-- Floating preview cards -->
        <div class="lp-visible lp-visible-d4" id="lp-preview-cards" style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;max-width:1000px;width:100%;position:relative;z-index:1">
        </div>
    `;

    // Preview cards with real-looking examples
    const previewData = [
        { icon:'🖼️', label:'Imagen', desc:'Retrato cinemático, 4K', color:'#3b82f6', delay:'0s' },
        { icon:'🎬', label:'Vídeo', desc:'Escena animada, 10s', color:'#f59e0b', delay:'.1s' },
        { icon:'🎵', label:'Música', desc:'Canción reggaeton, 2 min', color:'#a855f7', delay:'.2s' },
        { icon:'🎤', label:'Artista IA', desc:'Identidad vocal completa', color:'#ec4899', delay:'.3s' },
    ];

    const cardsContainer = hero.querySelector('#lp-preview-cards');
    previewData.forEach(({ icon, label, desc, color, delay }) => {
        const card = document.createElement('div');
        card.style.cssText = `
            background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
            border-radius:16px;padding:20px 24px;
            display:flex;align-items:center;gap:14px;
            animation:lp-float ${5 + Math.random()*3}s ease-in-out infinite;
            animation-delay:${delay};
            backdrop-filter:blur(12px);
            flex:1;min-width:200px;max-width:220px;
        `;
        card.innerHTML = `
            <div style="width:44px;height:44px;border-radius:12px;background:${color}22;border:1px solid ${color}44;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${icon}</div>
            <div>
                <p style="color:#fff;font-weight:700;margin:0;font-size:14px;font-family:'Syne',sans-serif">${label}</p>
                <p style="color:rgba(255,255,255,.4);margin:2px 0 0;font-size:11px">${desc}</p>
            </div>
        `;
        cardsContainer.appendChild(card);
    });

    hero.querySelector('#lp-cta-start').addEventListener('click', () => navigate('image'));
    hero.querySelector('#lp-cta-explore').addEventListener('click', () => {
        root.querySelector('#lp-features')?.scrollIntoView({ behavior:'smooth' });
    });

    root.appendChild(hero);

    // ── STATS BAR ─────────────────────────────────────────────────────────────
    const stats = document.createElement('section');
    stats.style.cssText = 'padding:32px 24px;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02)';
    stats.innerHTML = `
        <div style="max-width:900px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:24px;text-align:center">
            ${[
                { num:'3', label:'Estudios creativos' },
                { num:'10+', label:'Modelos de IA' },
                { num:'∞', label:'Generaciones simultáneas' },
                { num:'100%', label:'Tuyo para siempre' },
            ].map(({ num, label }) => `
                <div>
                    <p style="font-family:'Syne',sans-serif;font-size:36px;font-weight:800;color:#f59e0b;margin:0;line-height:1">${num}</p>
                    <p style="color:rgba(255,255,255,.4);font-size:12px;margin:6px 0 0;font-weight:500">${label}</p>
                </div>
            `).join('')}
        </div>
    `;
    root.appendChild(stats);

    // ── FEATURES ──────────────────────────────────────────────────────────────
    const features = document.createElement('section');
    features.id = 'lp-features';
    features.style.cssText = 'padding:80px 24px;max-width:1100px;margin:0 auto';

    const featData = [
        {
            id: 'image',
            icon: '🖼️',
            color: '#3b82f6',
            title: 'KreateImage',
            subtitle: 'Estudio de Imagen',
            desc: 'Genera imágenes fotorrealistas o artísticas desde texto o edita tus fotos con IA. Resoluciones hasta 4K. Estilos: fotorrealista, anime, cinematográfico, acuarela y más.',
            pills: ['Texto a imagen', 'Imagen a imagen', '720p → 4K', 'Múltiples estilos'],
            gradient: 'linear-gradient(135deg,#1e3a5f,#0d1b2e)',
            emoji: '📸',
        },
        {
            id: 'video',
            icon: '🎬',
            color: '#f59e0b',
            title: 'KreateVideo',
            subtitle: 'Estudio de Vídeo',
            desc: 'Anima imágenes, crea vídeos desde texto o transforma vídeos existentes. Hasta 15 segundos en alta calidad con los modelos más avanzados del mercado.',
            pills: ['Texto a vídeo', 'Imagen a vídeo', 'Vídeo a vídeo', 'Control de cámara'],
            gradient: 'linear-gradient(135deg,#3d2500,#1a1000)',
            emoji: '🎥',
        },
        {
            id: 'music',
            icon: '🎵',
            color: '#a855f7',
            title: 'KreateMusic',
            subtitle: 'Estudio de Música',
            desc: 'Crea artistas de IA con identidad visual y vocal propia. Genera canciones completas, letras, remixes y efectos de sonido. Hasta 3 minutos de música original.',
            pills: ['Artistas de IA', 'Canciones completas', 'Clonar voz', 'Remix & Extend'],
            gradient: 'linear-gradient(135deg,#2d1052,#130824)',
            emoji: '🎤',
        },
    ];

    features.innerHTML = `
        <div class="lp-visible" style="text-align:center;margin-bottom:56px">
            <p style="color:#f59e0b;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin:0 0 12px;font-family:'Syne',sans-serif">Tres estudios. Una plataforma.</p>
            <h2 class="syne" style="font-size:clamp(32px,5vw,56px);font-weight:800;color:#fff;margin:0;letter-spacing:-.02em">Todo lo que necesitas para crear</h2>
        </div>
        <div id="lp-feature-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px"></div>
    `;

    const featureGrid = features.querySelector('#lp-feature-grid');
    featData.forEach(({ id, icon, color, title, subtitle, desc, pills, gradient, emoji }) => {
        const card = document.createElement('div');
        card.className = 'lp-feature-card lp-visible';
        card.style.cssText += `cursor:pointer`;
        card.innerHTML = `
            <!-- Top visual -->
            <div style="height:140px;border-radius:12px;background:${gradient};margin:-28px -28px 24px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">
                <div style="position:absolute;inset:0;background:radial-gradient(circle at 30% 50%,${color}22 0%,transparent 60%)"></div>
                <span style="font-size:56px;filter:drop-shadow(0 8px 24px ${color}88)">${emoji}</span>
                <div style="position:absolute;top:12px;right:12px;background:${color}22;border:1px solid ${color}44;border-radius:8px;padding:4px 10px">
                    <span style="color:${color};font-size:10px;font-weight:700;font-family:'Syne',sans-serif">${icon} ${title}</span>
                </div>
            </div>
            <h3 class="syne" style="color:#fff;font-size:20px;font-weight:800;margin:0 0 6px">${title}</h3>
            <p style="color:${color};font-size:12px;font-weight:600;margin:0 0 12px;text-transform:uppercase;letter-spacing:.08em">${subtitle}</p>
            <p style="color:rgba(255,255,255,.55);font-size:13px;line-height:1.7;margin:0 0 20px">${desc}</p>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:24px">
                ${pills.map(p => `<span style="background:${color}15;border:1px solid ${color}33;color:${color};font-size:11px;font-weight:600;padding:4px 10px;border-radius:100px">${p}</span>`).join('')}
            </div>
            <button style="width:100%;padding:12px;background:${color}22;border:1px solid ${color}44;border-radius:100px;color:${color};font-size:13px;font-weight:700;cursor:pointer;font-family:'Syne',sans-serif;transition:all .2s" 
                onmouseover="this.style.background='${color}33'" 
                onmouseout="this.style.background='${color}22'">
                Ir a ${title} →
            </button>
        `;
        card.querySelector('button').addEventListener('click', () => navigate(id));
        card.addEventListener('click', () => navigate(id));
        featureGrid.appendChild(card);
    });

    root.appendChild(features);

    // ── HOW IT WORKS ──────────────────────────────────────────────────────────
    const how = document.createElement('section');
    how.style.cssText = 'padding:80px 24px;background:rgba(255,255,255,.02);border-top:1px solid rgba(255,255,255,.06)';
    how.innerHTML = `
        <div style="max-width:900px;margin:0 auto">
            <div class="lp-visible" style="text-align:center;margin-bottom:56px">
                <p style="color:#f59e0b;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin:0 0 12px;font-family:'Syne',sans-serif">Así de fácil</p>
                <h2 class="syne" style="font-size:clamp(28px,4vw,48px);font-weight:800;color:#fff;margin:0">Crea en 3 pasos</h2>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:32px">
                ${[
                    { n:'01', icon:'✍️', title:'Describe tu idea', desc:'Escribe lo que quieres crear en lenguaje natural. Cuanto más detallado, mejor resultado.' },
                    { n:'02', icon:'⚡', title:'La IA genera', desc:'Nuestros modelos procesan tu petición en segundos. Puedes lanzar varias generaciones a la vez.' },
                    { n:'03', icon:'✨', title:'Descarga y usa', desc:'Descarga tu creación en alta calidad y úsala donde quieras. Es tuya para siempre.' },
                ].map(({ n, icon, title, desc }) => `
                    <div class="lp-visible" style="text-align:center;padding:32px 20px">
                        <div style="width:64px;height:64px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 20px">
                            ${icon}
                        </div>
                        <p style="color:rgba(245,158,11,.4);font-size:11px;font-weight:800;letter-spacing:.15em;margin:0 0 8px;font-family:'Syne',sans-serif">${n}</p>
                        <h3 class="syne" style="color:#fff;font-size:18px;font-weight:800;margin:0 0 10px">${title}</h3>
                        <p style="color:rgba(255,255,255,.45);font-size:13px;line-height:1.7;margin:0">${desc}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    root.appendChild(how);

    // ── USE CASES TICKER ──────────────────────────────────────────────────────
    const ticker = document.createElement('section');
    ticker.style.cssText = 'padding:48px 0;overflow:hidden;border-top:1px solid rgba(255,255,255,.06)';
    const items = ['Fotos de producto', 'Vídeos para redes', 'Música para marcas', 'Artistas virtuales', 'Publicidad con IA', 'Logos y branding', 'Contenido para TikTok', 'Bandas sonoras', 'Retratos artísticos', 'Animaciones', 'Covers musicales', 'Posts para Instagram'];
    const tickerInner = items.concat(items).map(i => `<span style="display:inline-flex;align-items:center;gap:12px;padding:0 28px;color:rgba(255,255,255,.35);font-size:14px;font-weight:500;white-space:nowrap">${i}<span style="color:#f59e0b;font-size:10px">✦</span></span>`).join('');
    ticker.innerHTML = `
        <div style="display:flex;animation:lp-scroll-x 30s linear infinite;width:max-content">
            ${tickerInner}
        </div>
    `;
    root.appendChild(ticker);

    // ── PRICING TEASER ────────────────────────────────────────────────────────
    const pricing = document.createElement('section');
    pricing.style.cssText = 'padding:80px 24px;max-width:900px;margin:0 auto;text-align:center';
    pricing.innerHTML = `
        <div class="lp-visible" style="margin-bottom:48px">
            <p style="color:#f59e0b;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin:0 0 12px;font-family:'Syne',sans-serif">Sin suscripciones</p>
            <h2 class="syne" style="font-size:clamp(28px,4vw,48px);font-weight:800;color:#fff;margin:0 0 16px">Paga solo por lo que creas</h2>
            <p style="color:rgba(255,255,255,.45);font-size:15px;max-width:500px;margin:0 auto">Los créditos no caducan. Sin cuotas mensuales. Sin sorpresas. 1 crédito = $0.01 — precios desde 4 🪙 por generación.</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:40px">
            ${[
                { name:'Imagen básica', cost:'16 🪙', icon:'🖼️' },
                { name:'Vídeo 5s', cost:'desde 101 🪙', icon:'🎬' },
                { name:'Canción 2 min', cost:'20 🪙', icon:'🎵' },
                { name:'Artista IA', cost:'32 🪙', icon:'🎤' },
            ].map(({ name, cost, icon }) => `
                <div style="background:#111;border:1px solid #222;border-radius:16px;padding:20px;transition:all .2s" 
                     onmouseover="this.style.borderColor='#f59e0b44'" 
                     onmouseout="this.style.borderColor='#222'">
                    <p style="font-size:24px;margin:0 0 8px">${icon}</p>
                    <p style="color:#fff;font-size:13px;font-weight:600;margin:0 0 4px">${name}</p>
                    <p style="color:#f59e0b;font-size:15px;font-weight:800;margin:0;font-family:'Syne',sans-serif">${cost}</p>
                </div>
            `).join('')}
        </div>
    `;
    root.appendChild(pricing);

    // ── FINAL CTA ─────────────────────────────────────────────────────────────
    const cta = document.createElement('section');
    cta.style.cssText = 'padding:80px 24px;position:relative;overflow:hidden;border-top:1px solid rgba(255,255,255,.06)';
    cta.innerHTML = `
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:300px;background:radial-gradient(ellipse,rgba(245,158,11,.12) 0%,transparent 70%);pointer-events:none"></div>
        <div style="max-width:640px;margin:0 auto;text-align:center;position:relative;z-index:1">
            <div class="lp-visible">
                <p style="font-size:48px;margin:0 0 20px">✨</p>
                <h2 class="syne" style="font-size:clamp(28px,5vw,52px);font-weight:800;color:#fff;margin:0 0 16px;letter-spacing:-.02em">
                    Tu próxima creación<br>te espera
                </h2>
                <p style="color:rgba(255,255,255,.45);font-size:15px;margin:0 0 36px">Únete a miles de creadores que ya usan KreateIA Studio para dar vida a sus ideas.</p>
                <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
                    <button class="lp-btn-primary" id="lp-cta-final" style="padding:18px 44px;font-size:16px">
                        <span>Crear ahora — es gratis →</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    cta.querySelector('#lp-cta-final').addEventListener('click', () => navigate('image'));
    root.appendChild(cta);

    // ── Intersection Observer para animaciones al hacer scroll ────────────────
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    // Inicialmente pausar todas las animaciones y activarlas al entrar en viewport
    setTimeout(() => {
        root.querySelectorAll('.lp-visible').forEach((el, i) => {
            if (!el.closest('#landing-root > section:first-child')) {
                el.style.opacity = '0';
                el.style.animationPlayState = 'paused';
                observer.observe(el);
            }
        });
    }, 100);

    return root;
}
