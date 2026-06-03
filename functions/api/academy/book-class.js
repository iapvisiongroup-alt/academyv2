const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const APP_ID = 'appiapvision';
const ALLOWED_TIMES = ['10:00', '12:00', '17:00', '19:00'];
const ANNUAL_GROUP_START = '2026-09-11';
const ANNUAL_GROUP_END = '2027-06-25';
const ANNUAL_GROUP_TIMES = new Set(['17:00', '19:00']);
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

const COURSES = {
  'diagnostico-ia': { id: 'diagnostico-ia', name: 'Diagnóstico IA 1 a 1', totalClasses: 1 },
  'ia-express-1a1': { id: 'ia-express-1a1', name: 'Curso IA Express 1 a 1', totalClasses: 1 },
  'ia-creador': { id: 'ia-creador', name: 'Curso IA Creador', totalClasses: 3 },
  'ia-profesional': { id: 'ia-profesional', name: 'Curso IA Profesional', totalClasses: 3 },
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'GET') return new Response('Agenda Academia KreateIA activa', { status: 200, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
  if (request.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);

  try {
    requireEnv(env, ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);
    const idToken = getBearerToken(request);
    if (!idToken) return json({ ok: false, error: 'Debes iniciar sesión para agendar una clase.' }, 401);

    const user = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
    const body = await request.json().catch(() => null);
    const courseId = String(body?.courseId || '').trim();
    const course = COURSES[courseId];
    if (!course) return json({ ok: false, error: 'Curso no válido o no requiere agenda individual.' }, 400);

    const date = String(body?.date || body?.slot?.date || '').trim();
    const time = String(body?.time || body?.slot?.time || '').trim();
    const classNumber = Math.max(1, Math.floor(Number(body?.classNumber || body?.lessonNumber || 1)));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'Fecha no válida.' }, 400);
    if (!ALLOWED_TIMES.includes(time)) return json({ ok: false, error: 'Horario no válido.' }, 400);
    if (classNumber > course.totalClasses) return json({ ok: false, error: 'Número de clase no válido para este curso.' }, 400);
    if (isWeekendDate(date)) return json({ ok: false, error: 'Ese día no está disponible.' }, 400);
    if (NATIONAL_HOLIDAYS[date]) return json({ ok: false, error: `Ese día es festivo nacional: ${NATIONAL_HOLIDAYS[date]}.` }, 400);
    if (isAnnualGroupSlot(date, time)) return json({ ok: false, error: 'Ese viernes por la tarde está reservado para el Curso Anual IA Online por Zoom.' }, 409);
    if (isPastMadridSlot(date, time)) return json({ ok: false, error: 'No puedes reservar una hora pasada.' }, 400);

    const accessToken = await getFirebaseAccessToken(env);
    const purchasePath = userSubDocPath(env, user.uid, 'academy_purchases', courseId);
    const purchaseDoc = await getFirestoreDoc(env, accessToken, purchasePath);
    if (!purchaseDoc) return json({ ok: false, error: 'Este curso todavía no aparece como pagado en tu cuenta.' }, 403);

    const slotId = slotDocId(date, time);
    const bookingId = safeDocId(`${user.uid}_${courseId}_${classNumber}`);

    const dayBlock = activeBlock(await getFirestoreDoc(env, accessToken, collectionDocPath(env, 'academy_availability_blocks', `${date}_day`)));
    const slotBlock = activeBlock(await getFirestoreDoc(env, accessToken, collectionDocPath(env, 'academy_availability_blocks', slotId)));
    if (dayBlock) return json({ ok: false, error: dayBlock.reason || dayBlock.title || 'Ese día está bloqueado.' }, 409);
    if (slotBlock) return json({ ok: false, error: slotBlock.reason || slotBlock.title || 'Ese horario está bloqueado.' }, 409);

    const existingSlot = activeSlot(await getFirestoreDoc(env, accessToken, collectionDocPath(env, 'academy_slots', slotId)));
    if (existingSlot) return json({ ok: false, error: 'Ese horario acaba de ser reservado. Elige otro hueco.' }, 409);

    const now = new Date();
    const bookingData = {
      id: bookingId,
      uid: user.uid,
      email: user.email,
      courseId,
      courseName: course.name,
      classNumber,
      totalClasses: course.totalClasses,
      date,
      time,
      slotId,
      timezone: 'Europe/Madrid',
      status: 'booked',
      studentName: String(body?.studentName || body?.name || user.displayName || '').trim(),
      contactPhone: String(body?.phone || body?.contactPhone || '').trim(),
      notes: String(body?.notes || body?.message || '').trim().slice(0, 800),
      createdAt: now,
      createdAtIso: now.toISOString(),
      updatedAt: now,
      updatedAtIso: now.toISOString(),
      source: 'web',
    };

    await commitWrites(env, accessToken, [
      createWrite(collectionDocPath(env, 'academy_slots', slotId), {
        id: slotId,
        date,
        time,
        status: 'booked',
        uid: user.uid,
        email: user.email,
        courseId,
        courseName: course.name,
        classNumber,
        bookingId,
        createdAt: now,
        createdAtIso: now.toISOString(),
      }),
      updateWrite(userSubDocPath(env, user.uid, 'academy_bookings', bookingId), bookingData),
      updateWrite(collectionDocPath(env, 'private_academy_bookings', bookingId), {
        ...bookingData,
        customerUid: user.uid,
        customerEmail: user.email,
        internalStatus: 'pending_review',
        adminNotes: '',
      }),
      updateWrite(purchasePath, {
        bookingStatus: course.totalClasses > 1 ? 'class_booked' : 'booked',
        lastBookingDate: date,
        lastBookingTime: time,
        lastBookedClassNumber: classNumber,
        lastBookingAt: now,
        updatedAt: now,
      }),
    ]);

    return json({ ok: true, booking: { id: bookingId, courseId, courseName: course.name, classNumber, totalClasses: course.totalClasses, date, time, status: 'booked' } });
  } catch (err) {
    return json({ ok: false, error: err.message || 'Error agendando clase.' }, err.status || 500);
  }
}

