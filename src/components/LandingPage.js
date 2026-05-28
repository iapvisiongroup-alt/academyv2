const HERO_VIDEOS = [
    {
        url: 'https://cdn.higgsfield.ai/user_3AvFCf0aoS6DTSHhwoX3QgsDzIR/hf_20260409_094557_c0e3952b-1ecf-4621-9b06-eb86a7fe29e8_min.mp4',
        mode: 'KreateVideo',
        title: 'Vídeo cinematográfico generado con IA',
        text: 'Crea vídeos cinematográficos, escenas con movimiento y contenido profesional para redes, campañas y marcas.',
    },
    {
        url: 'https://cdn.higgsfield.ai/user_3AvFCf0aoS6DTSHhwoX3QgsDzIR/hf_20260409_094505_e898193e-ec14-4ecc-92ed-be976174fc88_min.mp4',
        mode: 'Dirección visual IA',
        title: 'Creatividad visual para empresas y creadores',
        text: 'Genera piezas visuales dinámicas para anuncios, redes sociales, productos, artistas y negocios locales.',
    },
    {
        url: 'https://cdn.higgsfield.ai/user_3AvFCf0aoS6DTSHhwoX3QgsDzIR/hf_20260409_094612_2b122af8-b47a-4518-9d91-9675dd8e3f41_min.mp4',
        mode: 'Prompt a vídeo',
        title: 'De una idea a un clip profesional',
        text: 'Convierte prompts, imágenes o conceptos en vídeos llamativos usando herramientas avanzadas de inteligencia artificial.',
    },
];

const VIDEO_SHOWCASE = [
    {
        url: 'https://cdn.higgsfield.ai/superhero-gen-preset/b3e830c6-9927-4c6d-8960-8753889adbc9.mp4',
        title: 'Escenas de acción generadas con IA',
        text: 'Vídeos con cámara, movimiento y estética cinematográfica creados desde una idea visual.',
    },
    {
        url: 'https://cdn.higgsfield.ai/superhero-gen-preset/0305a4a8-5674-4650-8976-031af3231207.mp4',
        title: 'Personajes y mundos visuales',
        text: 'Contenido llamativo para campañas, redes sociales, trailers, conceptos y piezas promocionales.',
    },
    {
        url: 'https://cdn.higgsfield.ai/superhero-gen-preset/6b1f33ae-23c3-4ee7-a419-ebe6af659b0d.mp4',
        title: 'Producción visual rápida',
        text: 'Crea clips impactantes ajustando estilo, duración y formato desde el estudio.',
    },
];

const PHOTO_SHOWCASE = [
    {
        type: 'image',
        url: 'https://d8j0ntlcm91z4.cloudfront.net/user_35h9Zqn0Bk5qurQOPUM7laOSfXO/hf_20260314_185419_c3b256b1-d0e0-4cd9-90bd-c9ee5b8c0878.png',
        title: 'Fotografía IA para redes sociales',
        text: 'Imágenes cuidadas para perfiles, campañas, anuncios, productos y contenido diario.',
    },
    {
        type: 'video',
        url: 'https://d8j0ntlcm91z4.cloudfront.net/user_3CIjqzTsrKEUr8OzFBaYO4ux3nG/hf_20260413_121933_7dfa9582-a536-4a83-9041-ee5aa102ff8c.mp4',
        title: 'Producto y contenido social en movimiento',
        text: 'Convierte conceptos de producto en piezas dinámicas para redes o presentación comercial.',
    },
];

const SERVICE_CARDS = [
    ['Imágenes con IA', 'Genera imágenes, retratos, producto, campañas, creatividad publicitaria y contenido para redes.', 'image', 'Abrir KreateImage'],
    ['Vídeos con IA', 'Crea clips desde texto, imagen o vídeo, ajustando duración, formato, movimiento y calidad.', 'video', 'Abrir KreateVideo'],
    ['Música con IA', 'Crea canciones, voces, letras, artistas IA, remixes y sonidos para proyectos creativos.', 'music', 'Abrir KreateMusic'],
    ['Formación IA', 'Aprende a usar inteligencia artificial en productividad, marketing, imagen, vídeo y negocios.', 'academy', 'Ver Academia IA'],
    ['Automatizaciones IA', 'Diseña flujos para ahorrar tiempo, responder clientes, captar leads y mejorar procesos.', 'academy', 'Aprender automatización'],
    ['Agentes IA para empresas', 'Crea asistentes para atención al cliente, ventas, reservas, soporte y prospección comercial.', 'academy', 'Ver agentes IA'],
];

