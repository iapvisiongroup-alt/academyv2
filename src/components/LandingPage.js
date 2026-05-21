const LANDING_VIDEOS = [
    {
        id: 'video-01',
        url: 'https://cdn.higgsfield.ai/user_3AvFCf0aoS6DTSHhwoX3QgsDzIR/hf_20260409_094557_c0e3952b-1ecf-4621-9b06-eb86a7fe29e8_min.mp4',
        label: 'KreateVideo',
        title: 'Vídeos generativos con acabado cinematográfico',
        description: 'Piezas creadas con IA desde prompts, referencias visuales y control creativo desde el estudio.',
        mode: 'Generación de vídeo IA',
    },
    {
        id: 'video-02',
        url: 'https://cdn.higgsfield.ai/user_3AvFCf0aoS6DTSHhwoX3QgsDzIR/hf_20260409_094505_e898193e-ec14-4ecc-92ed-be976174fc88_min.mp4',
        label: 'KreateVideo',
        title: 'Movimiento, composición y estilo visual',
        description: 'Transforma una idea en una escena dinámica lista para redes, campañas o contenido creativo.',
        mode: 'Dirección visual con IA',
    },
    {
        id: 'video-03',
        url: 'https://cdn.higgsfield.ai/user_3AvFCf0aoS6DTSHhwoX3QgsDzIR/hf_20260409_094612_2b122af8-b47a-4518-9d91-9675dd8e3f41_min.mp4',
        label: 'KreateVideo',
        title: 'Contenido audiovisual creado en segundos',
        description: 'Genera clips llamativos para marcas, artistas, creadores y proyectos audiovisuales.',
        mode: 'Prompt a vídeo',
    },
];

function injectLandingStyles() {
    if (document.querySelector('#landing-styles')) return;

    const style = document.createElement('style');
    style.id = 'landing-styles';
    style.textContent = `
        #landing-root * { box-sizing:border-box; }

        #landing-root {
            width:100%;
            height:100%;
            overflow-y:auto;
            overflow-x:hidden;
            background:#050505;
            color:#fff;
            font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;
        }

        .lp-shell {
            width:min(1200px,100%);
            margin:0 auto;
            padding:0 24px;
        }

        .lp-hero {
            position:relative;
            min-height:88vh;
            display:flex;
            align-items:end;
            overflow:hidden;
            border-bottom:1px solid rgba(255,255,255,.08);
        }

        .lp-hero-video {
            position:absolute;
            inset:0;
            width:100%;
            height:100%;
            object-fit:cover;
            transform:scale(1.02);
            background:#080808;
        }

        .lp-hero-shade {
            position:absolute;
            inset:0;
            background:
                linear-gradient(to right, rgba(0,0,0,.88), rgba(0,0,0,.42) 45%, rgba(0,0,0,.76)),
                linear-gradient(to top, #050505 0%, rgba(5,5,5,.18) 45%, rgba(5,5,5,.45) 100%);
        }

        .lp-hero-content {
            position:relative;
            z-index:2;
            width:100%;
            padding:90px 0 42px;
        }

        .lp-kicker {
            color:#f59e0b;
            font-size:12px;
            font-weight:900;
            letter-spacing:0;
            text-transform:uppercase;
            margin:0 0 14px;
        }

        .lp-title {
            font-size:72px;
            line-height:.95;
            font-weight:950;
            letter-spacing:0;
            max-width:780px;
            margin:0;
        }

        .lp-copy {
            color:rgba(255,255,255,.68);
            font-size:17px;
            line-height:1.65;
            max-width:590px;
            margin:22px 0 0;
        }

        .lp-actions {
            display:flex;
            gap:10px;
            flex-wrap:wrap;
            margin-top:30px;
        }

        .lp-btn {
            border-radius:999px;
            padding:13px 22px;
            border:1px solid rgba(255,255,255,.16);
            font-size:13px;
            font-weight:850;
            cursor:pointer;
            transition:transform .18s ease, background .18s ease, border-color .18s ease;
        }

        .lp-btn:hover { transform:translateY(-1px); }

        .lp-btn-primary {
            background:#f59e0b;
            border-color:#f59e0b;
            color:#000;
        }

        .lp-btn-secondary {
            background:rgba(255,255,255,.06);
            color:#fff;
        }

        .lp-btn-secondary:hover {
            background:rgba(255,255,255,.1);
            border-color:rgba(255,255,255,.32);
        }

        .lp-video-strip {
            display:grid;
            grid-template-columns:repeat(3, minmax(0, 1fr));
            gap:10px;
            margin-top:44px;
            max-width:880px;
        }

        .lp-video-thumb {
            position:relative;
            height:150px;
            border-radius:8px;
            overflow:hidden;
            background:#111;
            border:1px solid rgba(255,255,255,.12);
            cursor:pointer;
            opacity:.74;
            transition:opacity .18s ease, border-color .18s ease, transform .18s ease;
        }

        .lp-video-thumb:hover,
        .lp-video-thumb.is-active {
            opacity:1;
            border-color:#f59e0b;
            transform:translateY(-2px);
        }

        .lp-video-thumb video {
            width:100%;
            height:100%;
            object-fit:cover;
            display:block;
        }

        .lp-video-thumb::after {
            content:'';
            position:absolute;
            inset:0;
            background:linear-gradient(to top,rgba(0,0,0,.78),rgba(0,0,0,.05));
        }

        .lp-thumb-text {
            position:absolute;
            left:12px;
            right:12px;
            bottom:10px;
            z-index:2;
        }

        .lp-section {
            padding:76px 0;
            border-bottom:1px solid rgba(255,255,255,.08);
        }

        .lp-section h2 {
            font-size:42px;
            line-height:1.05;
            letter-spacing:0;
            font-weight:950;
            margin:0;
        }

        .lp-section p {
            color:rgba(255,255,255,.62);
            line-height:1.65;
        }

        .lp-studio-grid {
            display:grid;
            grid-template-columns:repeat(3,minmax(0,1fr));
            gap:12px;
            margin-top:28px;
        }

        .lp-studio-card {
            background:#0f0f0f;
            border:1px solid rgba(255,255,255,.1);
            border-radius:8px;
            padding:22px;
        }

        .lp-studio-card h3 {
            margin:0 0 10px;
            font-size:18px;
            font-weight:900;
        }

        .lp-studio-card p {
            margin:0 0 18px;
            font-size:13px;
        }

        .lp-pricing {
            display:grid;
            grid-template-columns:repeat(4,minmax(0,1fr));
            gap:10px;
            margin-top:28px;
        }

        .lp-price {
            background:#101010;
            border:1px solid rgba(255,255,255,.1);
            border-radius:8px;
            padding:18px;
        }

        .lp-price strong {
            display:block;
            color:#f59e0b;
            font-size:18px;
            margin-top:6px;
        }

        @media (max-width:860px) {
            .lp-shell { padding:0 16px; }
            .lp-hero { min-height:92vh; }
            .lp-title { font-size:42px; }
            .lp-copy { font-size:15px; }
            .lp-video-strip { grid-template-columns:1fr; }
            .lp-video-thumb { height:120px; }
            .lp-studio-grid,
            .lp-pricing { grid-template-columns:1fr; }
            .lp-section h2 { font-size:32px; }
        }
    `;
    document.head.appendChild(style);
}

