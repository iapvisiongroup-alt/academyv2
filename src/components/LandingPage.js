const LANDING_VIDEOS = [
    {
        url: 'https://cdn.higgsfield.ai/user_3AvFCf0aoS6DTSHhwoX3QgsDzIR/hf_20260409_094557_c0e3952b-1ecf-4621-9b06-eb86a7fe29e8_min.mp4',
        title: 'Vídeos generativos con acabado cinematográfico',
        description: 'Piezas creadas con IA desde prompts, referencias visuales y control creativo desde el estudio.',
        mode: 'Generación de vídeo IA',
    },
    {
        url: 'https://cdn.higgsfield.ai/user_3AvFCf0aoS6DTSHhwoX3QgsDzIR/hf_20260409_094505_e898193e-ec14-4ecc-92ed-be976174fc88_min.mp4',
        title: 'Movimiento, composición y estilo visual',
        description: 'Transforma una idea en una escena dinámica lista para redes, campañas o contenido creativo.',
        mode: 'Dirección visual con IA',
    },
    {
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
    style.textContent = [
        '#landing-root *{box-sizing:border-box}',
        '#landing-root{width:100%;height:100%;overflow-y:auto;overflow-x:hidden;background:#050505;color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif}',
        '.lp-shell{width:min(1200px,100%);margin:0 auto;padding:0 24px}',
        '.lp-hero{position:relative;min-height:88vh;display:flex;align-items:end;overflow:hidden;border-bottom:1px solid rgba(255,255,255,.08)}',
        '.lp-hero-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.02);background:#080808}',
        '.lp-hero-shade{position:absolute;inset:0;background:linear-gradient(to right,rgba(0,0,0,.9),rgba(0,0,0,.42) 46%,rgba(0,0,0,.78)),linear-gradient(to top,#050505 0%,rgba(5,5,5,.2) 48%,rgba(5,5,5,.48) 100%)}',
        '.lp-hero-content{position:relative;z-index:2;width:100%;padding:90px 0 42px}',
        '.lp-kicker{color:#f59e0b;font-size:12px;font-weight:900;text-transform:uppercase;margin:0 0 14px}',
        '.lp-title{font-size:clamp(42px,7vw,84px);line-height:.96;font-weight:950;letter-spacing:0;max-width:820px;margin:0}',
        '.lp-copy{color:rgba(255,255,255,.68);font-size:17px;line-height:1.65;max-width:590px;margin:22px 0 0}',
        '.lp-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:30px}',
        '.lp-btn{border-radius:999px;padding:13px 22px;border:1px solid rgba(255,255,255,.16);font-size:13px;font-weight:850;cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease;white-space:nowrap}',
        '.lp-btn:hover{transform:translateY(-1px)}',
        '.lp-btn-primary{background:#f59e0b;border-color:#f59e0b;color:#000}',
        '.lp-btn-secondary{background:rgba(255,255,255,.06);color:#fff}',
        '.lp-btn-secondary:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.32)}',
        '.lp-video-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:44px;max-width:900px}',
        '.lp-video-thumb{position:relative;height:150px;border-radius:8px;overflow:hidden;background:#111;border:1px solid rgba(255,255,255,.12);cursor:pointer;opacity:.74;transition:opacity .18s ease,border-color .18s ease,transform .18s ease;padding:0;text-align:left}',
        '.lp-video-thumb:hover,.lp-video-thumb.is-active{opacity:1;border-color:#f59e0b;transform:translateY(-2px)}',
        '.lp-video-thumb video{width:100%;height:100%;object-fit:cover;display:block}',
        '.lp-video-thumb::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.78),rgba(0,0,0,.05))}',
        '.lp-thumb-text{position:absolute;left:12px;right:12px;bottom:10px;z-index:2}',
        '.lp-section{padding:76px 0;border-bottom:1px solid rgba(255,255,255,.08)}',
        '.lp-section h2{font-size:clamp(32px,4.6vw,52px);line-height:1.05;font-weight:950;margin:0}',
        '.lp-section p{color:rgba(255,255,255,.62);line-height:1.65}',
        '.lp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:30px}',
        '.lp-studio-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:28px}',
        '.lp-pricing{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:28px}',
        '.lp-studio-card,.lp-price{background:#101010;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:22px}',
        '.lp-studio-card h3{margin:0 0 10px;font-size:18px;font-weight:900}',
        '.lp-studio-card p{margin:0 0 18px;font-size:13px}',
        '.lp-price strong{display:block;color:#f59e0b;font-size:18px;margin-top:6px}',
        '@media(max-width:860px){.lp-shell{padding:0 16px}.lp-hero{min-height:92vh}.lp-copy{font-size:15px}.lp-video-strip,.lp-studio-grid,.lp-pricing{grid-template-columns:1fr}.lp-video-thumb{height:120px}}',
    ].join('\n');

    document.head.appendChild(style);
}

function createVideo(url, className) {
    const video = document.createElement('video');
    video.src = url;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    if (className) video.className = className;
    return video;
}

function createButton(text, className, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
}

function createShowcaseVideoCard(item) {
    const card = document.createElement('article');
    card.style.cssText = 'position:relative;min-height:360px;border-radius:8px;overflow:hidden;background:#111;border:1px solid rgba(255,255,255,.12)';

    const video = createVideo(item.url);
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0';

    const shade = document.createElement('div');
    shade.style.cssText = 'position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.88),rgba(0,0,0,.08))';

    const info = document.createElement('div');
    info.style.cssText = 'position:absolute;left:18px;right:18px;bottom:18px';
    info.innerHTML =
        '<p style="color:#f59e0b;font-size:11px;font-weight:900;margin:0 0 8px">KreateVideo</p>' +
        '<h3 style="color:#fff;font-size:20px;line-height:1.12;font-weight:950;margin:0 0 10px"></h3>' +
        '<p style="color:rgba(255,255,255,.68);font-size:13px;line-height:1.5;margin:0"></p>';

    info.querySelector('h3').textContent = item.title;
    info.querySelectorAll('p')[1].textContent = item.description;

    card.appendChild(video);
    card.appendChild(shade);
    card.appendChild(info);

    return card;
}

function createPhotoCard(item) {
    const card = document.createElement('article');
    card.style.cssText = 'position:relative;min-height:420px;border-radius:8px;overflow:hidden;background:#111;border:1px solid rgba(255,255,255,.12)';

    let media;
    if (item.type === 'video') {
        media = createVideo(item.url);
    } else {
        media = document.createElement('img');
        media.src = item.url;
        media.alt = item.title;
        media.loading = 'lazy';
    }
    media.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0';

    const shade = document.createElement('div');
    shade.style.cssText = 'position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.86),rgba(0,0,0,.05))';

    const info = document.createElement('div');
    info.style.cssText = 'position:absolute;left:18px;right:18px;bottom:18px';
    info.innerHTML =
        '<p style="color:#3b82f6;font-size:11px;font-weight:900;margin:0 0 8px"></p>' +
        '<h3 style="color:#fff;font-size:20px;line-height:1.12;font-weight:950;margin:0 0 10px"></h3>' +
        '<p style="color:rgba(255,255,255,.68);font-size:13px;line-height:1.5;margin:0"></p>';

    info.querySelectorAll('p')[0].textContent = item.label;
    info.querySelector('h3').textContent = item.title;
    info.querySelectorAll('p')[1].textContent = item.description;

    card.appendChild(media);
    card.appendChild(shade);
    card.appendChild(info);

    return card;
}

export function LandingPage(navigate) {
    injectLandingStyles();

    const root = document.createElement('div');
    root.id = 'landing-root';

    const first = LANDING_VIDEOS[0];

    const hero = document.createElement('section');
    hero.className = 'lp-hero';

    const heroVideo = createVideo(first.url, 'lp-hero-video');
    heroVideo.id = 'lp-hero-video';

    const heroShade = document.createElement('div');
    heroShade.className = 'lp-hero-shade';

    const heroContent = document.createElement('div');
    heroContent.className = 'lp-hero-content';

    const shell = document.createElement('div');
    shell.className = 'lp-shell';

    const kicker = document.createElement('p');
    kicker.className = 'lp-kicker';
    kicker.textContent = 'KreateIA Studio';

    const title = document.createElement('h1');
    title.className = 'lp-title';
    title.textContent = 'Imagen, vídeo y música creados con IA.';

    const copy = document.createElement('p');
    copy.className = 'lp-copy';
    copy.id = 'lp-hero-copy';
    copy.textContent = first.description;

    const actions = document.createElement('div');
    actions.className = 'lp-actions';
    actions.appendChild(createButton('Entrar al estudio', 'lp-btn lp-btn-primary', () => navigate('image')));
    actions.appendChild(createButton('Ver ejemplos generados', 'lp-btn lp-btn-secondary', () => {
        root.querySelector('#lp-videos')?.scrollIntoView({ behavior: 'smooth' });
    }));

    const strip = document.createElement('div');
    strip.className = 'lp-video-strip';

    LANDING_VIDEOS.forEach((item, index) => {
        const thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.className = index === 0 ? 'lp-video-thumb is-active' : 'lp-video-thumb';
        thumb.dataset.video = String(index);

        const smallVideo = createVideo(item.url);
        const text = document.createElement('div');
        text.className = 'lp-thumb-text';
        text.innerHTML =
            '<p style="color:#f59e0b;font-size:10px;font-weight:900;margin:0 0 4px"></p>' +
            '<p style="color:#fff;font-size:13px;font-weight:850;margin:0"></p>';
        text.querySelectorAll('p')[0].textContent = item.mode;
        text.querySelectorAll('p')[1].textContent = item.title;

        thumb.appendChild(smallVideo);
        thumb.appendChild(text);

        thumb.addEventListener('click', () => {
            heroVideo.src = item.url;
            heroVideo.play().catch(() => {});
            copy.textContent = item.description;
            strip.querySelectorAll('.lp-video-thumb').forEach(t => t.classList.remove('is-active'));
            thumb.classList.add('is-active');
        });

        strip.appendChild(thumb);
    });

    shell.appendChild(kicker);
    shell.appendChild(title);
    shell.appendChild(copy);
    shell.appendChild(actions);
    shell.appendChild(strip);
    heroContent.appendChild(shell);
    hero.appendChild(heroVideo);
    hero.appendChild(heroShade);
    hero.appendChild(heroContent);
    root.appendChild(hero);

    const videosSection = document.createElement('section');
    videosSection.className = 'lp-section';
    videosSection.id = 'lp-videos';
    videosSection.innerHTML =
        '<div class="lp-shell">' +
        '<p class="lp-kicker">Showcase real</p>' +
        '<h2>Vídeos generados con nuestras herramientas</h2>' +
        '<p style="max-width:680px;margin:16px 0 0">Estos clips muestran el tipo de resultado que puedes crear en KreateVideo: escenas con movimiento, estilo visual y acabado listo para contenido digital, campañas o piezas creativas.</p>' +
        '<div class="lp-grid" id="lp-generated-video-grid"></div>' +
        '</div>';

    const videoGrid = videosSection.querySelector('#lp-generated-video-grid');
    GENERATED_VIDEO_SHOWCASE.forEach(item => videoGrid.appendChild(createShowcaseVideoCard(item)));
    root.appendChild(videosSection);

    const photoSection = document.createElement('section');
    photoSection.className = 'lp-section';
    photoSection.style.background = '#050505';
    photoSection.innerHTML =
        '<div class="lp-shell">' +
        '<p class="lp-kicker" style="color:#3b82f6">KreateImage</p>' +
        '<h2>Fotografía para redes y producto</h2>' +
        '<p style="max-width:680px;margin:16px 0 0">Genera imágenes y piezas visuales para productos, marcas personales, redes sociales, campañas y contenido comercial.</p>' +
        '<div class="lp-grid" id="lp-photo-grid"></div>' +
        '</div>';

    const photoGrid = photoSection.querySelector('#lp-photo-grid');
    PHOTO_SHOWCASE.forEach(item => photoGrid.appendChild(createPhotoCard(item)));
    root.appendChild(photoSection);

    const studios = document.createElement('section');
    studios.className = 'lp-section';
    studios.style.background = '#080808';
    studios.innerHTML =
        '<div class="lp-shell">' +
        '<p class="lp-kicker">Estudios creativos</p>' +
        '<h2>Todo en un solo entorno</h2>' +
        '<div class="lp-studio-grid">' +
        '<article class="lp-studio-card"><h3>KreateImage</h3><p>Genera imágenes desde texto o edita referencias con diferentes formatos y resoluciones.</p><button class="lp-btn lp-btn-secondary" data-go="image">Abrir KreateImage</button></article>' +
        '<article class="lp-studio-card"><h3>KreateVideo</h3><p>Crea clips desde texto, imagen o vídeo, ajustando duración, formato, movimiento y calidad.</p><button class="lp-btn lp-btn-secondary" data-go="video">Abrir KreateVideo</button></article>' +
        '<article class="lp-studio-card"><h3>KreateMusic</h3><p>Crea artistas IA, canciones, letras, sonidos, voces, remixes y extensiones musicales.</p><button class="lp-btn lp-btn-secondary" data-go="music">Abrir KreateMusic</button></article>' +
        '</div>' +
        '</div>';
    root.appendChild(studios);

    const academy = document.createElement('section');
    academy.className = 'lp-section';
    academy.style.background = '#080808';
    academy.innerHTML =
        '<div class="lp-shell">' +
        '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,420px);gap:28px;align-items:center">' +
        '<div>' +
        '<p class="lp-kicker">Academia IA</p>' +
        '<h2>Aprende a crear mejor cada semana</h2>' +
        '<p style="max-width:680px;margin:16px 0 0">En la Academia IA iremos añadiendo nuevos vídeos todas las semanas con tutoriales, flujos de trabajo, ideas creativas y formas prácticas de sacar más partido a KreateImage, KreateVideo y KreateMusic.</p>' +
        '<p style="max-width:680px;margin:14px 0 0">Formación pensada para creadores, empresas y equipos que quieren aprender a producir contenido con IA de forma clara, visual y aplicada.</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:26px">' +
        '<button class="lp-btn lp-btn-primary" data-go="academy">Ver Academia IA</button>' +
        '<button class="lp-btn lp-btn-secondary" data-go="video">Crear un vídeo</button>' +
        '</div>' +
        '</div>' +
        '<div style="background:#101010;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:22px">' +
        '<p style="color:#f59e0b;font-size:12px;font-weight:900;margin:0 0 16px">Contenido semanal</p>' +
        '<div style="display:grid;gap:12px">' +
        '<div style="border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:12px"><strong style="display:block;color:#fff;font-size:14px;margin-bottom:5px">Prompts para imagen y vídeo</strong><span style="color:#777;font-size:12px">Cómo escribir mejores instrucciones para obtener resultados más precisos.</span></div>' +
        '<div style="border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:12px"><strong style="display:block;color:#fff;font-size:14px;margin-bottom:5px">Contenido para redes sociales</strong><span style="color:#777;font-size:12px">Ideas y procesos para crear piezas visuales listas para publicar.</span></div>' +
        '<div><strong style="display:block;color:#fff;font-size:14px;margin-bottom:5px">Música, artistas IA y marca</strong><span style="color:#777;font-size:12px">Cómo combinar imagen, voz, canciones y estilo en proyectos creativos.</span></div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>';
    root.appendChild(academy);

    const credits = document.createElement('section');
    credits.className = 'lp-section';
    credits.innerHTML =
        '<div class="lp-shell">' +
        '<p class="lp-kicker">Créditos transparentes</p>' +
        '<h2>Antes de generar, ves el coste</h2>' +
        '<p style="max-width:650px;margin:16px 0 0">KreateIA funciona con créditos. El precio cambia según el tipo de creación, la resolución, la duración y la calidad elegida.</p>' +
        '<div class="lp-pricing">' +
        '<div class="lp-price"><span>Imagen</span><strong>desde 16 créditos</strong></div>' +
        '<div class="lp-price"><span>Vídeo</span><strong>según duración</strong></div>' +
        '<div class="lp-price"><span>Música</span><strong>según generación</strong></div>' +
        '<div class="lp-price"><span>Artistas IA</span><strong>perfil visual y voz</strong></div>' +
        '</div>' +
        '</div>';
    root.appendChild(credits);

    const finalCta = document.createElement('section');
    finalCta.style.cssText = 'padding:84px 0';
    finalCta.innerHTML =
        '<div class="lp-shell" style="text-align:center">' +
        '<p class="lp-kicker">KreateIA Studio</p>' +
        '<h2 style="font-size:clamp(32px,4.6vw,52px);line-height:1.05;font-weight:950;margin:0">Empieza creando con IA profesional.</h2>' +
        '<p style="color:rgba(255,255,255,.62);max-width:560px;margin:18px auto 28px;line-height:1.65">Entra al estudio, elige herramienta, configura tu generación y lanza tus creaciones con créditos.</p>' +
        '<button class="lp-btn lp-btn-primary" id="lp-final-cta">Entrar al estudio</button>' +
        '</div>';
    root.appendChild(finalCta);

    root.querySelector('#lp-final-cta').addEventListener('click', () => navigate('image'));

    root.querySelectorAll('[data-go]').forEach(btn => {
        btn.addEventListener('click', () => navigate(btn.dataset.go));
    });

    return root;
}
