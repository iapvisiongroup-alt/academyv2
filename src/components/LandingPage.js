const LANDING_VIDEOS = [
    {
        id: 'hero-01',
        url: 'https://cdn.higgsfield.ai/user_3AvFCf0aoS6DTSHhwoX3QgsDzIR/hf_20260409_094557_c0e3952b-1ecf-4621-9b06-eb86a7fe29e8_min.mp4',
        title: 'Vídeos generativos con acabado cinematográfico',
        description: 'Piezas creadas con IA desde prompts, referencias visuales y control creativo desde el estudio.',
        mode: 'Generación de vídeo IA',
    },
    {
        id: 'hero-02',
        url: 'https://cdn.higgsfield.ai/user_3AvFCf0aoS6DTSHhwoX3QgsDzIR/hf_20260409_094505_e898193e-ec14-4ecc-92ed-be976174fc88_min.mp4',
        title: 'Movimiento, composición y estilo visual',
        description: 'Transforma una idea en una escena dinámica lista para redes, campañas o contenido creativo.',
        mode: 'Dirección visual con IA',
    },
    {
        id: 'hero-03',
        url: 'https://cdn.higgsfield.ai/user_3AvFCf0aoS6DTSHhwoX3QgsDzIR/hf_20260409_094612_2b122af8-b47a-4518-9d91-9675dd8e3f41_min.mp4',
        title: 'Contenido audiovisual creado en segundos',
        description: 'Genera clips llamativos para marcas, artistas, creadores y proyectos audiovisuales.',
        mode: 'Prompt a vídeo',
    },
];

const GENERATED_VIDEO_SHOWCASE = [
    {
        url: 'https://cdn.higgsfield.ai/superhero-gen-preset/b3e830c6-9927-4c6d-8960-8753889adbc9.mp4',
        title: 'Escenas de acción generadas con IA',
        description: 'Vídeos con movimiento, cámara y estética cinematográfica creados desde una idea visual.',
    },
    {
        url: 'https://cdn.higgsfield.ai/superhero-gen-preset/0305a4a8-5674-4650-8976-031af3231207.mp4',
        title: 'Personajes y mundos visuales',
        description: 'Contenido llamativo para campañas, redes sociales, trailers, conceptos y piezas promocionales.',
    },
    {
        url: 'https://cdn.higgsfield.ai/superhero-gen-preset/6b1f33ae-23c3-4ee7-a419-ebe6af659b0d.mp4',
        title: 'Producción visual rápida',
        description: 'Crea clips impactantes sin rodaje tradicional, ajustando estilo, duración y formato desde el estudio.',
    },
];

const PHOTO_SHOWCASE = [
    {
        type: 'image',
        url: 'https://d8j0ntlcm91z4.cloudfront.net/user_35h9Zqn0Bk5qurQOPUM7laOSfXO/hf_20260314_185419_c3b256b1-d0e0-4cd9-90bd-c9ee5b8c0878.png',
        label: 'KreateImage',
        title: 'Fotografía para redes sociales',
        description: 'Crea imágenes visualmente cuidadas para perfiles, campañas, anuncios y contenido diario.',
    },
    {
        type: 'video',
        url: 'https://d8j0ntlcm91z4.cloudfront.net/user_3CIjqzTsrKEUr8OzFBaYO4ux3nG/hf_20260413_121933_7dfa9582-a536-4a83-9041-ee5aa102ff8c.mp4',
        label: 'KreateImage + KreateVideo',
        title: 'Producto y contenido social en movimiento',
        description: 'Convierte imágenes y conceptos de producto en piezas dinámicas para redes o presentación comercial.',
    },
];