export function LandingPage(navigate) {
    injectLandingStyles();

    const root = document.createElement('div');
    root.id = 'landing-root';

    const first = LANDING_VIDEOS[0];

    root.innerHTML = `
        <section class="lp-hero">
            <video
                id="lp-hero-video"
                class="lp-hero-video"
                src="${first.url}"
                autoplay
                muted
                loop
                playsinline
            ></video>

            <div class="lp-hero-shade"></div>

            <div class="lp-hero-content">
                <div class="lp-shell">
                    <p class="lp-kicker">KreateIA Studio</p>

                    <h1 class="lp-title">
                        Imagen, vídeo y música creados con IA.
                    </h1>

                    <p class="lp-copy" id="lp-hero-copy">
                        ${first.description}
                    </p>

                    <div class="lp-actions">
                        <button class="lp-btn lp-btn-primary" id="lp-open-studio">
                            Entrar al estudio
                        </button>
                        <button class="lp-btn lp-btn-secondary" id="lp-see-videos">
                            Ver ejemplos generados
                        </button>
                    </div>

                    <div class="lp-video-strip" id="lp-video-strip">
                        ${LANDING_VIDEOS.map((video, index) => `
                            <button class="lp-video-thumb ${index === 0 ? 'is-active' : ''}" data-video="${index}">
                                <video src="${video.url}" muted loop playsinline></video>
                                <div class="lp-thumb-text">
                                    <p style="color:#f59e0b;font-size:10px;font-weight:900;margin:0 0 4px">${video.mode}</p>
                                    <p style="color:#fff;font-size:13px;font-weight:850;margin:0">${video.title}</p>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        </section>

        <section class="lp-section" id="lp-videos">
            <div class="lp-shell">
                <p class="lp-kicker">Showcase real</p>
                <h2>Vídeos generados con nuestras herramientas</h2>
                <p style="max-width:680px;margin:16px 0 0">
                    Estos clips muestran el tipo de resultado que puedes crear en KreateVideo: escenas con movimiento, estilo visual y acabado listo para contenido digital, campañas o piezas creativas.
                </p>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:30px">
                    ${LANDING_VIDEOS.map(video => `
                        <article style="position:relative;min-height:360px;border-radius:8px;overflow:hidden;background:#111;border:1px solid rgba(255,255,255,.12)">
                            <video src="${video.url}" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0"></video>
                            <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.88),rgba(0,0,0,.08))"></div>
                            <div style="position:absolute;left:18px;right:18px;bottom:18px">
                                <p style="color:#f59e0b;font-size:11px;font-weight:900;margin:0 0 8px">${video.label}</p>
                                <h3 style="color:#fff;font-size:20px;line-height:1.12;font-weight:950;margin:0 0 10px">${video.title}</h3>
                                <p style="color:rgba(255,255,255,.68);font-size:13px;line-height:1.5;margin:0">${video.description}</p>
                            </div>
                        </article>
                    `).join('')}
                </div>
            </div>
        </section>

        <section class="lp-section" style="background:#080808">
            <div class="lp-shell">
                <p class="lp-kicker">Estudios creativos</p>
                <h2>Todo en un solo entorno</h2>

                <div class="lp-studio-grid">
                    <article class="lp-studio-card">
                        <h3>KreateImage</h3>
                        <p>Genera imágenes desde texto o edita referencias con diferentes formatos y resoluciones.</p>
                        <button class="lp-btn lp-btn-secondary" data-go="image">Abrir KreateImage</button>
                    </article>

                    <article class="lp-studio-card">
                        <h3>KreateVideo</h3>
                        <p>Crea clips desde texto, imagen o vídeo, ajustando duración, formato, movimiento y calidad.</p>
                        <button class="lp-btn lp-btn-secondary" data-go="video">Abrir KreateVideo</button>
                    </article>

                    <article class="lp-studio-card">
                        <h3>KreateMusic</h3>
                        <p>Crea artistas IA, canciones, letras, sonidos, voces, remixes y extensiones musicales.</p>
                        <button class="lp-btn lp-btn-secondary" data-go="music">Abrir KreateMusic</button>
                    </article>
                </div>
            </div>
        </section>

        <section class="lp-section">
            <div class="lp-shell">
                <p class="lp-kicker">Créditos transparentes</p>
                <h2>Antes de generar, ves el coste</h2>
                <p style="max-width:650px;margin:16px 0 0">
                    KreateIA funciona con créditos. El precio cambia según el tipo de creación, la resolución, la duración y la calidad elegida.
                </p>

                <div class="lp-pricing">
                    <div class="lp-price">
                        <span>Imagen</span>
                        <strong>desde 16 créditos</strong>
                    </div>
                    <div class="lp-price">
                        <span>Vídeo</span>
                        <strong>según duración</strong>
                    </div>
                    <div class="lp-price">
                        <span>Música</span>
                        <strong>según generación</strong>
                    </div>
                    <div class="lp-price">
                        <span>Artistas IA</span>
                        <strong>perfil visual y voz</strong>
                    </div>
                </div>
            </div>
        </section>

        <section style="padding:84px 0">
            <div class="lp-shell" style="text-align:center">
                <p class="lp-kicker">KreateIA Studio</p>
                <h2 style="font-size:42px;line-height:1.05;font-weight:950;margin:0">
                    Empieza creando con IA profesional.
                </h2>
                <p style="color:rgba(255,255,255,.62);max-width:560px;margin:18px auto 28px;line-height:1.65">
                    Entra al estudio, elige herramienta, configura tu generación y lanza tus creaciones con créditos.
                </p>
                <button class="lp-btn lp-btn-primary" id="lp-final-cta">
                    Entrar al estudio
                </button>
            </div>
        </section>
    `;

    const heroVideo = root.querySelector('#lp-hero-video');
    const heroCopy = root.querySelector('#lp-hero-copy');
    const thumbs = root.querySelectorAll('.lp-video-thumb');

    thumbs.forEach((thumb) => {
        const smallVideo = thumb.querySelector('video');
        smallVideo.play().catch(() => {});

        thumb.addEventListener('click', () => {
            const index = Number(thumb.dataset.video);
            const selected = LANDING_VIDEOS[index];

            heroVideo.src = selected.url;
            heroVideo.play().catch(() => {});
            heroCopy.textContent = selected.description;

            thumbs.forEach(t => t.classList.remove('is-active'));
            thumb.classList.add('is-active');
        });
    });

    root.querySelector('#lp-open-studio').addEventListener('click', () => navigate('image'));
    root.querySelector('#lp-final-cta').addEventListener('click', () => navigate('image'));

    root.querySelector('#lp-see-videos').addEventListener('click', () => {
        root.querySelector('#lp-videos')?.scrollIntoView({ behavior: 'smooth' });
    });

    root.querySelectorAll('[data-go]').forEach(btn => {
        btn.addEventListener('click', () => navigate(btn.dataset.go));
    });

    return root;
}
