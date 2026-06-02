import { auth, db, APP_ID } from '../lib/firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { AuthModal } from './AuthModal.js';
import { ACADEMY_COURSES } from '../lib/academyCourses.js';

function addAcademyStyles() {
    if (document.querySelector('#academy-page-styles')) return;

    const style = document.createElement('style');
    style.id = 'academy-page-styles';
    style.textContent = `
        #academy-root *{box-sizing:border-box}
        #academy-root{width:100%;height:100%;overflow-y:auto;overflow-x:hidden;background:#050505;color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif}
        .ac-shell{width:min(1180px,100%);margin:0 auto;padding:34px 18px 80px}
        .ac-hero{padding:48px 0 28px;border-bottom:1px solid rgba(255,255,255,.08)}
        .ac-kicker{color:#f59e0b;font-size:12px;font-weight:950;text-transform:uppercase;margin:0 0 14px}
        .ac-title{font-size:clamp(38px,6vw,78px);line-height:.96;font-weight:950;letter-spacing:0;margin:0;max-width:920px}
        .ac-copy{color:rgba(255,255,255,.68);font-size:17px;line-height:1.65;max-width:720px;margin:20px 0 0}
        .ac-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:28px}
        .ac-step{background:#101010;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:16px}
        .ac-step strong{display:block;font-size:14px;margin-bottom:6px}
        .ac-step span{display:block;color:rgba(255,255,255,.58);font-size:12px;line-height:1.45}
        .ac-support{margin-top:22px;background:#0d1510;border:1px solid rgba(34,197,94,.22);border-radius:8px;padding:20px}
        .ac-support h2{font-size:24px;margin:0 0 8px}
        .ac-support p{color:rgba(255,255,255,.66);line-height:1.6;margin:0}
        .ac-courses{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:28px}
        .ac-card{background:#101010;border:1px solid rgba(255,255,255,.1);border-radius:8px;overflow:hidden;display:flex;flex-direction:column}
        .ac-card-head{padding:20px;border-bottom:1px solid rgba(255,255,255,.08)}
        .ac-badge{display:inline-flex;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.25);color:#f59e0b;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:950;margin-bottom:14px}
        .ac-card h2{font-size:24px;line-height:1.05;margin:0 0 10px;font-weight:950}
        .ac-price{font-size:30px;font-weight:950;color:#fff;margin:0}
        .ac-desc{color:rgba(255,255,255,.64);font-size:14px;line-height:1.55;margin:12px 0 0}
        .ac-meta{display:grid;grid-template-columns:1fr;gap:8px;margin-top:14px}
        .ac-meta div{background:#0b0b0b;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;color:rgba(255,255,255,.72);font-size:12px;font-weight:800}
        .ac-body{padding:20px;display:grid;gap:18px;flex:1}
        .ac-section-title{font-size:12px;font-weight:950;text-transform:uppercase;color:#f59e0b;margin:0 0 10px}
        .ac-lesson{padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08)}
        .ac-lesson:last-child{border-bottom:0}
        .ac-lesson strong{display:block;font-size:14px;margin-bottom:6px}
        .ac-lesson p{color:rgba(255,255,255,.58);font-size:13px;line-height:1.5;margin:0}
        .ac-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}
        .ac-list li{color:rgba(255,255,255,.68);font-size:13px;line-height:1.45;display:flex;gap:8px}
        .ac-list li:before{content:"✓";color:#22c55e;font-weight:950}
        .ac-actions{padding:18px 20px;border-top:1px solid rgba(255,255,255,.08);display:grid;gap:10px}
        .ac-btn{border:0;border-radius:999px;padding:13px 18px;font-size:13px;font-weight:950;cursor:pointer;transition:transform .15s ease,opacity .15s ease;background:#f59e0b;color:#111827}
        .ac-btn:hover{transform:translateY(-1px)}
        .ac-btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
        .ac-btn.paid{background:#16a34a;color:#fff}
        .ac-note{color:rgba(255,255,255,.45);font-size:11px;line-height:1.45;text-align:center;margin:0}
        .ac-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:120;background:#fff;color:#111827;border-radius:999px;padding:12px 16px;font-size:13px;font-weight:900;box-shadow:0 20px 60px rgba(0,0,0,.35)}
        @media(max-width:860px){.ac-flow,.ac-courses{grid-template-columns:1fr}.ac-title{font-size:40px}.ac-shell{padding:22px 14px 70px}}
    `;

    document.head.appendChild(style);
}

function toast(root, message) {
    const old = root.querySelector('.ac-toast');
    if (old) old.remove();

    const el = document.createElement('div');
    el.className = 'ac-toast';
    el.textContent = message;
    root.appendChild(el);

    setTimeout(() => el.remove(), 3200);
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    }[m]));
}

