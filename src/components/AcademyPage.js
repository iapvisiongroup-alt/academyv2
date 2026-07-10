import { auth, db, APP_ID } from '../lib/firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { AuthModal } from './AuthModal.js';
import { ACADEMY_COURSES } from '../lib/academyCourses.js';

const ANNUAL_COURSE = {
    id: 'ia-anual-online-viernes',
    name: 'Curso Anual IA Online · Grupo Viernes',
    priceLabel: '890€',
    stripePriceId: 'price_1TduMHQ4M7vfTU0L1Kd6zaQO',
    schedule: 'Viernes de 17:00 a 20:00 por Zoom',
    startDate: 'Viernes 11 de septiembre',
    badge: 'Oferta estrella',
};

const LEGACY_ANNUAL_COURSE_ID = 'ia-anual-presencial-viernes';
const ANNUAL_COURSE_IDS = [ANNUAL_COURSE.id, LEGACY_ANNUAL_COURSE_ID];
const ACADEMY_HERO_IMAGE_URL = '/assets/academy/curso-anual-zoom.png';
const GOOGLE_ADS_CONTACT_CONVERSION_ID = 'AW-18195089658/VFp1CNTdqbwcEPqRjORD';
const GOOGLE_ADS_PURCHASE_CONVERSION_ID = 'AW-18195089658/9ps2CPWSsrkcEPqRjORD';
const PURCHASE_TRACKING_STORAGE_PREFIX = 'kreateia_google_ads_purchase_';
const KREATEIA_WHATSAPP_URL = 'https://wa.me/34614403913?text=Hola%20KreateIA%2C%20quiero%20informaci%C3%B3n%20sobre%20los%20cursos%20de%20inteligencia%20artificial.';
const CHANGE_LIMIT_HOURS = 24;