const FAQS = [
    ['¿Qué es KreateIA Studio?', 'KreateIA Studio es una plataforma de inteligencia artificial generativa para crear imágenes, vídeos, música y contenido visual profesional desde el navegador.'],
    ['¿Puedo usar KreateIA para mi empresa?', 'Sí. KreateIA está pensada para creadores, marcas, negocios locales, agencias, equipos de marketing y empresas que quieren producir contenido y automatizar tareas con IA.'],
    ['¿KreateIA sirve para crear vídeos con IA?', 'Sí. Con KreateVideo puedes crear clips, escenas, piezas promocionales y contenido para redes usando prompts, imágenes o referencias visuales.'],
    ['¿También ofrecéis formación en inteligencia artificial?', 'Sí. KreateIA combina herramientas generativas con formación práctica para aprender IA desde cero, marketing con IA, vídeo, imagen, automatizaciones y agentes para empresas.'],
];

function setLandingSeo() {
    document.title = 'KreateIA Studio | Imágenes, vídeos, música y automatizaciones con IA';

    let description = document.querySelector('meta[name="description"]');
    if (!description) {
        description = document.createElement('meta');
        description.name = 'description';
        document.head.appendChild(description);
    }

    description.content = 'KreateIA Studio es una plataforma profesional de inteligencia artificial para crear imágenes, vídeos, música, contenido visual, automatizaciones y agentes IA para empresas.';

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
    }

    canonical.href = 'https://kreateia.com/';
}

function addLandingStyles() {
    if (document.querySelector('#landing-page-styles')) return;

    const style = document.createElement('style');
    style.id = 'landing-page-styles';
    style.textContent = [
        '#landing-root *{box-sizing:border-box}',
        '#landing-root{width:100%;height:100%;overflow-y:auto;overflow-x:hidden;background:#050505;color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif}',
        '.lp-shell{width:min(1200px,100%);margin:0 auto;padding:0 24px}',
        '.lp-hero{position:relative;min-height:88vh;display:flex;align-items:flex-end;overflow:hidden;border-bottom:1px solid rgba(255,255,255,.08)}',
        '.lp-hero-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#080808}',
        '.lp-hero-shade{position:absolute;inset:0;background:linear-gradient(to right,rgba(0,0,0,.92),rgba(0,0,0,.42) 48%,rgba(0,0,0,.78)),linear-gradient(to top,#050505 0%,rgba(5,5,5,.2) 52%,rgba(5,5,5,.5) 100%)}',
        '.lp-hero-content{position:relative;z-index:2;width:100%;padding:90px 0 42px}',
        '.lp-kicker{color:#f59e0b;font-size:12px;font-weight:900;text-transform:uppercase;margin:0 0 14px}',
        '.lp-title{font-size:clamp(42px,7vw,84px);line-height:.96;font-weight:950;letter-spacing:0;max-width:920px;margin:0}',
        '.lp-copy{color:rgba(255,255,255,.72);font-size:17px;line-height:1.65;max-width:650px;margin:22px 0 0}',
        '.lp-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:30px}',
        '.lp-btn{border-radius:999px;padding:13px 22px;border:1px solid rgba(255,255,255,.16);font-size:13px;font-weight:850;cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease;white-space:nowrap}',
        '.lp-btn:hover{transform:translateY(-1px)}',
        '.lp-btn-primary{background:#f59e0b;border-color:#f59e0b;color:#000}',
        '.lp-btn-secondary{background:rgba(255,255,255,.06);color:#fff}',
        '.lp-btn-secondary:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.32)}',
        '.lp-thumbs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:44px;max-width:900px}',
        '.lp-thumb{position:relative;height:150px;border-radius:8px;overflow:hidden;background:#111;border:1px solid rgba(255,255,255,.12);cursor:pointer;opacity:.74;padding:0;text-align:left;transition:opacity .18s ease,border-color .18s ease,transform .18s ease}',
        '.lp-thumb:hover,.lp-thumb.active{opacity:1;border-color:#f59e0b;transform:translateY(-2px)}',
        '.lp-thumb video{width:100%;height:100%;object-fit:cover;display:block}',
        '.lp-thumb:after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.78),rgba(0,0,0,.05))}',
        '.lp-thumb-text{position:absolute;left:12px;right:12px;bottom:10px;z-index:2}',
        '.lp-section{padding:76px 0;border-bottom:1px solid rgba(255,255,255,.08)}',
        '.lp-section h2{font-size:clamp(32px,4.6vw,52px);line-height:1.05;font-weight:950;margin:0}',
        '.lp-section p{color:rgba(255,255,255,.64);line-height:1.65}',
        '.lp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:30px}',
        '.lp-media-card{position:relative;min-height:380px;border-radius:8px;overflow:hidden;background:#111;border:1px solid rgba(255,255,255,.12)}',
        '.lp-media-card video,.lp-media-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
        '.lp-card-shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.88),rgba(0,0,0,.08))}',
        '.lp-card-text{position:absolute;left:18px;right:18px;bottom:18px}',
        '.lp-card-text h3{color:#fff;font-size:20px;line-height:1.12;font-weight:950;margin:0 0 10px}',
        '.lp-card-text p{color:rgba(255,255,255,.68);font-size:13px;line-height:1.5;margin:0}',
        '.lp-studio-grid,.lp-pricing,.lp-faq-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:28px}',
        '.lp-pricing{grid-template-columns:repeat(4,minmax(0,1fr))}',
        '.lp-faq-grid{grid-template-columns:repeat(2,minmax(0,1fr))}',
        '.lp-box{background:#101010;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:22px}',
        '.lp-box h3{margin:0 0 10px;font-size:18px;font-weight:900}',
        '.lp-box p{margin:0 0 18px;font-size:13px}',
        '.lp-price strong{display:block;color:#f59e0b;font-size:18px;margin-top:6px}',
        '@media(max-width:860px){.lp-shell{padding:0 16px}.lp-hero{min-height:92vh}.lp-copy{font-size:15px}.lp-thumbs,.lp-studio-grid,.lp-pricing,.lp-faq-grid{grid-template-columns:1fr}.lp-thumb{height:120px}}',
    ].join('\n');

    document.head.appendChild(style);
}

