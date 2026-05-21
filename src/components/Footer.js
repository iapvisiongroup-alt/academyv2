// ── Modal helper ─────────────────────────────────────────────────────────────
function openPageModal(title, contentHtml) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(12px);z-index:999999;display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow-y:auto';

    const box = document.createElement('div');
    box.style.cssText = 'background:#0d0d0d;border:1px solid #2a2a2a;border-radius:20px;width:100%;max-width:760px;padding:36px 40px;color:#ccc;font-size:14px;line-height:1.8;margin:auto;position:relative';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.style.cssText = 'position:absolute;top:16px;right:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;color:#666;cursor:pointer;padding:6px 10px;font-size:13px;line-height:1';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    box.innerHTML = `
        <h1 style="color:#fff;font-size:22px;font-weight:900;margin:0 0 24px;padding-right:40px">${title}</h1>
        ${contentHtml}
    `;
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// ── Contenidos de cada página ─────────────────────────────────────────────────
const PAGES = {
    empresas: {
        title: 'Servicios a Empresas',
        content: `
            <p>En <strong style="color:#fff">KreateIA</strong> ayudamos a empresas de todos los sectores a crecer digitalmente combinando estrategia, creatividad e inteligencia artificial. Estos son nuestros servicios:</p>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0">
                <div style="padding:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px">
                    <p style="color:#f59e0b;font-size:18px;margin:0 0 6px">📱</p>
                    <p style="color:#fff;font-weight:700;margin:0 0 4px;font-size:13px">Marketing Digital</p>
                    <p style="color:#888;font-size:12px;margin:0">Estrategias de captación y fidelización, campañas en Google Ads y Meta Ads, email marketing automatizado y análisis de resultados en tiempo real.</p>
                </div>
                <div style="padding:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px">
                    <p style="color:#f59e0b;font-size:18px;margin:0 0 6px">🔍</p>
                    <p style="color:#fff;font-weight:700;margin:0 0 4px;font-size:13px">SEO con IA</p>
                    <p style="color:#888;font-size:12px;margin:0">Posicionamiento orgánico en buscadores con generación automática de contenido SEO, análisis de competencia y optimización técnica de tu web.</p>
                </div>
                <div style="padding:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px">
                    <p style="color:#f59e0b;font-size:18px;margin:0 0 6px">🌐</p>
                    <p style="color:#fff;font-weight:700;margin:0 0 4px;font-size:13px">Creación de Páginas Web</p>
                    <p style="color:#888;font-size:12px;margin:0">Diseño y desarrollo de webs corporativas, tiendas online y landing pages de alto rendimiento. Rápidas, seguras y optimizadas para móvil.</p>
                </div>
                <div style="padding:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px">
                    <p style="color:#f59e0b;font-size:18px;margin:0 0 6px">⚙️</p>
                    <p style="color:#fff;font-weight:700;margin:0 0 4px;font-size:13px">Automatizaciones con IA</p>
                    <p style="color:#888;font-size:12px;margin:0">Automatización de procesos internos, chatbots inteligentes para atención al cliente, flujos de trabajo con n8n/Make y generación automática de informes.</p>
                </div>
                <div style="padding:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px">
                    <p style="color:#f59e0b;font-size:18px;margin:0 0 6px">📸</p>
                    <p style="color:#fff;font-weight:700;margin:0 0 4px;font-size:13px">Fotos de Producto con IA</p>
                    <p style="color:#888;font-size:12px;margin:0">Generación de imágenes fotorrealistas de tus productos en cualquier entorno, sin necesidad de sesión fotográfica. Ideal para e-commerce y catálogos.</p>
                </div>
                <div style="padding:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px">
                    <p style="color:#f59e0b;font-size:18px;margin:0 0 6px">🎬</p>
                    <p style="color:#fff;font-weight:700;margin:0 0 4px;font-size:13px">Vídeos Publicitarios con IA</p>
                    <p style="color:#888;font-size:12px;margin:0">Producción de vídeos para redes sociales, anuncios y presentaciones corporativas usando IA generativa. Entrega en 24–48 horas.</p>
                </div>
                <div style="padding:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px">
                    <p style="color:#f59e0b;font-size:18px;margin:0 0 6px">🎵</p>
                    <p style="color:#fff;font-weight:700;margin:0 0 4px;font-size:13px">Contenido para Redes Sociales</p>
                    <p style="color:#888;font-size:12px;margin:0">Creación de contenido visual, textual y audiovisual para Instagram, TikTok, YouTube y LinkedIn. Calendarios editoriales y gestión completa de perfiles.</p>
                </div>
                <div style="padding:16px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px">
                    <p style="color:#f59e0b;font-size:18px;margin:0 0 6px">🤖</p>
                    <p style="color:#fff;font-weight:700;margin:0 0 4px;font-size:13px">Consultoría IA para Empresas</p>
                    <p style="color:#888;font-size:12px;margin:0">Análisis de tu negocio e implementación de soluciones de inteligencia artificial a medida para optimizar procesos, reducir costes y aumentar ingresos.</p>
                </div>
            </div>

            <div style="margin-top:8px;padding:20px;background:#f59e0b11;border:1px solid #f59e0b33;border-radius:14px">
                <p style="margin:0;color:#f59e0b;font-weight:700">¿Hablamos?</p>
                <p style="margin:6px 0 0">Solicita una consulta gratuita en <a href="mailto:info@kreateia.com" style="color:#f59e0b">info@kreateia.com</a> y te preparamos una propuesta personalizada sin compromiso.</p>
            </div>
        `
    },
    faq: {
        title: 'Preguntas Frecuentes',
        content: `
            <div style="display:flex;flex-direction:column;gap:20px">
                ${[
                    ['¿Qué son los créditos (🪙)?', 'Los créditos son la moneda interna de KreateIA. 1 crédito equivale a $0.01. Cada generación consume una cantidad de créditos según el modelo, la duración y la resolución elegida. Puedes ver el coste exacto antes de generar.'],
                    ['¿Puedo usar el contenido generado comercialmente?', 'El contenido generado con nuestras herramientas puede usarse con fines creativos y personales. Para uso comercial, recomendamos revisar los términos del proveedor de IA subyacente. Contáctanos si tienes dudas específicas.'],
                    ['¿Cuánto tarda una generación?', 'Las imágenes tardan entre 10 y 60 segundos. Los vídeos entre 1 y 3 minutos. La música entre 30 segundos y 2 minutos. Puedes lanzar varias generaciones en paralelo y seguirlas desde el panel de generaciones.'],
                    ['¿Qué pasa si una generación falla?', 'Si la generación falla por un error del servidor, los créditos se reembolsan automáticamente. Si falla por contenido no permitido (copyright, políticas de uso), los créditos no se devuelven.'],
                    ['¿Cómo añado más créditos?', 'Haz clic en el contador de créditos en la barra superior para ver los planes disponibles y añadir créditos con tarjeta.'],
                    ['¿Mis datos están seguros?', 'Sí. Usamos Firebase con autenticación segura. Las claves de API nunca se exponen al navegador. El contenido generado se almacena en tu cuenta personal.'],
                    ['¿Puedo cancelar en cualquier momento?', 'Los créditos no tienen fecha de caducidad. No hay suscripciones obligatorias; solo pagas por lo que usas.'],
                ].map(([q, a]) => `
                    <div style="border:1px solid #2a2a2a;border-radius:12px;padding:16px 20px">
                        <p style="color:#fff;font-weight:700;margin:0 0 6px">${q}</p>
                        <p style="margin:0;color:#999">${a}</p>
                    </div>
                `).join('')}
            </div>
        `
    },
    about: {
        title: 'Quiénes Somos',
        content: `
            <p>KreateIA Studio es una plataforma de creación con inteligencia artificial desarrollada por <strong style="color:#fff">KreateIA</strong>, empresa española especializada en soluciones de IA aplicada para empresas y creadores.</p>
            <p>Nuestro objetivo es democratizar el acceso a las herramientas de IA generativa más avanzadas del mundo, empaquetándolas en una interfaz simple, potente y accesible para cualquier persona o empresa.</p>
            <h3 style="color:#fff;margin:20px 0 8px">Nuestra misión</h3>
            <p>Que cualquier persona, independientemente de sus conocimientos técnicos, pueda crear imágenes, vídeos y música de calidad profesional en segundos, y que las empresas puedan aprovechar el poder de la IA para crecer digitalmente.</p>
            <h3 style="color:#fff;margin:20px 0 8px">Tecnología</h3>
            <p>Integramos los modelos de IA más potentes del mercado — imágenes, vídeo, música y voz — a través de APIs de vanguardia, con una infraestructura segura y escalable sobre Cloudflare y Firebase.</p>
            <h3 style="color:#fff;margin:20px 0 8px">Dónde estamos</h3>
            <div style="padding:16px 20px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;display:flex;gap:12px;align-items:flex-start">
                <span style="font-size:20px">📍</span>
                <div>
                    <p style="color:#fff;font-weight:700;margin:0">KreateIA</p>
                    <p style="color:#999;margin:4px 0 0">C/ Lino León Martínez, 6 BJ<br>Torre-Pacheco, Murcia 30700<br>España</p>
                </div>
            </div>
            <div style="margin-top:20px;padding:20px;background:#3b82f611;border:1px solid #3b82f633;border-radius:14px">
                <p style="margin:0;color:#60a5fa;font-weight:700">Contacto corporativo</p>
                <p style="margin:6px 0 0"><a href="mailto:info@kreateia.com" style="color:#60a5fa">info@kreateia.com</a></p>
            </div>
        `
    },
    contacto: {
        title: 'Contacto',
        content: `
            <p>Estamos aquí para ayudarte. Puedes contactarnos por cualquiera de estos canales:</p>
            <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
                <div style="padding:16px 20px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px">
                    <p style="color:#fff;font-weight:700;margin:0 0 4px">✉️ Email general</p>
                    <a href="mailto:info@kreateia.com" style="color:#f59e0b">info@kreateia.com</a>
                </div>
                <div style="padding:16px 20px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px">
                    <p style="color:#fff;font-weight:700;margin:0 0 4px">🏢 Soporte técnico</p>
                    <a href="mailto:soporte@kreateia.com" style="color:#f59e0b">soporte@kreateia.com</a>
                </div>
                <div style="padding:16px 20px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px">
                    <p style="color:#fff;font-weight:700;margin:0 0 4px">💼 Empresas y partnerships</p>
                    <a href="mailto:empresas@kreateia.com" style="color:#f59e0b">empresas@kreateia.com</a>
                </div>
            </div>
            <p style="margin-top:20px;color:#666;font-size:12px">Respondemos en un plazo máximo de 24–48 horas laborables.</p>
        `
    },
    cookies: {
        title: 'Política de Cookies',
        content: `
            <p style="color:#888;font-size:12px">En cumplimiento del artículo 22.2 de la Ley 34/2002, de Servicios de la Sociedad de la Información (LSSI-CE) y el Reglamento (UE) 2016/679 (RGPD), le informamos sobre el uso de cookies en este sitio web.</p>

            <h3 style="color:#fff;margin:20px 0 8px">1. ¿Qué son las cookies?</h3>
            <p>Las cookies son pequeños ficheros de texto que se descargan en el dispositivo del usuario cuando accede a un sitio web. Permiten recordar información sobre tu visita, lo que facilita volver a visitar el sitio y lo hace más útil.</p>

            <h3 style="color:#fff;margin:20px 0 8px">2. Responsable del tratamiento</h3>
            <div style="padding:14px 18px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;font-size:13px;color:#999">
                <p style="margin:0"><strong style="color:#fff">KreateIA</strong><br>
                C/ Lino León Martínez, 6 BJ — Torre-Pacheco, Murcia 30700, España<br>
                Email: <a href="mailto:info@kreateia.com" style="color:#f59e0b">info@kreateia.com</a></p>
            </div>

            <h3 style="color:#fff;margin:20px 0 8px">3. Tipos de cookies utilizadas</h3>
            <div style="display:flex;flex-direction:column;gap:10px">
                <div style="padding:14px 18px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px">
                    <p style="color:#fff;font-weight:700;margin:0 0 4px;font-size:13px">🔒 Cookies estrictamente necesarias</p>
                    <p style="margin:0;color:#999;font-size:12px"><strong style="color:#ccc">Base legal:</strong> Interés legítimo / Ejecución del contrato (art. 6.1.b RGPD). No requieren consentimiento.</p>
                    <p style="margin:6px 0 0;color:#999;font-size:12px">Gestionan la sesión de usuario (Firebase Authentication), mantienen el estado de inicio de sesión y recuerdan preferencias esenciales de la plataforma. Sin estas cookies el servicio no puede funcionar.</p>
                </div>
                <div style="padding:14px 18px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px">
                    <p style="color:#fff;font-weight:700;margin:0 0 4px;font-size:13px">📊 Cookies analíticas</p>
                    <p style="margin:0;color:#999;font-size:12px"><strong style="color:#ccc">Base legal:</strong> Consentimiento del usuario (art. 6.1.a RGPD). Solo se instalan si aceptas.</p>
                    <p style="margin:6px 0 0;color:#999;font-size:12px">Nos permiten medir el número de visitas y el comportamiento de los usuarios de forma anónima y agregada para mejorar el servicio.</p>
                </div>
                <div style="padding:14px 18px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px">
                    <p style="color:#fff;font-weight:700;margin:0 0 4px;font-size:13px">🔧 Cookies de terceros</p>
                    <p style="margin:0;color:#999;font-size:12px">Cloudflare (seguridad y rendimiento) y Firebase/Google (autenticación y base de datos). Estos proveedores tienen sus propias políticas de privacidad conformes al RGPD.</p>
                </div>
            </div>

            <h3 style="color:#fff;margin:20px 0 8px">4. Plazo de conservación</h3>
            <p style="font-size:13px">Las cookies de sesión se eliminan al cerrar el navegador. Las cookies persistentes de autenticación tienen un plazo máximo de 30 días, renovándose con cada inicio de sesión.</p>

            <h3 style="color:#fff;margin:20px 0 8px">5. Tus derechos</h3>
            <p style="font-size:13px">De acuerdo con el RGPD, tienes derecho a <strong style="color:#ccc">acceder, rectificar, suprimir, oponerte y portar</strong> tus datos personales. Puedes ejercer estos derechos escribiendo a <a href="mailto:info@kreateia.com" style="color:#f59e0b">info@kreateia.com</a>. También puedes presentar una reclamación ante la <a href="https://www.aepd.es" target="_blank" style="color:#f59e0b">Agencia Española de Protección de Datos (AEPD)</a>.</p>

            <h3 style="color:#fff;margin:20px 0 8px">6. Cómo gestionar las cookies</h3>
            <p style="font-size:13px">Puedes configurar tu navegador para bloquear o eliminar cookies. Ten en cuenta que desactivar cookies esenciales impedirá el uso de la plataforma:</p>
            <ul style="padding-left:20px;font-size:12px;color:#888;display:flex;flex-direction:column;gap:4px;margin-top:8px">
                <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" style="color:#f59e0b">Chrome</a></li>
                <li><a href="https://support.mozilla.org/es/kb/habilitar-y-deshabilitar-cookies-sitios-web-rastrear-preferencias" target="_blank" style="color:#f59e0b">Firefox</a></li>
                <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" style="color:#f59e0b">Safari</a></li>
                <li><a href="https://support.microsoft.com/es-es/windows/eliminar-y-administrar-cookies-168dab11-0753-043d-7c16-ede5947fc64d" target="_blank" style="color:#f59e0b">Microsoft Edge</a></li>
            </ul>

            <p style="color:#555;font-size:11px;margin-top:24px;border-top:1px solid #2a2a2a;padding-top:12px">Última actualización: enero 2026. Nos reservamos el derecho a modificar esta política para adaptarla a novedades legislativas o jurisprudenciales.</p>
        `
    }
};

