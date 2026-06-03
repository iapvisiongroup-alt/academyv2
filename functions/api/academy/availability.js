const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ALLOWED_TIMES = ['10:00', '12:00', '17:00', '19:00'];
const DAYS_TO_SHOW = 42;
const ANNUAL_GROUP_START = '2026-09-11';
const ANNUAL_GROUP_END = '2027-06-25';
const ANNUAL_GROUP_TIMES = new Set(['17:00', '19:00']);
const ANNUAL_GROUP_LABEL = 'Grupo Anual IA Online · Viernes 17:00 a 20:00 por Zoom';

const NATIONAL_HOLIDAYS = {
  '2026-01-01': 'Año Nuevo',
  '2026-01-06': 'Epifanía del Señor',
  '2026-04-03': 'Viernes Santo',
  '2026-05-01': 'Fiesta del Trabajo',
  '2026-08-15': 'Asunción de la Virgen',
  '2026-10-12': 'Fiesta Nacional de España',
  '2026-11-01': 'Todos los Santos',
  '2026-12-06': 'Día de la Constitución',
  '2026-12-08': 'Inmaculada Concepción',
  '2026-12-25': 'Navidad',
  '2027-01-01': 'Año Nuevo',
  '2027-01-06': 'Epifanía del Señor',
  '2027-03-26': 'Viernes Santo',
  '2027-05-01': 'Fiesta del Trabajo',
  '2027-08-15': 'Asunción de la Virgen',
  '2027-10-12': 'Fiesta Nacional de España',
  '2027-11-01': 'Todos los Santos',
  '2027-12-06': 'Día de la Constitución',
  '2027-12-08': 'Inmaculada Concepción',
  '2027-12-25': 'Navidad',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (request.method === 'GET') {
    return new Response('Disponibilidad Academia KreateIA activa', {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);

  try {
    requireEnv(env, ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);
    const idToken = getBearerToken(request);
    if (!idToken) return json({ ok: false, error: 'Debes iniciar sesión para ver la agenda.' }, 401);
    await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);

    const accessToken = await getFirebaseAccessToken(env);
    const today = startOfMadridDay(new Date());
    const dates = [];

    for (let i = 0; i < DAYS_TO_SHOW; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(formatDate(date));
    }

    const slotIds = [];
    const blockIds = [];

    dates.forEach(date => {
      blockIds.push(`${date}_day`);
      ALLOWED_TIMES.forEach(time => {
        slotIds.push(slotDocId(date, time));
        blockIds.push(slotDocId(date, time));
      });
    });

    const slotMap = await batchGetDocuments(env, accessToken, 'academy_slots', slotIds);
    const blockMap = await batchGetDocuments(env, accessToken, 'academy_availability_blocks', blockIds);
    const now = new Date();

    const days = dates.map(date => {
      const dateObj = parseMadridDate(date);
      const weekday = dateObj.getDay();
      const isWeekend = weekday === 0 || weekday === 6;
      const holidayName = NATIONAL_HOLIDAYS[date] || '';
      const dayBlock = activeBlock(blockMap[`${date}_day`]);
      const groupDay = isAnnualGroupDate(date);

      const slots = ALLOWED_TIMES.map(time => {
        const bookedSlot = activeSlot(slotMap[slotDocId(date, time)]);
        const booked = !!bookedSlot;
        const slotBlock = activeBlock(blockMap[slotDocId(date, time)]);
        const slotDate = parseMadridDateTime(date, time);
        const past = slotDate.getTime() <= now.getTime();
        const groupBlocked = groupDay && ANNUAL_GROUP_TIMES.has(time);
        const holidayBlocked = !!holidayName;
        const blocked = !!dayBlock || !!slotBlock || holidayBlocked || groupBlocked;
        const blockReason = holidayName
          || dayBlock?.reason
          || dayBlock?.title
          || slotBlock?.reason
          || slotBlock?.title
          || (groupBlocked ? ANNUAL_GROUP_LABEL : '');

        return {
          time,
          available: !isWeekend && !past && !booked && !blocked,
          booked,
          bookingId: bookedSlot?.bookingId || '',
          busyReason: booked
            ? 'Reservado'
            : blockReason,
          blocked,
          groupBlocked,
          holidayBlocked,
          past,
          blockReason,
        };
      });

      const hasAvailableSlot = slots.some(slot => slot.available);
      const unavailableReason = holidayName
        || dayBlock?.reason
        || dayBlock?.title
        || (hasAvailableSlot ? '' : 'Completo');

      return {
        date,
        dayNumber: dateObj.getDate(),
        monthLabel: new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(dateObj),
        weekdayLabel: new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(dateObj),
        available: hasAvailableSlot,
        unavailable: !hasAvailableSlot,
        blocked: !!dayBlock || !!holidayName,
        holiday: holidayName,
        groupDay,
        blockReason: dayBlock?.reason || dayBlock?.title || holidayName,
        unavailableReason,
        slots,
      };
    });

    return json({
      ok: true,
      times: ALLOWED_TIMES,
      days,
    });
  } catch (err) {
    return json({ ok: false, error: err.message || 'Error cargando disponibilidad' }, 500);
  }
}

function isAnnualGroupDate(date) {
  if (date < ANNUAL_GROUP_START || date > ANNUAL_GROUP_END) return false;
  if (NATIONAL_HOLIDAYS[date]) return false;
  const weekday = parseMadridDate(date).getDay();
  return weekday === 5;
}

function activeBlock(doc) {
  if (!doc) return null;
  const data = doc.fields ? fromFirestoreFields(doc.fields) : doc;
  if (!data) return null;
  const status = String(data.status || 'blocked').toLowerCase();
  if (status !== 'blocked') return null;
  return data;
}

function activeSlot(doc) {
  if (!doc) return null;
  const data = doc.fields ? fromFirestoreFields(doc.fields) : doc;
  if (!data) return null;
  const status = String(data.status || 'booked').toLowerCase();
  if (['cancelled', 'canceled', 'released', 'deleted'].includes(status)) return null;
  return data;
}

function slotDocId(date, time) {
  return `${date}_${String(time || '').replace(':', '')}`;
}

function startOfMadridDay(date) {
  return parseMadridDate(formatDate(date));
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parseMadridDate(dateText) {
  const [year, month, day] = String(dateText || '').split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0);
}

function parseMadridDateTime(dateText, timeText) {
  const [year, month, day] = String(dateText || '').split('-').map(Number);
  const [hour, minute] = String(timeText || '').split(':').map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0);
}

async function batchGetDocuments(env, accessToken, collectionName, ids) {
  if (!ids.length) return {};

  const documents = ids.map(id => {
    return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}/${id}`;
  });

  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:batchGet`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ documents }),
  });

  if (!res.ok) throw new Error('No se pudo leer disponibilidad.');
  const data = await res.json();
  const out = {};
  (data || []).forEach(item => {
    if (!item.found) return;
    out[item.found.name.split('/').pop()] = item.found;
  });
  return out;
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
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error_description || 'No se pudo autenticar con Firebase');
  return data.access_token;
}

async function signJwt(header, payload, privateKey) {
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(signature)}`;
}

function pemToArrayBuffer(pem) {
  const clean = String(pem || '').replace(/\\n/g, '\n').replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
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

function getBearerToken(request) {
  const header = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
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
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