function makeVideo(url, className) {
    const video = document.createElement('video');
    video.src = url;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    if (className) video.className = className;
    return video;
}

function makeButton(text, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
}

function makeMediaCard(item, label, labelColor) {
    const card = document.createElement('article');
    card.className = 'lp-media-card';

    let media;
    if (item.type === 'image') {
        media = document.createElement('img');
        media.src = item.url;
        media.alt = item.title;
        media.loading = 'lazy';
    } else {
        media = makeVideo(item.url);
    }

    const shade = document.createElement('div');
    shade.className = 'lp-card-shade';

    const text = document.createElement('div');
    text.className = 'lp-card-text';

    const small = document.createElement('p');
    small.style.cssText = 'font-size:11px;font-weight:900;margin:0 0 8px;color:' + labelColor;
    small.textContent = label;

    const title = document.createElement('h3');
    title.textContent = item.title;

    const desc = document.createElement('p');
    desc.textContent = item.text;

    text.appendChild(small);
    text.appendChild(title);
    text.appendChild(desc);

    card.appendChild(media);
    card.appendChild(shade);
    card.appendChild(text);

    return card;
}

function makeSection(kicker, title, text, color) {
    const section = document.createElement('section');
    section.className = 'lp-section';

    const shell = document.createElement('div');
    shell.className = 'lp-shell';

    const k = document.createElement('p');
    k.className = 'lp-kicker';
    k.textContent = kicker;
    if (color) k.style.color = color;

    const h = document.createElement('h2');
    h.textContent = title;

    const p = document.createElement('p');
    p.style.cssText = 'max-width:720px;margin:16px 0 0';
    p.textContent = text;

    shell.appendChild(k);
    shell.appendChild(h);
    shell.appendChild(p);
    section.appendChild(shell);

    return { section, shell };
}

