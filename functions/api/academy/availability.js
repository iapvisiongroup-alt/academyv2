const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ALLOWED_TIMES = ['10:00', '12:00', '17:00', '19:00'];
const MAX_DAYS = 30;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    return new Response('Disponibilidad Academia KreateIA activa', {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Método no permitido' }, 405);
  }

  try {
    requireEnv(env, [
      'FIREBASE_API_KEY',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
    ]);

    const idToken = getBearerToken(request);

    if (!idToken) {
      return json({ ok: false, error: 'Debes iniciar sesión para consultar disponibilidad.' }, 401);
    }

    await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);

    const body = await request.json().catch(() => ({}));
    const daysRequested = Math.min(Math.max(Number(body.days || 21), 7), MAX_DAYS);

    const dates = buildMadridDates(daysRequested);
    const slotIds = [];

    dates.forEach(day => {
      ALLOWED_TIMES.forEach(time => {
        slotIds.push(`${day.date}_${time.replace(':', '')}`);
      });
    });

    const accessToken = await getServiceAccountToken(env, 'https://www.googleapis.com/auth/datastore');
    const bookedSlots = await batchGetBookedSlots(env.FIREBASE_PROJECT_ID, accessToken, slotIds);

    const availability = dates.map(day => {
      const isWorkDay = day.weekday >= 1 && day.weekday <= 5;

      const slots = ALLOWED_TIMES.map(time => {
        const slotId = `${day.date}_${time.replace(':', '')}`;
        const slotBooked = bookedSlots.has(slotId);
        const future = isFutureMadridSlot(day.date, time);

        return {
          time,
          available: isWorkDay && future && !slotBooked,
          booked: slotBooked,
          past: !future,
        };
      });

      const availableCount = slots.filter(slot => slot.available).length;

      return {
        date: day.date,
        dayNumber: day.dayNumber,
        monthLabel: day.monthLabel,
        weekdayLabel: day.weekdayLabel,
        available: availableCount > 0,
        unavailableReason: !isWorkDay ? 'Cerrado' : availableCount === 0 ? 'Sin huecos' : '',
        slots,
      };
    });

    return json({
      ok: true,
      days: availability,
      times: ALLOWED_TIMES,
    });
  } catch (err) {
    return json({
      ok: false,
      error: err.message || 'Error consultando disponibilidad',
    }, 500);
  }
}

function buildMadridDates(days) {
  const result = [];
  const formatter = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });

  const base = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(base.getTime());
    date.setDate(base.getDate() + i);

    const madridDate = toMadridDate(date);
    const localDate = new Date(`${madridDate}T12:00:00Z`);
    const weekday = localDate.getUTCDay() === 0 ? 7 : localDate.getUTCDay();
    const parts = formatter.formatToParts(date);
    const map = {};

    parts.forEach(part => {
      map[part.type] = part.value;
    });

    result.push({
      date: madridDate,
      weekday,
      weekdayLabel: capitalize(String(map.weekday || '').replace('.', '')),
      dayNumber: String(map.day || ''),
      monthLabel: capitalize(String(map.month || '').replace('.', '')),
    });
  }

  return result;
}

function toMadridDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const map = {};
  parts.forEach(part => {
    map[part.type] = part.value;
  });

  return `${map.year}-${map.month}-${map.day}`;
}

async function batchGetBookedSlots(projectId, accessToken, slotIds) {
  if (!slotIds.length) return new Set();

  const documents = slotIds.map(slotId => {
    return docName(projectId, `academy_slots/${slotId}`);
  });

  const res = await fetch(`${firestoreBase(projectId)}:batchGet`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ documents }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`No se pudo consultar disponibilidad: ${res.status} ${text.slice(0, 120)}`);
  }

  const raw = await res.json().catch(() => []);
  const booked = new Set();

  raw.forEach(item => {
    if (!item.found || !item.found.name) return;

    const id = String(item.found.name).split('/').pop();
    const fields = fromFields(item.found.fields || {});

    if (fields.status === 'booked') {
      booked.add(id);
    }
  });

  return booked;
}

async function verifyFirebaseToken(idToken, firebaseApiKey) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) throw new Error('Token inválido o expirado');

  const data = await res.json();
  const user = data.users?.[0];

  if (!user?.localId || !user?.email) {
    throw new Error('Usuario no válido');
  }

  return {
    uid: user.localId,
    email: String(user.email || '').trim().toLowerCase(),
  };
}

async function getServiceAccountToken(env, scope) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope,
  };

  const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const jwt = await signJWT(payload, privateKey);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) throw new Error('No se pudo obtener token de Google');

  return (await res.json()).access_token;
}

async function signJWT(payload, pemKey) {
  const unsigned = `${b64uJson({ alg: 'RS256', typ: 'JWT' })}.${b64uJson(payload)}`;

  const pemBody = pemKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );

  return `${unsigned}.${b64uBytes(new Uint8Array(sig))}`;
}

function b64uJson(obj) {
  return b64uBytes(new TextEncoder().encode(JSON.stringify(obj)));
}

function b64uBytes(bytes) {
  let bin = '';

  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  }

  return btoa(bin)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function firestoreBase(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function docName(projectId, path) {
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

function fromFields(fields) {
  const obj = {};

  Object.entries(fields || {}).forEach(([key, value]) => {
    obj[key] = fromValue(value);
  });

  return obj;
}

function fromValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromValue);
  if ('mapValue' in value) return fromFields(value.mapValue.fields || {});
  return null;
}

function isFutureMadridSlot(date, time) {
  const startAt = `${date}T${time}:00${madridOffsetForDate(date)}`;
  return new Date(startAt).getTime() > Date.now() + 30 * 60 * 1000;
}

function madridOffsetForDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  const current = Date.UTC(year, month - 1, day);
  const dstStart = Date.UTC(year, 2, lastSunday(year, 2));
  const dstEnd = Date.UTC(year, 9, lastSunday(year, 9));

  return current >= dstStart && current < dstEnd ? '+02:00' : '+01:00';
}

function lastSunday(year, monthIndex) {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function getBearerToken(request) {
  const header = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function requireEnv(env, keys) {
  const missing = keys.filter(key => !env[key]);

  if (missing.length) {
    throw new Error('Faltan variables: ' + missing.join(', '));
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
    },
  });
}