function addAcademyStyles() {
    if (document.querySelector('#academy-page-styles')) return;

    const style = document.createElement('style');
    style.id = 'academy-page-styles';
    style.textContent = `
        #academy-root *{box-sizing:border-box}
        #academy-root{width:100%;height:100%;overflow-y:auto;overflow-x:hidden;background:#050505;color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif}
        .ac-shell{width:min(1180px,100%);margin:0 auto;padding:34px 18px 80px}
        .ac-hero{position:relative;overflow:hidden;min-height:520px;padding:52px 26px 30px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#050505;display:flex;flex-direction:column;justify-content:flex-end}
        .ac-hero-media{position:absolute;inset:0;z-index:0;background:radial-gradient(circle at 22% 22%,rgba(245,158,11,.28),transparent 30%),radial-gradient(circle at 78% 18%,rgba(59,130,246,.2),transparent 30%),linear-gradient(135deg,#050505,#101010 45%,#160f05)}
        .ac-hero-media img{display:block;width:100%;height:100%;object-fit:cover;opacity:.72;filter:saturate(1.08) contrast(1.05)}
        .ac-hero-media:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,5,5,.96),rgba(5,5,5,.74) 42%,rgba(5,5,5,.22)),linear-gradient(180deg,rgba(0,0,0,.14),rgba(0,0,0,.9));pointer-events:none}
        .ac-hero-content{position:relative;z-index:1}
        .ac-kicker{color:#f59e0b;font-size:12px;font-weight:950;text-transform:uppercase;margin:0 0 14px}
        .ac-title{font-size:clamp(38px,6vw,78px);line-height:.96;font-weight:950;letter-spacing:0;margin:0;max-width:920px}
        .ac-copy{color:rgba(255,255,255,.68);font-size:17px;line-height:1.65;max-width:720px;margin:20px 0 0}
        .ac-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:28px}
        .ac-step{background:rgba(16,16,16,.76);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:16px;backdrop-filter:blur(14px)}
        .ac-step strong{display:block;font-size:14px;margin-bottom:6px}
        .ac-step span{display:block;color:rgba(255,255,255,.58);font-size:12px;line-height:1.45}
        .ac-support{margin-top:22px;background:#0d1510;border:1px solid rgba(34,197,94,.22);border-radius:8px;padding:20px}
        .ac-support h2{font-size:24px;margin:0 0 8px}
        .ac-support p{color:rgba(255,255,255,.66);line-height:1.6;margin:0}
        .ac-contact-cta{margin-top:14px;background:linear-gradient(135deg,#0d1510,#101010);border:1px solid rgba(34,197,94,.24);border-radius:8px;padding:20px;display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center}
        .ac-contact-cta h2{font-size:24px;margin:0 0 8px}
        .ac-contact-cta p{color:rgba(255,255,255,.66);line-height:1.6;margin:0;max-width:720px}
        .ac-contact-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}
        .ac-whatsapp-btn{border:0;border-radius:999px;padding:13px 18px;background:#22c55e;color:#06270f;font-size:13px;font-weight:950;cursor:pointer;box-shadow:0 18px 46px rgba(34,197,94,.18);white-space:nowrap}
        .ac-whatsapp-btn:hover{transform:translateY(-1px)}
        .ac-annual{position:relative;overflow:hidden;margin-top:28px;border:1px solid rgba(245,158,11,.35);border-radius:10px;background:linear-gradient(135deg,#171006,#0b0b0b 46%,#08111b);box-shadow:0 28px 90px rgba(245,158,11,.12)}
        .ac-annual:before{content:"";position:absolute;inset:auto -20% -42% 45%;height:280px;background:radial-gradient(circle,rgba(245,158,11,.3),transparent 64%);pointer-events:none}
        .ac-annual-inner{position:relative;z-index:1;display:grid;grid-template-columns:1.1fr .9fr;gap:22px;padding:28px}
        .ac-annual-badge{display:inline-flex;width:max-content;background:#f59e0b;color:#111827;border-radius:999px;padding:7px 12px;font-size:11px;font-weight:950;text-transform:uppercase;margin-bottom:16px}
        .ac-annual h2{font-size:clamp(31px,4vw,54px);line-height:1;margin:0;font-weight:950;letter-spacing:0}
        .ac-annual-copy{color:rgba(255,255,255,.72);font-size:16px;line-height:1.62;margin:18px 0 0;max-width:650px}
        .ac-annual-price{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-top:20px}
        .ac-annual-price strong{font-size:48px;line-height:.9;color:#fff}
        .ac-annual-price span{color:#f59e0b;font-size:13px;font-weight:950;text-transform:uppercase}
        .ac-annual-old-price{color:rgba(255,255,255,.42);font-size:24px;font-weight:950;text-decoration:line-through;text-decoration-thickness:2px;text-decoration-color:#ef4444;line-height:1}
        .ac-annual-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:20px}
        .ac-annual-feature{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:13px}
        .ac-annual-feature strong{display:block;font-size:13px;margin-bottom:5px}
        .ac-annual-feature span{display:block;color:rgba(255,255,255,.62);font-size:12px;line-height:1.45}
        .ac-annual-side{background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;gap:18px}
        .ac-annual-photo{position:relative;overflow:hidden;border-radius:8px;border:1px solid rgba(255,255,255,.12);min-height:230px;background:#050505;margin:0}
        .ac-annual-photo.fallback{background:radial-gradient(circle at 26% 22%,rgba(245,158,11,.28),transparent 30%),radial-gradient(circle at 78% 28%,rgba(59,130,246,.28),transparent 32%),linear-gradient(135deg,#0b1220,#111827 44%,#1f1306)}
        .ac-annual-photo.fallback:before{content:"";position:absolute;left:10%;right:10%;top:18%;height:48%;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.02));box-shadow:0 22px 70px rgba(0,0,0,.38)}
        .ac-annual-photo.fallback .ac-annual-screen{position:absolute;left:16%;right:16%;top:28%;height:24%;border-radius:6px;background:linear-gradient(90deg,rgba(245,158,11,.72),rgba(59,130,246,.72));opacity:.9}
        .ac-annual-photo img{display:block;width:100%;height:100%;min-height:230px;object-fit:cover;filter:saturate(1.08) contrast(1.04)}
        .ac-annual-photo:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 45%,rgba(0,0,0,.72));pointer-events:none}
        .ac-annual-photo-label{position:absolute;left:14px;right:14px;bottom:14px;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:10px}
        .ac-annual-photo-label strong{font-size:13px;line-height:1.2}
        .ac-annual-photo-label span{background:rgba(245,158,11,.92);color:#111827;border-radius:999px;padding:6px 10px;font-size:10px;font-weight:950;text-transform:uppercase;white-space:nowrap}
        .ac-annual-gift{border:1px solid rgba(34,197,94,.28);background:rgba(34,197,94,.08);border-radius:8px;padding:15px}
        .ac-annual-gift strong{display:block;color:#22c55e;font-size:16px;margin-bottom:8px}
        .ac-annual-gift p{margin:0;color:rgba(255,255,255,.68);font-size:13px;line-height:1.5}
        .ac-annual-points{display:grid;gap:8px;margin:0;padding:0;list-style:none}
        .ac-annual-points li{color:rgba(255,255,255,.7);font-size:13px;line-height:1.4;display:flex;gap:8px}
        .ac-annual-points li:before{content:"✓";color:#f59e0b;font-weight:950}
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
        .ac-btn.dark{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.14)}
        .ac-btn.danger{background:rgba(239,68,68,.13);color:#fecaca;border:1px solid rgba(239,68,68,.28)}
        .ac-note{color:rgba(255,255,255,.45);font-size:11px;line-height:1.45;text-align:center;margin:0}
        .ac-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:130;background:#fff;color:#111827;border-radius:999px;padding:12px 16px;font-size:13px;font-weight:900;box-shadow:0 20px 60px rgba(0,0,0,.35)}
        .ac-modal{position:fixed;inset:0;z-index:125;background:rgba(0,0,0,.72);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:18px}
        .ac-modal-card{width:min(760px,100%);max-height:88vh;overflow:auto;background:#101010;border:1px solid rgba(255,255,255,.14);border-radius:10px;box-shadow:0 30px 100px rgba(0,0,0,.55)}
        .ac-modal-head{padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
        .ac-modal-head strong{display:block;font-size:20px;line-height:1.15}
        .ac-modal-head span{display:block;color:rgba(255,255,255,.52);font-size:12px;line-height:1.45;margin-top:6px}
        .ac-close{border:0;background:rgba(255,255,255,.08);color:#fff;border-radius:999px;width:34px;height:34px;cursor:pointer;font-size:20px;line-height:1}
        .ac-modal-body{padding:20px;display:grid;gap:18px}
        .ac-manage-banner{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;background:linear-gradient(135deg,rgba(245,158,11,.14),rgba(34,197,94,.1));border:1px solid rgba(245,158,11,.24);border-radius:8px;padding:14px}
        .ac-manage-banner strong{display:block;font-size:15px;margin-bottom:4px}
        .ac-manage-banner span{display:block;color:rgba(255,255,255,.62);font-size:12px;line-height:1.45}
        .ac-pill{display:inline-flex;align-items:center;justify-content:center;width:max-content;border-radius:999px;padding:6px 10px;background:rgba(34,197,94,.14);color:#4ade80;font-size:10px;font-weight:950;text-transform:uppercase;white-space:nowrap}
        .ac-pill.warn{background:rgba(245,158,11,.14);color:#fbbf24}
        .ac-pill.danger{background:rgba(239,68,68,.14);color:#fca5a5}
        .ac-booking-list{background:#050505;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:10px;display:grid;gap:10px}
        .ac-booking-item{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;color:rgba(255,255,255,.72);font-size:13px;background:#0d0d0d;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:13px}
        .ac-booking-item.active{border-color:rgba(245,158,11,.62);background:rgba(245,158,11,.08)}
        .ac-booking-main{display:grid;gap:7px;min-width:0}
        .ac-booking-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .ac-booking-title strong{font-size:14px;color:#fff}
        .ac-booking-date{font-size:18px;font-weight:950;color:#fff;line-height:1.15}
        .ac-booking-muted{color:rgba(255,255,255,.52);font-size:12px;line-height:1.45;margin:0}
        .ac-booking-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
        .ac-booking-actions .ac-btn{padding:10px 12px;font-size:12px}
        .ac-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
        .ac-day{min-height:84px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:#050505;color:#fff;padding:10px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;position:relative;text-align:left}
        .ac-day:hover{border-color:rgba(245,158,11,.6)}
        .ac-day.active{border-color:#f59e0b;background:rgba(245,158,11,.12)}
        .ac-day.unavailable{opacity:.45;cursor:not-allowed;background:#090909}
        .ac-day-week{font-size:11px;font-weight:950;color:rgba(255,255,255,.48);text-transform:uppercase}
        .ac-day-number{font-size:22px;font-weight:950;color:#fff;line-height:1}
        .ac-day-month{font-size:11px;color:rgba(255,255,255,.44);font-weight:800}
        .ac-day-status{font-size:10px;font-weight:950;border-radius:999px;padding:4px 7px;background:rgba(34,197,94,.14);color:#22c55e}
        .ac-day.unavailable .ac-day-status{background:rgba(239,68,68,.12);color:#ef4444}
        .ac-day-x{position:absolute;right:8px;top:8px;color:#ef4444;font-size:16px;font-weight:950}
        .ac-times{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
        .ac-time{border:1px solid rgba(255,255,255,.12);background:#050505;color:#fff;border-radius:8px;padding:12px 8px;font-size:13px;font-weight:950;cursor:pointer;display:grid;gap:4px;text-align:center}
        .ac-time small{color:rgba(255,255,255,.45);font-size:10px;font-weight:900;text-transform:uppercase}
        .ac-time.active{background:#f59e0b;color:#111827;border-color:#f59e0b}
        .ac-time.active small{color:rgba(17,24,39,.72)}
        .ac-time:disabled{opacity:.35;cursor:not-allowed}
        .ac-empty{border:1px dashed rgba(255,255,255,.14);border-radius:8px;padding:16px;color:rgba(255,255,255,.55);font-size:13px;text-align:center}
        .ac-modal-actions{padding:18px 20px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
        @media(max-width:860px){.ac-flow,.ac-courses,.ac-annual-inner,.ac-manage-banner,.ac-booking-item,.ac-contact-cta{grid-template-columns:1fr}.ac-title{font-size:40px}.ac-shell{padding:22px 14px 70px}.ac-calendar{grid-template-columns:repeat(2,1fr)}.ac-times{grid-template-columns:repeat(2,1fr)}.ac-annual-inner{padding:20px}.ac-annual-grid{grid-template-columns:1fr}.ac-annual-price strong{font-size:42px}.ac-booking-actions,.ac-contact-actions{justify-content:flex-start}}
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

function formatBookingDate(date, time) {
    if (!date) return '';
    return `${date}${time ? ' · ' + time : ''}`;
}

function formatFriendlyBookingDate(dateText, timeText) {
    if (!dateText) return '';

    try {
        const [year, month, day] = String(dateText).split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const label = new Intl.DateTimeFormat('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        }).format(date);

        return `${label}${timeText ? ' · ' + timeText : ''}`;
    } catch {
        return formatBookingDate(dateText, timeText);
    }
}

function firstAvailableDay(days) {
    return days.find(day => day.available) || days[0] || null;
}

function firstAvailableTime(day) {
    return (day?.slots || []).find(slot => slot.available)?.time || '';
}

function activeBookingStatus(status) {
    const value = String(status || 'booked').toLowerCase();
    return !['cancelled', 'canceled', 'released', 'deleted'].includes(value);
}

function getCourseTotalClasses(course) {
    return Math.max(1, Number(course?.totalClasses || course?.classes || course?.lessons?.length || 1));
}

function bookingStartMs(booking) {
    const [year, month, day] = String(booking?.date || '').split('-').map(Number);
    const [hour, minute] = String(booking?.time || '').split(':').map(Number);

    if (!year || !month || !day || Number.isNaN(hour)) return 0;

    return new Date(year, month - 1, day, hour || 0, minute || 0, 0).getTime();
}

function canStudentChangeBooking(booking) {
    const start = bookingStartMs(booking);
    return start > 0 && start - Date.now() >= CHANGE_LIMIT_HOURS * 60 * 60 * 1000;
}

function sortBookingsByDate(a, b) {
    return String(`${a.date || ''} ${a.time || ''}`).localeCompare(String(`${b.date || ''} ${b.time || ''}`));
}

function nextAvailableClassNumber(courseBookings, totalClasses) {
    const used = new Set(
        courseBookings
            .map(item => Number(item.classNumber || 0))
            .filter(value => value > 0)
    );

    for (let i = 1; i <= totalClasses; i++) {
        if (!used.has(i)) return i;
    }

    return totalClasses;
}

function handleAcademyImageError(img) {
    const urls = [
        '/assets/academy/curso-anual-zoom.png',
        'https://raw.githubusercontent.com/iapvisiongroup-alt/academyv2/main/public/assets/academy/curso-anual-zoom.png',
        './assets/academy/curso-anual-zoom.png',
        '/public/assets/academy/curso-anual-zoom.png',
        './public/assets/academy/curso-anual-zoom.png',
    ];

    const nextIndex = Number(img.dataset.fallbackIndex || 0) + 1;
    img.dataset.fallbackIndex = String(nextIndex);

    if (urls[nextIndex]) {
        img.src = urls[nextIndex];
        return;
    }

    img.remove();
    const photo = img.closest('.ac-annual-photo');
    if (photo) photo.classList.add('fallback');

    const hero = img.closest('.ac-hero-media');
    if (hero) hero.classList.add('fallback');
}

function openWhatsAppWithGoogleAdsConversion() {
    const goToWhatsApp = () => {
        window.location.href = KREATEIA_WHATSAPP_URL;
    };

    if (typeof window.gtag !== 'function') {
        goToWhatsApp();
        return;
    }

    let navigated = false;
    const navigateOnce = () => {
        if (navigated) return;
        navigated = true;
        goToWhatsApp();
    };

    window.gtag('event', 'conversion', {
        send_to: GOOGLE_ADS_CONTACT_CONVERSION_ID,
        value: 1.0,
        currency: 'EUR',
        event_callback: navigateOnce,
        event_timeout: 1500,
    });

    setTimeout(navigateOnce, 1200);
}

function getAcademyCourseValue(courseId) {
    if (ANNUAL_COURSE_IDS.includes(courseId)) return 890;

    const course = ACADEMY_COURSES.find(item => item.id === courseId);
    const amount = Number(course?.amount || 0);

    return amount > 0 ? amount / 100 : 1;
}

function trackAcademyPurchaseFromStripeReturn() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('academy_payment') !== 'success') return;

    const sessionId = String(params.get('session_id') || '').trim();
    const courseId = String(params.get('courseId') || '').trim();

    if (!sessionId || !courseId || typeof window.gtag !== 'function') return;

    const storageKey = PURCHASE_TRACKING_STORAGE_PREFIX + sessionId;

    try {
        if (window.localStorage.getItem(storageKey) === 'sent') return;
    } catch {
        // La medicion puede continuar aunque el navegador bloquee localStorage.
    }

    window.gtag('event', 'conversion', {
        send_to: GOOGLE_ADS_PURCHASE_CONVERSION_ID,
        value: getAcademyCourseValue(courseId),
        currency: 'EUR',
        transaction_id: sessionId,
    });

    try {
        window.localStorage.setItem(storageKey, 'sent');
    } catch {
        // El transaction_id tambien protege frente a conversiones duplicadas.
    }
}

export function AcademyPage(navigate) {
    addAcademyStyles();
    trackAcademyPurchaseFromStripeReturn();

    const root = document.createElement('div');
    root.id = 'academy-root';

    let currentUser = auth.currentUser || null;
    let purchases = {};
    let bookings = {};
    let loadingCourseId = '';
    let bookingCourseId = '';
    let bookingDate = '';
    let bookingTime = '';
    let bookingAction = 'book';
    let activeBookingId = '';
    let activeBooking = null;
    let bookingLoading = false;
    let availabilityLoading = false;
    let availabilityDays = [];
    let groupStatus = { loaded: false, soldOut: false };

    function isPaidCourse(courseId) {
        const ids = courseId === ANNUAL_COURSE.id ? ANNUAL_COURSE_IDS : [courseId];

        return ids.some(id => {
            const status = String(purchases[id]?.status || '').toLowerCase();
            return ['paid', 'active', 'enrolled', 'completed', 'paid_manual_review'].includes(status);
        });
    }

    function getCourseBookings(courseId) {
        return (bookings[courseId] || [])
            .filter(item => activeBookingStatus(item.status))
            .sort(sortBookingsByDate);
    }

    function ownsCourse(courseId) {
        return isPaidCourse(courseId) || getCourseBookings(courseId).length > 0;
    }

    function courseActionText(course, owned, courseBookings) {
        if (!owned) {
            return loadingCourseId === course.id ? 'Abriendo pago...' : 'Comprar ' + course.name;
        }

        return courseBookings.length ? 'Gestionar clases' : 'Pagado · Agendar clase';
    }

    function courseBookingSummary(course, owned, courseBookings) {
        if (!owned) return 'Después del pago podrás elegir día y hora desde la propia web.';

        const totalClasses = getCourseTotalClasses(course);

        if (!courseBookings.length) {
            return 'Curso pagado. Entra para elegir tu primera fecha disponible.';
        }

        const nextBooking = courseBookings.find(item => bookingStartMs(item) >= Date.now()) || courseBookings[0];
        const countText = `${courseBookings.length} de ${totalClasses} clase${totalClasses === 1 ? '' : 's'} agendada${courseBookings.length === 1 ? '' : 's'}`;

        return `Próxima clase: ${formatFriendlyBookingDate(nextBooking.date, nextBooking.time)}. ${countText}.`;
    }

    function resetBookingAction() {
        bookingAction = 'book';
        activeBookingId = '';
        activeBooking = null;
    }

    function annualButtonText() {
        if (isPaidCourse(ANNUAL_COURSE.id)) return 'Plaza reservada · Zoom viernes';
        if (loadingCourseId === ANNUAL_COURSE.id) return 'Abriendo pago...';
        if (groupStatus.soldOut) return 'Grupo completo';
        return 'Reservar plaza anual';
    }

    function renderAnnualCourse(shell) {
        const paid = isPaidCourse(ANNUAL_COURSE.id);
        const disabled = (!paid && groupStatus.soldOut) || loadingCourseId === ANNUAL_COURSE.id;
        const annual = document.createElement('section');
        annual.className = 'ac-annual';

        annual.innerHTML = `
            <div class="ac-annual-inner">
                <div>
                    <span class="ac-annual-badge">Promoción de lanzamiento</span>
                    <h2>Curso Anual IA Online por Zoom con portátil de regalo</h2>
                    <p class="ac-annual-copy">
                        Un año completo aprendiendo inteligencia artificial de forma práctica, con clases online en directo y seguimiento cercano.
                        Ideal para alumnos, adultos, autónomos y personas que quieren dominar herramientas de IA sin perderse.
                    </p>

                    <div class="ac-annual-price">
                        <em class="ac-annual-old-price">1.400€</em>
                        <strong>890€</strong>
                        <span>Pago único · grupo online por Zoom</span>
                    </div>

                    <div class="ac-annual-grid">
                        <div class="ac-annual-feature"><strong>Horario fijo</strong><span>Viernes de 17:00 a 20:00 por Zoom. No tienes que elegir agenda.</span></div>
                        <div class="ac-annual-feature"><strong>Inicio del grupo</strong><span>Viernes 11 de septiembre de 2026. Plaza reservada al completar el pago hasta el último viernes de junio.</span></div>
                        <div class="ac-annual-feature"><strong>Acompañamiento real</strong><span>Podrás preguntar en clase, practicar y recibir orientación clara cada semana.</span></div>
                        <div class="ac-annual-feature"><strong>Enfoque práctico</strong><span>Contenido, imagen, vídeo, automatizaciones, asistentes y proyectos reales.</span></div>
                    </div>
                </div>

                <aside class="ac-annual-side">
                    <figure class="ac-annual-photo">
                        <span class="ac-annual-screen" aria-hidden="true"></span>
                        <img src="/assets/academy/curso-anual-zoom.png" data-academy-annual-image data-fallback-index="0" alt="Curso anual online de inteligencia artificial por Zoom" loading="lazy" decoding="async">
                        <figcaption class="ac-annual-photo-label">
                            <strong>Clases online en directo desde casa</strong>
                            <span>Zoom</span>
                        </figcaption>
                    </figure>

                    <div class="ac-annual-gift">
                        <strong>Portátil de regalo promocional</strong>
                        <p>
                            Promoción para las primeras matrículas. Es un regalo sin coste adicional para apoyar el aprendizaje.
                            Modelo sujeto a disponibilidad.
                        </p>
                    </div>

                    <ul class="ac-annual-points">
                        <li>Acceso a KreateIA Studio durante el curso</li>
                        <li>Soporte por WhatsApp para dudas</li>
                        <li>Proyectos reales para redes, negocio y productividad</li>
                        <li>Certificado KreateIA al finalizar el programa</li>
                    </ul>

                    <div>
                        <button class="ac-btn ${paid ? 'paid' : ''}" type="button" data-annual-course-action ${disabled ? 'disabled' : ''}>
                            ${escapeHtml(annualButtonText())}
                        </button>
                        <p class="ac-note" style="margin-top:10px">
                            ${paid
                                ? 'Tu plaza está reservada en el grupo online de viernes de 17:00 a 20:00 por Zoom.'
                                : groupStatus.soldOut
                                    ? 'Este grupo ya no acepta nuevas matrículas online.'
                                    : 'Al comprar, quedas inscrito en el grupo anual online. No hace falta agendar clase.'}
                        </p>
                    </div>
                </aside>
            </div>
        `;

        const annualImage = annual.querySelector('[data-academy-annual-image]');
        if (annualImage) {
            annualImage.addEventListener('error', () => handleAcademyImageError(annualImage));
        }

        shell.appendChild(annual);

        annual.querySelector('[data-annual-course-action]').addEventListener('click', () => {
            if (paid) {
                toast(root, 'Tu plaza ya está reservada en el grupo de viernes.');
                return;
            }

            if (groupStatus.soldOut) {
                toast(root, 'Este grupo ya está completo.');
                return;
            }

            startCheckout(ANNUAL_COURSE.id);
        });
    }

    function render() {
        root.innerHTML = '';

        const shell = document.createElement('div');
        shell.className = 'ac-shell';

        shell.innerHTML = `
            <section class="ac-hero">
                <div class="ac-hero-media" aria-hidden="true">
                    <img src="${ACADEMY_HERO_IMAGE_URL}" alt="" loading="eager" data-academy-hero-image>
                </div>

                <div class="ac-hero-content">
                    <p class="ac-kicker">Academia IA KreateIA</p>
                    <h1 class="ac-title">Cursos de inteligencia artificial, explicados paso a paso.</h1>
                    <p class="ac-copy">
                        Aprende IA sin tecnicismos raros. Puedes elegir formación online 1 a 1 o un curso anual online por Zoom en grupo.
                        En ambos casos tendrás acceso a KreateIA Studio y acompañamiento para aplicar lo aprendido.
                    </p>
                    <div class="ac-flow">
                        <div class="ac-step"><strong>1. Elige curso</strong><span>Escoge una formación 1 a 1 o el grupo anual online por Zoom.</span></div>
                        <div class="ac-step"><strong>2. Paga seguro</strong><span>El pago se realiza con Stripe. Al volver, tu curso aparecerá como pagado.</span></div>
                        <div class="ac-step"><strong>3. Agenda o reserva plaza</strong><span>Los cursos 1 a 1 tienen agenda. El curso anual tiene horario fijo.</span></div>
                        <div class="ac-step"><strong>4. Aprende con soporte</strong><span>Después de clase puedes resolver dudas por WhatsApp según el curso contratado.</span></div>
                    </div>
                </div>
            </section>

            <section class="ac-support">
                <h2>No te dejamos solo después de clase</h2>
                <p>
                    Todos los cursos incluyen acompañamiento por WhatsApp. Podrás preguntar dudas, revisar prompts, pedir orientación y desbloquearte mientras aplicas la IA en tu trabajo, contenido o negocio.
                </p>
            </section>

            <section class="ac-contact-cta">
                <div>
                    <h2>¿No sabes qué curso elegir?</h2>
                    <p>
                        Escríbenos por WhatsApp y te orientamos rápido según tu nivel, tu objetivo y si prefieres formación 1 a 1 o grupo anual online.
                    </p>
                </div>
                <div class="ac-contact-actions">
                    <button class="ac-whatsapp-btn" type="button" data-whatsapp-contact>Hablar por WhatsApp</button>
                </div>
            </section>
        `;

        const heroImage = shell.querySelector('[data-academy-hero-image]');
        if (heroImage) {
            heroImage.addEventListener('error', () => handleAcademyImageError(heroImage));
        }

        renderAnnualCourse(shell);

        const grid = document.createElement('section');
        grid.className = 'ac-courses';

        ACADEMY_COURSES
            .filter(course => !ANNUAL_COURSE_IDS.includes(course.id))
            .forEach(course => {
                const courseBookings = getCourseBookings(course.id);
                const owned = ownsCourse(course.id);
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
                        <button class="ac-btn ${owned ? 'paid' : ''}" data-course-action="${escapeHtml(course.id)}" ${loadingCourseId === course.id ? 'disabled' : ''}>
                            ${escapeHtml(courseActionText(course, owned, courseBookings))}
                        </button>
                        <p class="ac-note">${escapeHtml(courseBookingSummary(course, owned, courseBookings))}</p>
                    </div>
                `;

                grid.appendChild(card);
            });

        shell.appendChild(grid);
        root.appendChild(shell);

        root.querySelectorAll('[data-course-action]').forEach(button => {
            button.addEventListener('click', () => {
                const courseId = button.dataset.courseAction;

                if (ownsCourse(courseId)) {
                    openBookingModal(courseId);
                    return;
                }

                startCheckout(courseId);
            });
        });

        root.querySelectorAll('[data-whatsapp-contact]').forEach(button => {
            button.addEventListener('click', openWhatsAppWithGoogleAdsConversion);
        });

        if (bookingCourseId) renderBookingModal();
    }

    function renderBookingModal() {
        const course = ACADEMY_COURSES.find(item => item.id === bookingCourseId);
        if (!course) return;

        const courseBookings = getCourseBookings(course.id);
        const totalClasses = getCourseTotalClasses(course);
        const allClassesBooked = courseBookings.length >= totalClasses;
        const isRescheduling = bookingAction === 'reschedule' && activeBooking;
        const selectedDay = availabilityDays.find(day => day.date === bookingDate) || firstAvailableDay(availabilityDays);
        const selectedSlots = selectedDay?.slots || [];
        const showPicker = isRescheduling || !allClassesBooked;
        const modalTitle = isRescheduling ? 'Cambiar clase' : 'Gestionar clases';
        const modalSubtitle = isRescheduling
            ? `Estás cambiando la clase ${activeBooking.classNumber || ''}. Elige un nuevo hueco disponible.`
            : `${course.name} · Puedes agendar, cambiar o cancelar tus clases hasta ${CHANGE_LIMIT_HOURS}h antes.`;

        const modal = document.createElement('div');
        modal.className = 'ac-modal';

        modal.innerHTML = `
            <section class="ac-modal-card">
                <div class="ac-modal-head">
                    <div>
                        <strong>${escapeHtml(modalTitle)}</strong>
                        <span>${escapeHtml(modalSubtitle)}</span>
                    </div>
                    <button class="ac-close" type="button" data-close-booking>×</button>
                </div>

                <div class="ac-modal-body">
                    <div class="ac-manage-banner">
                        <div>
                            <strong>${escapeHtml(courseBookings.length ? 'Tus clases están bajo control' : 'Curso pagado, agenda tu clase')}</strong>
                            <span>${escapeHtml(courseBookings.length ? `${courseBookings.length} de ${totalClasses} clase${totalClasses === 1 ? '' : 's'} agendada${courseBookings.length === 1 ? '' : 's'}.` : 'Elige un día y una hora libre para reservar tu primera sesión.')}</span>
                        </div>
                        <span class="ac-pill">${escapeHtml(allClassesBooked ? 'Completo' : 'Pendiente de agendar')}</span>
                    </div>

                    ${courseBookings.length ? `
                        <div>
                            <p class="ac-section-title">Tus clases agendadas</p>
                            <div class="ac-booking-list">
                                ${courseBookings.map(item => {
                                    const canChange = canStudentChangeBooking(item);
                                    const bookingId = item.id || item.bookingId || '';
                                    const selected = activeBookingId && activeBookingId === bookingId;

                                    return `
                                    <div class="ac-booking-item ${selected ? 'active' : ''}">
                                        <div class="ac-booking-main">
                                            <div class="ac-booking-title">
                                                <strong>Clase ${escapeHtml(item.classNumber || 1)} de ${escapeHtml(item.totalClasses || totalClasses)}</strong>
                                                <span class="ac-pill ${canChange ? '' : 'warn'}">${escapeHtml(canChange ? 'Gestionable' : 'Cambios cerrados')}</span>
                                            </div>
                                            <div class="ac-booking-date">${escapeHtml(formatFriendlyBookingDate(item.date, item.time))}</div>
                                            <p class="ac-booking-muted">
                                                ${escapeHtml(canChange ? `Puedes cambiar o cancelar hasta ${CHANGE_LIMIT_HOURS}h antes.` : `Ya está dentro de las ${CHANGE_LIMIT_HOURS}h previas y queda bloqueada.`)}
                                            </p>
                                        </div>
                                        <div class="ac-booking-actions">
                                            ${canChange ? `
                                                <button class="ac-btn dark" type="button" data-reschedule-booking="${escapeHtml(bookingId)}">Cambiar fecha</button>
                                                <button class="ac-btn danger" type="button" data-cancel-booking="${escapeHtml(bookingId)}">Cancelar</button>
                                            ` : `
                                                <span class="ac-pill warn">Sin cambios</span>
                                            `}
                                        </div>
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : `
                        <div class="ac-empty">Todavía no tienes clases agendadas para este curso.</div>
                    `}

                    ${showPicker ? `
                    <div>
                        <p class="ac-section-title">Días disponibles</p>
                        ${availabilityLoading ? `
                            <div class="ac-empty">Cargando disponibilidad...</div>
                        ` : `
                            <div class="ac-calendar">
                                ${availabilityDays.map(day => `
                                    <button class="ac-day ${day.available ? '' : 'unavailable'} ${day.date === bookingDate ? 'active' : ''}" type="button" data-booking-day="${escapeHtml(day.date)}" ${day.available ? '' : 'disabled'}>
                                        ${day.available ? '' : '<span class="ac-day-x">×</span>'}
                                        <span class="ac-day-week">${escapeHtml(day.weekdayLabel)}</span>
                                        <span class="ac-day-number">${escapeHtml(day.dayNumber)}</span>
                                        <span class="ac-day-month">${escapeHtml(day.monthLabel)}</span>
                                        <span class="ac-day-status">${escapeHtml(day.available ? 'Disponible' : day.unavailableReason || 'No disponible')}</span>
                                    </button>
                                `).join('')}
                            </div>
                        `}
                    </div>

                    <div>
                        <p class="ac-section-title">Horas libres ${selectedDay ? 'para ' + escapeHtml(formatFriendlyBookingDate(selectedDay.date, '')) : ''}</p>
                        ${selectedSlots.length ? `
                            <div class="ac-times">
                                ${selectedSlots.map(slot => `
                                    <button class="ac-time ${slot.time === bookingTime ? 'active' : ''}" type="button" data-booking-time="${escapeHtml(slot.time)}" ${slot.available ? '' : 'disabled'}>
                                        <span>${escapeHtml(slot.time)}</span>
                                        <small>${escapeHtml(slot.available ? 'Libre' : 'Ocupado')}</small>
                                    </button>
                                `).join('')}
                            </div>
                        ` : `
                            <div class="ac-empty">Selecciona un día disponible para ver horas.</div>
                        `}
                    </div>
                    ` : `
                        <div class="ac-empty">Ya tienes todas las clases de este curso agendadas. Puedes cambiar o cancelar una fecha desde la lista superior mientras falten más de ${CHANGE_LIMIT_HOURS}h.</div>
                    `}

                    <p class="ac-note">
                        Si otro alumno reserva el mismo hueco justo antes, el sistema te avisará para elegir otro horario.
                    </p>
                </div>

                <div class="ac-modal-actions">
                    ${isRescheduling ? `<button class="ac-btn dark" type="button" data-reset-booking-action>Cancelar cambio</button>` : ''}
                    ${showPicker ? `
                        <button class="ac-btn" type="button" data-confirm-booking ${bookingLoading || !bookingDate || !bookingTime || (!isRescheduling && allClassesBooked) ? 'disabled' : ''}>
                            ${escapeHtml(bookingLoading ? 'Guardando...' : isRescheduling ? 'Confirmar cambio' : 'Confirmar reserva')}
                        </button>
                    ` : ''}
                </div>
            </section>
        `;

        root.appendChild(modal);

        modal.querySelector('[data-close-booking]').addEventListener('click', () => {
            bookingCourseId = '';
            resetBookingAction();
            render();
        });

        const resetActionBtn = modal.querySelector('[data-reset-booking-action]');
        if (resetActionBtn) {
            resetActionBtn.addEventListener('click', () => {
                resetBookingAction();
                bookingDate = '';
                bookingTime = '';
                const firstDay = firstAvailableDay(availabilityDays);
                if (firstDay?.available) {
                    bookingDate = firstDay.date;
                    bookingTime = firstAvailableTime(firstDay);
                }
                render();
            });
        }

        modal.querySelectorAll('[data-booking-day]').forEach(button => {
            button.addEventListener('click', () => {
                const day = availabilityDays.find(item => item.date === button.dataset.bookingDay);
                if (!day || !day.available) return;

                bookingDate = day.date;
                bookingTime = firstAvailableTime(day);
                render();
            });
        });

        modal.querySelectorAll('[data-booking-time]').forEach(button => {
            button.addEventListener('click', () => {
                bookingTime = button.dataset.bookingTime;
                render();
            });
        });

        modal.querySelectorAll('[data-reschedule-booking]').forEach(button => {
            button.addEventListener('click', () => startRescheduleBooking(button.dataset.rescheduleBooking));
        });

        modal.querySelectorAll('[data-cancel-booking]').forEach(button => {
            button.addEventListener('click', () => cancelBooking(button.dataset.cancelBooking));
        });

        const confirmBtn = modal.querySelector('[data-confirm-booking]');
        if (confirmBtn) confirmBtn.addEventListener('click', confirmBooking);
    }

    async function openBookingModal(courseId) {
        bookingCourseId = courseId;
        bookingDate = '';
        bookingTime = '';
        resetBookingAction();
        availabilityDays = [];
        availabilityLoading = true;
        render();

        try {
            await loadAvailability();
            const firstDay = firstAvailableDay(availabilityDays);

            if (firstDay?.available) {
                bookingDate = firstDay.date;
                bookingTime = firstAvailableTime(firstDay);
            }
        } catch (err) {
            toast(root, err.message || 'No se pudo cargar la disponibilidad.');
        } finally {
            availabilityLoading = false;
            render();
        }
    }

    async function loadAvailability() {
        if (!auth.currentUser) throw new Error('Debes iniciar sesión.');

        const token = await auth.currentUser.getIdToken();

        const res = await fetch(`${window.location.origin}/api/academy/availability`, {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token,
            },
            body: JSON.stringify({ days: 42 }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.ok) {
            throw new Error(data.error || 'No se pudo consultar disponibilidad.');
        }

        availabilityDays = Array.isArray(data.days) ? data.days : [];
    }

    async function loadGroupStatus() {
        try {
            const res = await fetch('/api/academy/group-status', { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));

            if (res.ok && data.ok) {
                groupStatus = {
                    loaded: true,
                    soldOut: data.soldOut === true,
                };
                render();
            }
        } catch (err) {
            console.warn('[Academy] No se pudo cargar estado de grupo:', err.message);
        }
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
                const purchase = { id: d.id, ...d.data() };
                purchases[d.id] = purchase;

                if (d.id === LEGACY_ANNUAL_COURSE_ID) {
                    purchases[ANNUAL_COURSE.id] = purchase;
                }
            });

            const bookingsSnap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid, 'academy_bookings'));
            bookingsSnap.forEach(d => {
                const data = { id: d.id, ...d.data() };
                if (!activeBookingStatus(data.status)) return;

                const bookingCourseId = data.courseId === LEGACY_ANNUAL_COURSE_ID ? ANNUAL_COURSE.id : data.courseId;

                if (!bookings[bookingCourseId]) bookings[bookingCourseId] = [];
                bookings[bookingCourseId].push({ ...data, courseId: bookingCourseId });
            });

            Object.keys(bookings).forEach(courseId => {
                bookings[courseId].sort((a, b) => String(a.startAt || a.date || '').localeCompare(String(b.startAt || b.date || '')));
            });
        } catch (err) {
            console.warn('[Academy] No se pudieron cargar compras o reservas:', err.message);
        }

        render();
    }

    async function requestCheckoutSession(courseId, token) {
        const res = await fetch('/api/academy/create-checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token,
            },
            body: JSON.stringify({ courseId }),
        });

        const data = await res.json().catch(() => ({}));

        return { res, data };
    }

    function isInvalidCourseResponse(res, data) {
        return res.status === 400 && String(data.error || '').toLowerCase().includes('curso no');
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
            let { res, data } = await requestCheckoutSession(courseId, token);

            if (
                courseId === ANNUAL_COURSE.id
                && isInvalidCourseResponse(res, data)
            ) {
                ({ res, data } = await requestCheckoutSession(LEGACY_ANNUAL_COURSE_ID, token));
            }

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

    async function startRescheduleBooking(bookingId) {
        if (!auth.currentUser) {
            document.body.appendChild(AuthModal());
            return;
        }

        const booking = getCourseBookings(bookingCourseId).find(item => {
            return (item.id || item.bookingId || '') === bookingId;
        });

        if (!booking) {
            toast(root, 'No se encontró esa reserva.');
            return;
        }

        if (!canStudentChangeBooking(booking)) {
            toast(root, `Solo puedes cambiar una clase hasta ${CHANGE_LIMIT_HOURS}h antes.`);
            return;
        }

        bookingAction = 'reschedule';
        activeBookingId = bookingId;
        activeBooking = booking;
        bookingDate = '';
        bookingTime = '';
        availabilityLoading = true;
        render();

        try {
            await loadAvailability();
            const firstDay = firstAvailableDay(availabilityDays);

            if (firstDay?.available) {
                bookingDate = firstDay.date;
                bookingTime = firstAvailableTime(firstDay);
            }
        } catch (err) {
            toast(root, err.message || 'No se pudo cargar la disponibilidad.');
        } finally {
            availabilityLoading = false;
            render();
        }
    }

    async function cancelBooking(bookingId) {
        if (!auth.currentUser) {
            document.body.appendChild(AuthModal());
            return;
        }

        const booking = getCourseBookings(bookingCourseId).find(item => {
            return (item.id || item.bookingId || '') === bookingId;
        });

        if (!booking) {
            toast(root, 'No se encontró esa reserva.');
            return;
        }

        if (!canStudentChangeBooking(booking)) {
            toast(root, `Solo puedes cancelar una clase hasta ${CHANGE_LIMIT_HOURS}h antes.`);
            return;
        }

        const ok = confirm('¿Cancelar esta clase? La hora quedará libre para poder elegir otra.');
        if (!ok) return;

        bookingLoading = true;
        render();

        try {
            const token = await auth.currentUser.getIdToken();

            const res = await fetch(`${window.location.origin}/api/academy/manage-booking`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({
                    action: 'cancel',
                    bookingId,
                    reason: 'Cancelada por el alumno desde la web',
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'No se pudo cancelar la clase.');
            }

            resetBookingAction();
            bookingLoading = false;
            await loadPurchasesAndBookings(auth.currentUser);
            await loadAvailability().catch(() => {});
            render();
            toast(root, 'Clase cancelada. La hora queda liberada.');
        } catch (err) {
            bookingLoading = false;
            render();
            toast(root, err.message || 'No se pudo cancelar la clase.');
        }
    }

    async function confirmBooking() {
        if (!auth.currentUser) {
            document.body.appendChild(AuthModal());
            return;
        }

        if (!bookingCourseId) return;

        bookingLoading = true;
        render();

        try {
            const token = await auth.currentUser.getIdToken();
            const course = ACADEMY_COURSES.find(item => item.id === bookingCourseId);
            const courseBookings = getCourseBookings(bookingCourseId);
            const totalClasses = getCourseTotalClasses(course);
            const isRescheduling = bookingAction === 'reschedule' && activeBookingId;

            if (!isRescheduling && courseBookings.length >= totalClasses) {
                throw new Error('Ya tienes todas las clases de este curso agendadas.');
            }

            const classNumber = nextAvailableClassNumber(courseBookings, totalClasses);
            const route = isRescheduling ? 'manage-booking' : 'book-class';
            const payload = isRescheduling
                ? {
                    action: 'reschedule',
                    bookingId: activeBookingId,
                    newDate: bookingDate,
                    newTime: bookingTime,
                }
                : {
                    courseId: bookingCourseId,
                    date: bookingDate,
                    time: bookingTime,
                    classNumber,
                };

            const res = await fetch(`${window.location.origin}/api/academy/${route}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.ok) {
                throw new Error(data.error || (isRescheduling ? 'No se pudo cambiar la clase.' : 'No se pudo reservar la clase.'));
            }

            resetBookingAction();
            bookingLoading = false;
            await loadPurchasesAndBookings(auth.currentUser);
            await loadAvailability().catch(() => {});
            render();
            toast(root, isRescheduling ? 'Clase cambiada correctamente.' : 'Clase agendada correctamente.');
        } catch (err) {
            bookingLoading = false;
            render();
            toast(root, err.message || 'No se pudo guardar la clase.');
        }
    }

    onAuthStateChanged(auth, user => {
        currentUser = user || null;
        loadPurchasesAndBookings(currentUser);
        loadGroupStatus();
    });

    render();
    loadPurchasesAndBookings(currentUser);
    loadGroupStatus();

    return root;
}