function injectLandingStyles() {
    if (document.querySelector('#landing-styles')) return;

    const style = document.createElement('style');
    style.id = 'landing-styles';
    style.textContent = `
        #landing-root * { box-sizing:border-box; }
        #landing-root {
            width:100%;height:100%;overflow-y:auto;overflow-x:hidden;
            background:#050505;color:#fff;
            font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;
        }
        .lp-shell { width:min(1200px,100%);margin:0 auto;padding:0 24px; }
        .lp-hero { position:relative;min-height:88vh;display:flex;align-items:end;overflow:hidden;border-bottom:1px solid rgba(255,255,255,.08); }
        .lp-hero-video { position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.02);background:#080808; }
        .lp-hero-shade {
            position:absolute;inset:0;
            background:linear-gradient(to right,rgba(0,0,0,.9),rgba(0,0,0,.42) 46%,rgba(0,0,0,.78)),
                       linear-gradient(to top,#050505 0%,rgba(5,5,5,.2) 48%,rgba(5,5,5,.48) 100%);
        }
        .lp-hero-content { position:relative;z-index:2;width:100%;padding:90px 0 42px; }
        .lp-kicker { color:#f59e0b;font-size:12px;font-weight:900;text-transform:uppercase;margin:0 0 14px; }
        .lp-title { font-size:clamp(42px,7vw,84px);line-height:.96;font-weight:950;letter-spacing:0;max-width:820px;margin:0; }
        .lp-copy { color:rgba(255,255,255,.68);font-size:17px;line-height:1.65;max-width:590px;margin:22px 0 0; }
        .lp-actions { display:flex;gap:10px;flex-wrap:wrap;margin-top:30px; }
        .lp-btn {
            border-radius:999px;padding:13px 22px;border:1px solid rgba(255,255,255,.16);
            font-size:13px;font-weight:850;cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease;white-space:nowrap;
        }
        .lp-btn:hover { transform:translateY(-1px); }
        .lp-btn-primary { background:#f59e0b;border-color:#f59e0b;color:#000; }
        .lp-btn-secondary { background:rgba(255,255,255,.06);color:#fff; }
        .lp-btn-secondary:hover { background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.32); }
        .lp-video-strip { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:44px;max-width:900px; }
        .lp-video-thumb {
            position:relative;height:150px;border-radius:8px;overflow:hidden;background:#111;
            border:1px solid rgba(255,255,255,.12);cursor:pointer;opacity:.74;
            transition:opacity .18s ease,border-color .18s ease,transform .18s ease;padding:0;text-align:left;
        }
        .lp-video-thumb:hover,.lp-video-thumb.is-active { opacity:1;border-color:#f59e0b;transform:translateY(-2px); }
        .lp-video-thumb video { width:100%;height:100%;object-fit:cover;display:block; }
        .lp-video-thumb::after { content:'';position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.78),rgba(0,0,0,.05)); }
        .lp-thumb-text { position:absolute;left:12px;right:12px;bottom:10px;z-index:2; }
        .lp-section { padding:76px 0;border-bottom:1px solid rgba(255,255,255,.08); }
        .lp-section h2 { font-size:clamp(32px,4.6vw,52px);line-height:1.05;font-weight:950;margin:0; }
        .lp-section p { color:rgba(255,255,255,.62);line-height:1.65; }
        .lp-studio-grid,.lp-pricing { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:28px; }
        .lp-pricing { grid-template-columns:repeat(4,minmax(0,1fr)); }
        .lp-studio-card,.lp-price { background:#101010;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:22px; }
        .lp-studio-card h3 { margin:0 0 10px;font-size:18px;font-weight:900; }
        .lp-studio-card p { margin:0 0 18px;font-size:13px; }
        .lp-price strong { display:block;color:#f59e0b;font-size:18px;margin-top:6px; }
        @media (max-width:860px) {
            .lp-shell { padding:0 16px; }
            .lp-hero { min-height:92vh; }
            .lp-copy { font-size:15px; }
            .lp-video-strip,.lp-studio-grid,.lp-pricing { grid-template-columns:1fr; }
            .lp-video-thumb { height:120px; }
        }
    `;
    document.head.appendChild(style);
}

