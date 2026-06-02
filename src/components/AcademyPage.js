import { auth, db, APP_ID } from '../lib/firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { AuthModal } from './AuthModal.js';
import { ACADEMY_COURSES } from '../lib/academyCourses.js';

const BOOKING_TIMES = ['10:00', '12:00', '17:00', '19:00'];

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
        .ac-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:130;background:#fff;color:#111827;border-radius:999px;padding:12px 16px;font-size:13px;font-weight:900;box-shadow:0 20px 60px rgba(0,0,0,.35)}
        .ac-modal{position:fixed;inset:0;z-index:125;background:rgba(0,0,0,.72);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:18px}
        .ac-modal-card{width:min(680px,100%);max-height:86vh;overflow:auto;background:#101010;border:1px solid rgba(255,255,255,.14);border-radius:10px;box-shadow:0 30px 100px rgba(0,0,0,.55)}
        .ac-modal-head{padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
        .ac-modal-head strong{display:block;font-size:20px;line-height:1.15}
        .ac-modal-head span{display:block;color:rgba(255,255,255,.52);font-size:12px;line-height:1.45;margin-top:6px}
        .ac-close{border:0;background:rgba(255,255,255,.08);color:#fff;border-radius:999px;width:34px;height:34px;cursor:pointer;font-size:20px;line-height:1}
        .ac-modal-body{padding:20px;display:grid;gap:16px}
        .ac-field label{display:block;color:rgba(255,255,255,.7);font-size:12px;font-weight:900;margin-bottom:8px}
        .ac-field input{width:100%;background:#050505;border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#fff;padding:13px 14px;font-size:14px;outline:none}
        .ac-time-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
        .ac-time{border:1px solid rgba(255,255,255,.12);background:#050505;color:#fff;border-radius:8px;padding:12px 8px;font-size:13px;font-weight:950;cursor:pointer}
        .ac-time.active{background:#f59e0b;color:#111827;border-color:#f59e0b}
        .ac-booking-list{background:#050505;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:14px;display:grid;gap:8px}
        .ac-booking-item{display:flex;justify-content:space-between;gap:12px;color:rgba(255,255,255,.72);font-size:13px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:8px}
        .ac-booking-item:last-child{border-bottom:0;padding-bottom:0}
        .ac-modal-actions{padding:18px 20px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
        @media(max-width:860px){.ac-flow,.ac-courses{grid-template-columns:1fr}.ac-title{font-size:40px}.ac-shell{padding:22px 14px 70px}.ac-time-grid{grid-template-columns:repeat(2,1fr)}}
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

function todayMadridDate() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());

    const map = {};
    parts.forEach(part => {
        map[part.type] = part.value;
    });

    return `${map.year}-${map.month}-${map.day}`;
}

function formatBookingDate(date, time) {
    if (!date) return '';
    return `${date}${time ? ' · ' + time : ''}`;
}

export function AcademyPage(navigate) {
    addAcademyStyles();

    const root = document.createElement('div');
    root.id = 'academy-root';

    let currentUser = auth.currentUser || null;
    let purchases = {};
    let bookings = {};
    let loadingCourseId = '';
    let bookingCourseId = '';
    let bookingDate = todayMadridDate();
    let bookingTime = BOOKING_TIMES[0];
    let bookingLoading = false;

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
            const courseBookings = bookings[course.id] || [];
            const card = document.createElement('article');
            card.className = 'ac-card';

            const bookingText = courseBookings.length
                ? `${courseBookings.length} clase${courseBookings.length === 1 ? '' : 's'} agendada${courseBookings.length === 1 ? '' : 's'}`
                : 'Después del pago podrás elegir día y hora desde la propia web.';

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
                    <p class="ac-note">${escapeHtml(paid ? bookingText : 'Después del pago podrás elegir día y hora desde la propia web.')}</p>
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
                    openBookingModal(courseId);
                    return;
                }

                startCheckout(courseId);
            });
        });

        if (bookingCourseId) renderBookingModal();
    }

    function renderBookingModal() {
        const course = ACADEMY_COURSES.find(item => item.id === bookingCourseId);
        if (!course) return;

        const courseBookings = bookings[course.id] || [];
        const modal = document.createElement('div');
        modal.className = 'ac-modal';

        modal.innerHTML = `
            <section class="ac-modal-card">
                <div class="ac-modal-head">
                    <div>
                        <strong>Agendar clase</strong>
                        <span>${escapeHtml(course.name)} · Elige un día y una hora disponible. Recibirás confirmación y después añadiremos el enlace de Zoom.</span>
                    </div>
                    <button class="ac-close" type="button" data-close-booking>×</button>
                </div>

                <div class="ac-modal-body">
                    ${courseBookings.length ? `
                        <div>
                            <p class="ac-section-title">Tus clases agendadas</p>
                            <div class="ac-booking-list">
                                ${courseBookings.map(item => `
                                    <div class="ac-booking-item">
                                        <span>Clase ${escapeHtml(item.classNumber)} de ${escapeHtml(item.totalClasses)}</span>
                                        <strong>${escapeHtml(formatBookingDate(item.date, item.time))}</strong>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div class="ac-field">
                        <label>Día de la clase</label>
                        <input id="academy-booking-date" type="date" min="${todayMadridDate()}" value="${escapeHtml(bookingDate)}">
                    </div>

                    <div>
                        <p class="ac-section-title">Hora disponible</p>
                        <div class="ac-time-grid">
                            ${BOOKING_TIMES.map(time => `
                                <button class="ac-time ${time === bookingTime ? 'active' : ''}" type="button" data-booking-time="${escapeHtml(time)}">${escapeHtml(time)}</button>
                            `).join('')}
                        </div>
                    </div>

                    <p class="ac-note">
                        Si un horario aparece disponible pero alguien lo reserva antes, el sistema te avisará y tendrás que elegir otro.
                    </p>
                </div>

                <div class="ac-modal-actions">
                    <button class="ac-btn" type="button" data-confirm-booking ${bookingLoading ? 'disabled' : ''}>
                        ${bookingLoading ? 'Guardando...' : 'Confirmar reserva'}
                    </button>
                </div>
            </section>
        `;

        root.appendChild(modal);

        modal.querySelector('[data-close-booking]').addEventListener('click', () => {
            bookingCourseId = '';
            render();
        });

        modal.querySelector('#academy-booking-date').addEventListener('change', (e) => {
            bookingDate = e.target.value;
        });

        modal.querySelectorAll('[data-booking-time]').forEach(button => {
            button.addEventListener('click', () => {
                bookingTime = button.dataset.bookingTime;
                render();
            });
        });

        modal.querySelector('[data-confirm-booking]').addEventListener('click', confirmBooking);
    }

    function openBookingModal(courseId) {
        bookingCourseId = courseId;
        bookingDate = todayMadridDate();
        bookingTime = BOOKING_TIMES[0];
        render();
    }

    async function loadPurchasesAndBookings(user) {
        purchases = {};
        bookings = {};

        if (!user) {
            render();
            return;
        }

        try {
            const purchasesSnap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'academy_purchases'));
            purchasesSnap.forEach(d => {
                purchases[d.id] = { id: d.id, ...d.data() };
            });

            const bookingsSnap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'academy_bookings'));
            bookingsSnap.forEach(d => {
                const data = { id: d.id, ...d.data() };
                if (!bookings[data.courseId]) bookings[data.courseId] = [];
                bookings[data.courseId].push(data);
            });

            Object.keys(bookings).forEach(courseId => {
                bookings[courseId].sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
            });
        } catch (err) {
            console.warn('[Academy] No se pudieron cargar compras o reservas:', err.message);
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

    async function confirmBooking() {
        if (!auth.currentUser || !bookingCourseId) return;

        bookingLoading = true;
        render();

        try {
            const token = await auth.currentUser.getIdToken();

            const res = await fetch('/api/academy/book-class', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({
                    courseId: bookingCourseId,
                    date: bookingDate,
                    time: bookingTime,
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'No se pudo reservar la clase.');
            }

            bookingCourseId = '';
            bookingLoading = false;
            await loadPurchasesAndBookings(auth.currentUser);
            toast(root, 'Clase agendada correctamente.');
        } catch (err) {
            bookingLoading = false;
            render();
            toast(root, err.message || 'No se pudo reservar la clase.');
        }
    }

    onAuthStateChanged(auth, user => {
        currentUser = user || null;
        loadPurchasesAndBookings(currentUser);
    });

    render();
    loadPurchasesAndBookings(currentUser);

    return root;
}