export function LandingPage(navigate) {
    setLandingSeo();
    addLandingStyles();

    const root = document.createElement('div');
    root.id = 'landing-root';

    const first = HERO_VIDEOS[0];

    const hero = document.createElement('section');
    hero.className = 'lp-hero';

    const heroVideo = makeVideo(first.url, 'lp-hero-video');
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
    title.textContent = 'Plataforma de IA para crear imágenes, vídeos, música y contenido profesional.';

    const copy = document.createElement('p');
    copy.className = 'lp-copy';
    copy.textContent = 'KreateIA Studio reúne herramientas de inteligencia artificial generativa para creadores, empresas, marcas y negocios que quieren producir contenido visual, automatizar tareas y aprender IA de forma práctica.';

    const actions = document.createElement('div');
    actions.className = 'lp-actions';
    actions.appendChild(makeButton('Entrar al estudio', 'lp-btn lp-btn-primary', () => navigate('image')));
    actions.appendChild(makeButton('Ver ejemplos generados', 'lp-btn lp-btn-secondary', () => {
        root.querySelector('#landing-videos')?.scrollIntoView({ behavior: 'smooth' });
    }));

    const thumbs = document.createElement('div');
    thumbs.className = 'lp-thumbs';

    HERO_VIDEOS.forEach((item, index) => {
        const thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.className = index === 0 ? 'lp-thumb active' : 'lp-thumb';

        const video = makeVideo(item.url);

        const thumbText = document.createElement('div');
        thumbText.className = 'lp-thumb-text';

        const mode = document.createElement('p');
        mode.style.cssText = 'color:#f59e0b;font-size:10px;font-weight:900;margin:0 0 4px';
        mode.textContent = item.mode;

        const thumbTitle = document.createElement('p');
        thumbTitle.style.cssText = 'color:#fff;font-size:13px;font-weight:850;margin:0';
        thumbTitle.textContent = item.title;

        thumbText.appendChild(mode);
        thumbText.appendChild(thumbTitle);
        thumb.appendChild(video);
        thumb.appendChild(thumbText);

        thumb.addEventListener('click', () => {
            heroVideo.src = item.url;
            heroVideo.play().catch(() => {});
            copy.textContent = item.text;
            thumbs.querySelectorAll('.lp-thumb').forEach(btn => btn.classList.remove('active'));
            thumb.classList.add('active');
        });

        thumbs.appendChild(thumb);
    });

    shell.appendChild(kicker);
    shell.appendChild(title);
    shell.appendChild(copy);
    shell.appendChild(actions);
    shell.appendChild(thumbs);

    heroContent.appendChild(shell);
    hero.appendChild(heroVideo);
    hero.appendChild(heroShade);
    hero.appendChild(heroContent);
    root.appendChild(hero);

    const videos = makeSection(
        'Generador de vídeo IA',
        'Vídeos generados con inteligencia artificial',
        'Crea escenas, clips promocionales, contenido para redes y piezas visuales con estética cinematográfica usando KreateVideo.',
        '#f59e0b'
    );
    videos.section.id = 'landing-videos';

    const videoGrid = document.createElement('div');
    videoGrid.className = 'lp-grid';
    VIDEO_SHOWCASE.forEach(item => {
        videoGrid.appendChild(makeMediaCard(item, 'KreateVideo', '#f59e0b'));
    });
    videos.shell.appendChild(videoGrid);
    root.appendChild(videos.section);

    const photos = makeSection(
        'Generador de imágenes IA',
        'Fotografía, producto y creatividad para redes',
        'Genera imágenes para campañas, marcas personales, tiendas online, anuncios, fotografía de producto y contenido social.',
        '#3b82f6'
    );

    const photoGrid = document.createElement('div');
    photoGrid.className = 'lp-grid';
    PHOTO_SHOWCASE.forEach(item => {
        photoGrid.appendChild(makeMediaCard(item, item.type === 'image' ? 'KreateImage' : 'KreateImage + KreateVideo', '#3b82f6'));
    });
    photos.shell.appendChild(photoGrid);
    root.appendChild(photos.section);

    const studios = document.createElement('section');
    studios.className = 'lp-section';
    studios.style.background = '#080808';

    const studioShell = document.createElement('div');
    studioShell.className = 'lp-shell';

    const studioKicker = document.createElement('p');
    studioKicker.className = 'lp-kicker';
    studioKicker.textContent = 'Herramientas IA';

    const studioTitle = document.createElement('h2');
    studioTitle.textContent = 'Crea, aprende y automatiza con IA';

    const studioText = document.createElement('p');
    studioText.style.cssText = 'max-width:760px;margin:16px 0 0';
    studioText.textContent = 'KreateIA combina estudio creativo, formación y servicios de inteligencia artificial para ayudar a personas y empresas a producir mejor, ahorrar tiempo y vender con más claridad.';

    const studioGrid = document.createElement('div');
    studioGrid.className = 'lp-studio-grid';

    SERVICE_CARDS.forEach(([name, text, page, buttonText]) => {
        const card = document.createElement('article');
        card.className = 'lp-box';

        const h = document.createElement('h3');
        h.textContent = name;

        const p = document.createElement('p');
        p.textContent = text;

        const b = makeButton(buttonText, 'lp-btn lp-btn-secondary', () => navigate(page));

        card.appendChild(h);
        card.appendChild(p);
        card.appendChild(b);
        studioGrid.appendChild(card);
    });

    studioShell.appendChild(studioKicker);
    studioShell.appendChild(studioTitle);
    studioShell.appendChild(studioText);
    studioShell.appendChild(studioGrid);
    studios.appendChild(studioShell);
    root.appendChild(studios);

    const academy = makeSection(
        'Academia IA',
        'Formación en inteligencia artificial para personas y empresas',
        'Aprende IA desde cero, marketing con IA, creación de imágenes, vídeo, productividad, automatizaciones y agentes inteligentes aplicados a negocios reales.',
        '#f59e0b'
    );

    const academyActions = document.createElement('div');
    academyActions.className = 'lp-actions';
    academyActions.appendChild(makeButton('Ver Academia IA', 'lp-btn lp-btn-primary', () => navigate('academy')));
    academyActions.appendChild(makeButton('Crear un vídeo', 'lp-btn lp-btn-secondary', () => navigate('video')));
    academy.shell.appendChild(academyActions);
    root.appendChild(academy.section);

    const credits = makeSection(
        'Créditos transparentes',
        'Antes de generar, ves el coste',
        'KreateIA funciona con créditos. El precio cambia según el tipo de creación, la resolución, la duración y la calidad elegida.',
        '#f59e0b'
    );

    const pricing = document.createElement('div');
    pricing.className = 'lp-pricing';

    [
        ['Imagen IA', 'desde 16 créditos'],
        ['Vídeo IA', 'según duración'],
        ['Música IA', 'según generación'],
        ['Artistas IA', 'perfil visual y voz'],
    ].forEach(([name, value]) => {
        const box = document.createElement('div');
        box.className = 'lp-box lp-price';

        const span = document.createElement('span');
        span.textContent = name;

        const strong = document.createElement('strong');
        strong.textContent = value;

        box.appendChild(span);
        box.appendChild(strong);
        pricing.appendChild(box);
    });

    credits.shell.appendChild(pricing);
    root.appendChild(credits.section);

    const faq = makeSection(
        'Preguntas frecuentes',
        'Dudas habituales sobre KreateIA',
        'Respuestas rápidas para entender qué puedes crear, para quién sirve y cómo empezar.',
        '#3b82f6'
    );

    const faqGrid = document.createElement('div');
    faqGrid.className = 'lp-faq-grid';

    FAQS.forEach(([question, answer]) => {
        const box = document.createElement('article');
        box.className = 'lp-box';

        const h = document.createElement('h3');
        h.textContent = question;

        const p = document.createElement('p');
        p.textContent = answer;

        box.appendChild(h);
        box.appendChild(p);
        faqGrid.appendChild(box);
    });

    faq.shell.appendChild(faqGrid);
    root.appendChild(faq.section);

    const finalSection = document.createElement('section');
    finalSection.style.cssText = 'padding:84px 0';

    const finalShell = document.createElement('div');
    finalShell.className = 'lp-shell';
    finalShell.style.textAlign = 'center';

    const finalKicker = document.createElement('p');
    finalKicker.className = 'lp-kicker';
    finalKicker.textContent = 'KreateIA Studio';

    const finalTitle = document.createElement('h2');
    finalTitle.style.cssText = 'font-size:clamp(32px,4.6vw,52px);line-height:1.05;font-weight:950;margin:0';
    finalTitle.textContent = 'Empieza a crear con inteligencia artificial profesional.';

    const finalText = document.createElement('p');
    finalText.style.cssText = 'color:rgba(255,255,255,.64);max-width:620px;margin:18px auto 28px;line-height:1.65';
    finalText.textContent = 'Entra al estudio, elige herramienta, configura tu generación y lanza imágenes, vídeos o música con IA desde una sola plataforma.';

    finalShell.appendChild(finalKicker);
    finalShell.appendChild(finalTitle);
    finalShell.appendChild(finalText);
    finalShell.appendChild(makeButton('Entrar al estudio', 'lp-btn lp-btn-primary', () => navigate('image')));

    finalSection.appendChild(finalShell);
    root.appendChild(finalSection);

    return root;
}