function renderHeroThumbs() {
    return LANDING_VIDEOS.map((video, index) => {
        const active = index === 0 ? ' is-active' : '';
        return `
            <button type="button" class="lp-video-thumb${active}" data-video="${index}">
                <video src="${video.url}" muted loop playsinline></video>
                <div class="lp-thumb-text">
                    <p style="color:#f59e0b;font-size:10px;font-weight:900;margin:0 0 4px">${video.mode}</p>
                    <p style="color:#fff;font-size:13px;font-weight:850;margin:0">${video.title}</p>
                </div>
            </button>
        `;
    }).join('');
}

function renderGeneratedVideos() {
    return GENERATED_VIDEO_SHOWCASE.map(video => {
        return `
            <article style="position:relative;min-height:360px;border-radius:8px;overflow:hidden;background:#111;border:1px solid rgba(255,255,255,.12)">
                <video src="${video.url}" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0"></video>
                <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.88),rgba(0,0,0,.08))"></div>
                <div style="position:absolute;left:18px;right:18px;bottom:18px">
                    <p style="color:#f59e0b;font-size:11px;font-weight:900;margin:0 0 8px">KreateVideo</p>
                    <h3 style="color:#fff;font-size:20px;line-height:1.12;font-weight:950;margin:0 0 10px">${video.title}</h3>
                    <p style="color:rgba(255,255,255,.68);font-size:13px;line-height:1.5;margin:0">${video.description}</p>
                </div>
            </article>
        `;
    }).join('');
}

function renderPhotoShowcase() {
    return PHOTO_SHOWCASE.map(item => {
        const media = item.type === 'video'
            ? `<video src="${item.url}" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0"></video>`
            : `<img src="${item.url}" alt="${item.title}" loading="lazy" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0">`;

        return `
            <article style="position:relative;min-height:420px;border-radius:8px;overflow:hidden;background:#111;border:1px solid rgba(255,255,255,.12)">
                ${media}
                <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.86),rgba(0,0,0,.05))"></div>
                <div style="position:absolute;left:18px;right:18px;bottom:18px">
                    <p style="color:#3b82f6;font-size:11px;font-weight:900;margin:0 0 8px">${item.label}</p>
                    <h3 style="color:#fff;font-size:20px;line-height:1.12;font-weight:950;margin:0 0 10px">${item.title}</h3>
                    <p style="color:rgba(255,255,255,.68);font-size:13px;line-height:1.5;margin:0">${item.description}</p>
                </div>
            </article>
        `;
    }).join('');
}