export function AcademyPage(navigate) {
    addAcademyStyles();

    const root = document.createElement('div');
    root.id = 'academy-root';

    let currentUser = auth.currentUser || null;
    let purchases = {};
    let loadingCourseId = '';

    function render() {
        root.innerHTML = '';

        const shell = document.createElement('div');
        shell.className = 'ac-shell';

        shell.innerHTML = `
            <section class="ac-hero">
                <p class="ac-kicker">Academia IA KreateIA</p>
                <h1 class="ac-title">Cursos online de inteligencia artificial, explicados paso a paso.</h1>
                <p class="ac-copy">
                    Aprende IA sin tecnicismos raros. Clases por Zoom, acceso a KreateIA Studio y acompañamiento por WhatsApp para resolver dudas mientras aplicas lo aprendido.
                </p>
                <div class="ac-flow">
                    <div class="ac-step"><strong>1. Elige curso</strong><span>Escoge el nivel que encaja contigo: diagnóstico, express, creador o profesional.</span></div>
                    <div class="ac-step"><strong>2. Paga seguro</strong><span>El pago se realiza con Stripe. Al volver, tu curso aparecerá como pagado.</span></div>
                    <div class="ac-step"><strong>3. Agenda clase</strong><span>Te mostraremos horarios disponibles para reservar tu sesión online.</span></div>
                    <div class="ac-step"><strong>4. Aprende con soporte</strong><span>Después de clase puedes resolver dudas por WhatsApp según el curso contratado.</span></div>
                </div>
            </section>

            <section class="ac-support">
                <h2>No te dejamos solo después de clase</h2>
                <p>
                    Todos los cursos incluyen acompañamiento por WhatsApp. Podrás preguntar dudas, revisar prompts, pedir orientación y desbloquearte mientras aplicas la IA en tu trabajo, contenido o negocio.
                </p>
            </section>
        `;

        const grid = document.createElement('section');
        grid.className = 'ac-courses';

        ACADEMY_COURSES.forEach(course => {
            const paid = purchases[course.id]?.status === 'paid';
            const card = document.createElement('article');
            card.className = 'ac-card';

            card.innerHTML = `
                <div class="ac-card-head">
                    <span class="ac-badge">${escapeHtml(course.badge)}</span>
                    <h2>${escapeHtml(course.name)}</h2>
                    <p class="ac-price">${escapeHtml(course.priceLabel)}</p>
                    <p class="ac-desc">${escapeHtml(course.shortDescription)}</p>
                    <div class="ac-meta">
                        <div>${escapeHtml(course.duration)}</div>
                        <div>${escapeHtml(course.format)}</div>
                        <div>${escapeHtml(course.whatsappSupport)}</div>
                    </div>
                </div>

                <div class="ac-body">
                    <div>
                        <p class="ac-section-title">Qué se da en clase</p>
                        ${course.lessons.map(lesson => `
                            <div class="ac-lesson">
                                <strong>${escapeHtml(lesson.title)}</strong>
                                <p>${escapeHtml(lesson.text)}</p>
                            </div>
                        `).join('')}
                    </div>

                    <div>
                        <p class="ac-section-title">Qué incluye</p>
                        <ul class="ac-list">
                            ${course.includes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                        </ul>
                    </div>
                </div>

                <div class="ac-actions">
                    <button class="ac-btn ${paid ? 'paid' : ''}" data-course-action="${escapeHtml(course.id)}">
                        ${paid ? 'Pagado · Agendar clase' : loadingCourseId === course.id ? 'Abriendo pago...' : 'Comprar ' + escapeHtml(course.name)}
                    </button>
                    <p class="ac-note">
                        ${paid ? 'Ya tienes este curso activo en tu cuenta.' : 'Después del pago podrás elegir día y hora desde la propia web.'}
                    </p>
                </div>
            `;

            grid.appendChild(card);
        });

        shell.appendChild(grid);
        root.appendChild(shell);

        root.querySelectorAll('[data-course-action]').forEach(button => {
            button.addEventListener('click', () => {
                const courseId = button.dataset.courseAction;
                const paid = purchases[courseId]?.status === 'paid';

                if (paid) {
                    toast(root, 'Agenda disponible en el siguiente paso. Primero dejamos pagos funcionando.');
                    return;
                }

                startCheckout(courseId);
            });
        });
    }

    async function loadPurchases(user) {
        purchases = {};

        if (!user) {
            render();
            return;
        }

        try {
            const snap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'academy_purchases'));

            snap.forEach(d => {
                purchases[d.id] = { id: d.id, ...d.data() };
            });
        } catch (err) {
            console.warn('[Academy] No se pudieron cargar compras:', err.message);
        }

        render();
    }

    async function startCheckout(courseId) {
        if (!auth.currentUser) {
            document.body.appendChild(AuthModal());
            return;
        }

        loadingCourseId = courseId;
        render();

        try {
            const token = await auth.currentUser.getIdToken();

            const res = await fetch('/api/academy/create-checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({ courseId }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.checkoutUrl) {
                throw new Error(data.error || 'No se pudo abrir el pago.');
            }

            window.location.href = data.checkoutUrl;
        } catch (err) {
            loadingCourseId = '';
            render();
            toast(root, err.message || 'No se pudo abrir Stripe.');
        }
    }

    onAuthStateChanged(auth, user => {
        currentUser = user || null;
        loadPurchases(currentUser);
    });

    render();
    loadPurchases(currentUser);

    return root;
}
