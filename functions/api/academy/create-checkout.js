const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const APP_ID = 'appiapvision';
const ANNUAL_GROUP_ID = 'ia-anual-viernes-2026';
const ANNUAL_CAPACITY = 12;

const COURSES = {
  'diagnostico-ia': {
    id: 'diagnostico-ia',
    name: 'Diagnóstico IA 1 a 1',
    stripePriceId: 'price_1TdohxQ4M7vfTU0LkPEDbA01',
    mode: 'one_to_one',
  },
  'ia-express-1a1': {
    id: 'ia-express-1a1',
    name: 'Curso IA Express 1 a 1',
    stripePriceId: 'price_1TdokqQ4M7vfTU0L0cwq4MPp',
    mode: 'one_to_one',
  },
  'ia-creador': {
    id: 'ia-creador',
    name: 'Curso IA Creador',
    stripePriceId: 'price_1TdomEQ4M7vfTU0Lc8jiVsbp',
    mode: 'one_to_one',
  },
  'ia-profesional': {
    id: 'ia-profesional',
    name: 'Curso IA Profesional',
    stripePriceId: 'price_1TdonMQ4M7vfTU0LGjqa3kkQ',
    mode: 'one_to_one',
  },
  'ia-anual-presencial-viernes': {
    id: 'ia-anual-presencial-viernes',
    name: 'Curso Anual IA Presencial · Grupo Viernes',
    stripePriceId: 'price_1TduMHQ4M7vfTU0L1Kd6zaQO',
    mode: 'group',
    groupId: ANNUAL_GROUP_ID,
  },
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    return new Response('Checkout Academia KreateIA activo', {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);

  try {
    requireEnv(env, ['FIREBASE_API_KEY']);
    const stripeSecret = env.STRIPE_SECRET_KEY || env.STRIPE_API_KEY || env.STRIPE_SECRET;
    if (!stripeSecret) throw new Error('Falta STRIPE_SECRET_KEY o STRIPE_API_KEY en Cloudflare');

    const idToken = getBearerToken(request);
    if (!idToken) return json({ ok: false, error: 'Debes iniciar sesión para comprar este curso.' }, 401);

    const user = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
    const body = await request.json().catch(() => null);
    const courseId = String(body?.courseId || '').trim();
    const course = COURSES[courseId];
    if (!course) return json({ ok: false, error: 'Curso no válido.' }, 400);

    if (course.mode === 'group') {
      requireEnv(env, ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);
      const accessToken = await getFirebaseAccessToken(env);
      const soldOut = await isAnnualGroupSoldOut(env, accessToken);
      if (soldOut) return json({ ok: false, soldOut: true, error: 'Este grupo ya no tiene plazas disponibles.' }, 409);
    }

    const origin = getSiteOrigin(request, env);
    const successUrl = `${origin}/?academy_payment=success&courseId=${encodeURIComponent(course.id)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/?academy_payment=cancel&courseId=${encodeURIComponent(course.id)}`;

    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('line_items[0][price]', course.stripePriceId);
    params.set('line_items[0][quantity]', '1');
    params.set('success_url', successUrl);
    params.set('cancel_url', cancelUrl);
    params.set('client_reference_id', user.uid);
    params.set('customer_email', user.email);
    params.set('customer_creation', 'always');
    params.set('allow_promotion_codes', 'true');
    params.set('metadata[type]', 'academy_course');
    params.set('metadata[uid]', user.uid);
    params.set('metadata[email]', user.email);
    params.set('metadata[courseId]', course.id);
    params.set('metadata[courseName]', course.name);
    params.set('metadata[courseMode]', course.mode);
    if (course.groupId) params.set('metadata[groupId]', course.groupId);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const stripeData = await stripeRes.json().catch(() => ({}));
    if (!stripeRes.ok) throw new Error(stripeData.error?.message || 'No se pudo crear el pago en Stripe');

    return json({
      ok: true,
      checkoutUrl: stripeData.url,
      sessionId: stripeData.id,
      courseId: course.id,
    });
  } catch (err) {
    return json({ ok: false, error: err.message || 'Error creando checkout Academia' }, 500);
  }
}

async function isAnnualGroupSoldOut(env, accessToken) {
  const enrollments = await listCollection(env, accessToken, 'academy_group_enrollments');
  const active = enrollments.filter(item => {
    return item.groupId === ANNUAL_GROUP_ID
      && ['paid', 'enrolled', 'active'].includes(String(item.status || '').toLowerCase());
  });

  return active.length >= ANNUAL_CAPACITY;
}

async function listCollection(env, accessToken, collectionName) {
  const res = await fetch(`${firestoreBase(env)}/${collectionName}?pageSize=1000`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) return [];
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `No se pudo leer ${collectionName}`);

  return (data.documents || []).map(doc => ({
    id: String(doc.name || '').split('/').pop(),
    ...fromFirestoreFields(doc.fields || {}),
  }));
}

async function verifyFirebaseToken(idToken, firebaseApiKey) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) throw new Error('Token inválido o expirado');
  const data = await res.json();
  const user = data.users?.[0];
  if (!user?.localId || !user?.email) throw new Error('Usuario no válido');

  return { uid: user.localId, email: normalizeEmail(user.email) };
}

async function getFirebaseAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: env.FIREBASE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    env.FIREBASE_PRIVATE_KEY
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error_description || 'No se pudo autenticar con Firebase');
  return data.access_token;
}

async function signJwt(header, payload, privateKey) {
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(signature)}`;
}

function pemToArrayBuffer(pem) {
  const clean = String(pem || '')
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64Url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromFirestoreFields(fields) {
  const out = {};
  Object.entries(fields || {}).forEach(([key, value]) => { out[key] = fromFirestoreValue(value); });
  return out;
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
}

function firestoreBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

function getBearerToken(request) {
  const header = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function getSiteOrigin(request, env) {
  const configured = String(env.PUBLIC_SITE_URL || env.SITE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  return new URL(request.url).origin;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function requireEnv(env, keys) {
  const missing = keys.filter(key => !env[key]);
  if (missing.length) throw new Error('Faltan variables: ' + missing.join(', '));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