export function LandingPage(navigate) {
    injectLandingStyles();

    const root = document.createElement('div');
    root.id = 'landing-root';

    const first = LANDING_VIDEOS[0];
    const heroThumbsHtml = renderHeroThumbs();
    const generatedVideosHtml = renderGeneratedVideos();
    const photoShowcaseHtml = renderPhotoShowcase();

    root.innerHTML = `
        <section class="lp-hero">
            <video id="lp-hero-video" class="lp-hero-video" src="${first.url}" autoplay muted loop playsinline></video>
            <div class="lp-hero-shade"></div>

            <div class="lp-hero-content">
                <div class="lp-shell">
                    <p class="lp-kicker">KreateIA Studio</p>
                    <h1 class="lp-title">Imagen, vídeo y música creados con IA.</h1>
                    <p class="lp-copy" id="lp-hero-copy">${first.description}</p>

                    <div class="lp-actions">
                        <button class="lp-btn lp-btn-primary" id="lp-open-studio">Entrar al estudio</button>
                        <button class="lp-btn lp-btn-secondary" id="lp-see-videos">Ver ejemplos generados</button>
                    </div>

                    <div class="lp-video-strip" id="lp-video-strip">
                        ${heroThumbsHtml}
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
                    ${generatedVideosHtml}
                </div>
            </div>
        </section>

        <section class="lp-section" style="background:#050505">
            <div class="lp-shell">
                <p class="lp-kicker" style="color:#3b82f6">KreateImage</p>
                <h2>Fotografía para redes y producto</h2>
                <p style="max-width:680px;margin:16px 0 0">
                    Genera imágenes y piezas visuales para productos, marcas personales, redes sociales, campañas y contenido comercial.
                </p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:30px">
                    ${photoShowcaseHtml}
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

        <section class="lp-section" style="background:#080808">
            <div class="lp-shell">
                <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,420px);gap:28px;align-items:center">
                    <div>
                        <p class="lp-kicker">Academia IA</p>
                        <h2>Aprende a crear mejor cada semana</h2>
                        <p style="max-width:680px;margin:16px 0 0">
                            En la Academia IA iremos añadiendo nuevos vídeos todas las semanas con tutoriales, flujos de trabajo, ideas creativas y formas prácticas de sacar más partido a KreateImage, KreateVideo y KreateMusic.
                        </p>
                        <p style="max-width:680px;margin:14px 0 0">
                            Formación pensada para creadores, empresas y equipos que quieren aprender a producir contenido con IA de forma clara, visual y aplicada.
                        </p>

                        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:26px">
                            <button class="lp-btn lp-btn-primary" data-go="academy">Ver Academia IA</button>
                            <button class="lp-btn lp-btn-secondary" data-go="video">Crear un vídeo</button>
                        </div>
                    </div>

                    <div style="background:#101010;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:22px">
                        <p style="color:#f59e0b;font-size:12px;font-weight:900;margin:0 0 16px">Contenido semanal</p>
                        <div style="display:grid;gap:12px">
                            <div style="border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:12px">
                                <strong style="display:block;color:#fff;font-size:14px;margin-bottom:5px">Prompts para imagen y vídeo</strong>
                                <span style="color:#777;font-size:12px">Cómo escribir mejores instrucciones para obtener resultados más precisos.</span>
                            </div>
                            <div style="border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:12px">
                                <strong style="display:block;color:#fff;font-size:14px;margin-bottom:5px">Contenido para redes sociales</strong>
                                <span style="color:#777;font-size:12px">Ideas y procesos para crear piezas visuales listas para publicar.</span>
                            </div>
                            <div>
                                <strong style="display:block;color:#fff;font-size:14px;margin-bottom:5px">Música, artistas IA y marca</strong>
                                <span style="color:#777;font-size:12px">Cómo combinar imagen, voz, canciones y estilo en proyectos creativos.</span>
                            </div>
                        </div>
                    </div>
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
                    <div class="lp-price"><span>Imagen</span><strong>desde 16 créditos</strong></div>
                    <div class="lp-price"><span>Vídeo</span><strong>según duración</strong></div>
                    <div class="lp-price"><span>Música</span><strong>según generación</strong></div>
                    <div class="lp-price"><span>Artistas IA</span><strong>perfil visual y voz</strong></div>
                </div>
            </div>
        </section>

        <section style="padding:84px 0">
            <div class="lp-shell" style="text-align:center">
                <p class="lp-kicker">KreateIA Studio</p>
                <h2 style="font-size:clamp(32px,4.6vw,52px);line-height:1.05;font-weight:950;margin:0">
                    Empieza creando con IA profesional.
                </h2>
                <p style="color:rgba(255,255,255,.62);max-width:560px;margin:18px auto 28px;line-height:1.65">
                    Entra al estudio, elige herramienta, configura tu generación y lanza tus creaciones con créditos.
                </p>
                <button class="lp-btn lp-btn-primary" id="lp-final-cta">Entrar al estudio</button>
            </div>
        </section>
    `;

    const heroVideo = root.querySelector('#lp-hero-video');
    const heroCopy = root.querySelector('#lp-hero-copy');
    const thumbs = root.querySelectorAll('.lp-video-thumb');

    thumbs.forEach((thumb) => {
        const smallVideo = thumb.querySelector('video');
        if (smallVideo) smallVideo.play().catch(() => {});

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
