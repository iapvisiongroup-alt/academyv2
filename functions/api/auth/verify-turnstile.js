const ALLOWED_HOSTNAMES = new Set(['kreateia.com', 'www.kreateia.com']);
const MAX_ATTEMPTS = 12;
const WINDOW_SECONDS = 10 * 60;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Metodo no permitido.' }, 405);
  }

  if (!env.TURNSTILE_SECRET_KEY) {
    return json({ ok: false, error: 'Proteccion anti-bots no configurada.' }, 503);
  }

  const origin = request.headers.get('Origin') || '';
  if (origin) {
    try {
      if (!ALLOWED_HOSTNAMES.has(new URL(origin).hostname)) {
        return json({ ok: false, error: 'Origen no permitido.' }, 403);
      }
    } catch {
      return json({ ok: false, error: 'Origen no valido.' }, 403);
    }
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return json(
      { ok: false, error: 'Demasiados intentos. Espera unos minutos.' },
      429,
      { 'Retry-After': String(rateLimit.retryAfter) },
    );
  }

  const body = await request.json().catch(() => ({}));
  const token = String(body.token || '').trim();
  if (!token || token.length > 2048) {
    return json({ ok: false, error: 'Completa la comprobacion de seguridad.' }, 400);
  }

  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  if (ip !== 'unknown') form.set('remoteip', ip);
  form.set('idempotency_key', crypto.randomUUID());

  let verification;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    verification = await response.json();
  } catch {
    return json({ ok: false, error: 'No se pudo comprobar la seguridad.' }, 502);
  }

  const hostname = String(verification.hostname || '').toLowerCase();
  const action = String(verification.action || '');
  if (!verification.success || !ALLOWED_HOSTNAMES.has(hostname) || action !== 'auth') {
    return json({ ok: false, error: 'Comprobacion anti-bots rechazada.' }, 403);
  }

  return json({ ok: true });
}

async function checkRateLimit(ip) {
  if (typeof caches === 'undefined' || !caches.default) {
    return { allowed: true, retryAfter: 0 };
  }

  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / WINDOW_SECONDS);
  const expiresAt = (bucket + 1) * WINDOW_SECONDS;
  const key = new Request(`https://kreateia-rate-limit.invalid/auth/${encodeURIComponent(ip)}/${bucket}`);
  const cached = await caches.default.match(key);
  const current = cached ? Number(await cached.text()) || 0 : 0;

  if (current >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.max(1, expiresAt - now) };
  }

  await caches.default.put(key, new Response(String(current + 1), {
    headers: { 'Cache-Control': `max-age=${WINDOW_SECONDS}` },
  }));

  return { allowed: true, retryAfter: 0 };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}