function activeBlock(doc) {
  if (!doc) return null;
  const data = fromFields(doc.fields || {});
  return String(data.status || 'blocked').toLowerCase() === 'blocked' ? data : null;
}

function activeSlot(doc) {
  if (!doc) return null;
  const data = fromFields(doc.fields || {});
  const status = String(data.status || 'booked').toLowerCase();
  if (['cancelled', 'canceled', 'released', 'deleted'].includes(status)) return null;
  return data;
}

function slotDocId(date, time) {
  return `${date}_${String(time || '').replace(':', '')}`;
}

function isAnnualGroupSlot(date, time) {
  if (date < ANNUAL_GROUP_START || date > ANNUAL_GROUP_END) return false;
  if (!ANNUAL_GROUP_TIMES.has(time)) return false;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 5;
}

function isWeekendDate(dateText) {
  const [year, month, day] = String(dateText || '').split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function isPastMadridSlot(dateText, timeText) {
  const now = getMadridNowParts();
  const [hour, minute] = String(timeText || '').split(':').map(Number);
  const minutes = (hour || 0) * 60 + (minute || 0);
  if (dateText < now.date) return true;
  if (dateText > now.date) return false;
  return minutes <= now.minutes;
}

function getMadridNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const map = {};
  parts.forEach(part => { if (part.type !== 'literal') map[part.type] = part.value; });
  return { date: `${map.year}-${map.month}-${map.day}`, minutes: Number(map.hour || 0) * 60 + Number(map.minute || 0) };
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
  return { uid: user.localId, email: normalizeEmail(user.email), displayName: user.displayName || '' };
}

async function getFirestoreDoc(env, accessToken, documentPath) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${documentPath}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'No se pudo leer Firestore');
  return data;
}

async function commitWrites(env, accessToken, writes) {
  const res = await fetch(`${firestoreBase(env)}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'No se pudo guardar la reserva.');
}

function createWrite(documentPath, data) {
  return { update: { name: documentPath, fields: toFields(data) }, currentDocument: { exists: false } };
}

function updateWrite(documentPath, data) {
  return { update: { name: documentPath, fields: toFields(data) } };
}

function userSubDocPath(env, uid, subcollection, docId) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/artifacts/${APP_ID}/public/data/users/${uid}/${subcollection}/${docId}`;
}

function collectionDocPath(env, collectionName, docId) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}`;
}

function firestoreBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

async function getFirebaseAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt({ alg: 'RS256', typ: 'JWT' }, {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }, env.FIREBASE_PRIVATE_KEY);
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

function toFields(obj) {
  const fields = {};
  Object.entries(obj || {}).forEach(([key, value]) => { if (value !== undefined) fields[key] = toValue(value); });
  return fields;
}

function toValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFields(value) } };
  return { stringValue: String(value) };
}

function fromFields(fields) {
  const out = {};
  Object.entries(fields || {}).forEach(([key, value]) => { out[key] = fromValue(value); });
  return out;
}

function fromValue(value) {
  if (!value || typeof value !== 'object') return null;
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

function getBearerToken(request) {
  const header = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function safeDocId(value) {
  return String(value || '').replace(/[^\w.-]/g, '_');
}

function requireEnv(env, keys) {
  const missing = keys.filter(key => !env[key]);
  if (missing.length) throw new Error('Faltan variables: ' + missing.join(', '));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