export function Footer() {
    const footer = document.createElement('footer');
    footer.className = 'w-full bg-[#030303] border-t border-white/5 py-5 px-6 z-40 relative flex-shrink-0';

    const links = [
        { label: 'Servicios a Empresas', page: 'empresas' },
        { label: 'Preguntas Frecuentes', page: 'faq' },
        { label: 'Quiénes Somos',        page: 'about' },
        { label: 'Contacto',             page: 'contacto' },
        { label: 'Política de Cookies',  page: 'cookies' },
    ];

    const nav = document.createElement('nav');
    nav.className = 'flex flex-wrap justify-center gap-x-6 gap-y-2';

    links.forEach(({ label, page }) => {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'text-white/50 hover:text-[#FFB000] text-xs font-medium transition-colors';
        a.textContent = label;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const p = PAGES[page];
            if (p) openPageModal(p.title, p.content);
        });
        nav.appendChild(a);
    });

    footer.innerHTML = `
        <div class="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex flex-col items-center md:items-start gap-1">
                <div class="flex items-center font-bold tracking-tight text-md opacity-80">
                    <span style="background:linear-gradient(135deg,#60A5FA 0%,#3B82F6 100%);-webkit-background-clip:text;color:transparent">Kreate</span>
                    <span style="background:linear-gradient(135deg,#FF6B00 0%,#FFB000 100%);-webkit-background-clip:text;color:transparent;margin-left:2px">IA</span>
                </div>
                <p class="text-white/30 text-[10px]">© ${new Date().getFullYear()} KreateIA Studio. Todos los derechos reservados.</p>
            </div>
            <div id="footer-nav-placeholder"></div>
        </div>
    `;

    footer.querySelector('#footer-nav-placeholder').replaceWith(nav);
    return footer;
}
