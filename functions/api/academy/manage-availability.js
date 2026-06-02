const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ANNUAL_GROUP_ID = 'ia-anual-viernes-2026';
const ANNUAL_CAPACITY = 12;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (request.method === 'GET') {
    return new Response('Control de agenda Academia KreateIA activo', {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);

  try {
    requireEnv(env, ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);
    const idToken = getBearerToken(request);
    if (!idToken) return json({ ok: false, error: 'Debes iniciar sesión.' }, 401);

    const user = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
    const accessToken = await getFirebaseAccessToken(env);
    const allowed = await isPrivateAllowed(env, accessToken, user.email);
    if (!allowed) return json({ ok: false, error: 'No tienes permiso para gestionar la agenda.' }, 403);

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || 'list').trim();

    if (action === 'list') {
      const blocks = await listCollection(env, accessToken, 'academy_availability_blocks');
      const bookings = await listCollection(env, accessToken, 'private_academy_bookings');
      const enrollments = await listCollection(env, accessToken, 'academy_group_enrollments');
      const activeEnrollments = enrollments.filter(item => {
        return item.groupId === ANNUAL_GROUP_ID
          && ['paid', 'enrolled', 'active'].includes(String(item.status || '').toLowerCase());
      });

      return json({
        ok: true,
        blocks,
        bookings,
        groupStats: {
          annualGroupId: ANNUAL_GROUP_ID,
          annualCapacity: ANNUAL_CAPACITY,
          annualEnrolled: activeEnrollments.length,
          annualSoldOut: activeEnrollments.length >= ANNUAL_CAPACITY,
        },
      });
    }

    if (action === 'block_day' || action === 'block_slot') {
      const date = normalizeDate(body?.date);
      const time = action === 'block_slot' ? normalizeTime(body?.time) : '';
      if (!date) return json({ ok: false, error: 'Fecha no válida.' }, 400);
      if (action === 'block_slot' && !time) return json({ ok: false, error: 'Hora no válida.' }, 400);

      const now = new Date();
      const blockId = action === 'block_day' ? `${date}_day` : slotDocId(date, time);
      const data = {
        id: blockId,
        date,
        time,
        scope: action === 'block_day' ? 'day' : 'slot',
        type: String(body?.type || 'blocked').trim().slice(0, 40),
        title: String(body?.title || 'No disponible').trim().slice(0, 160),
        reason: String(body?.reason || body?.title || 'No disponible').trim().slice(0, 500),
        status: 'blocked',
        createdByUid: user.uid,
        createdByEmail: user.email,
        createdAt: now,
        createdAtIso: now.toISOString(),
        updatedAt: now,
        updatedAtIso: now.toISOString(),
      };

      await commitWrites(env, accessToken, [
        updateWrite(collectionDocPath(env, 'academy_availability_blocks', blockId), data),
      ]);

      return json({ ok: true, block: data });
    }

    if (action === 'unblock') {
      const blockId = normalizeDocId(body?.blockId);
      if (!blockId) return json({ ok: false, error: 'Bloqueo no válido.' }, 400);

      const now = new Date();
      await commitWrites(env, accessToken, [
        updateWrite(collectionDocPath(env, 'academy_availability_blocks', blockId), {
          status: 'cancelled',
          cancelledByUid: user.uid,
          cancelledByEmail: user.email,
          updatedAt: now,
          updatedAtIso: now.toISOString(),
        }),
      ]);

      return json({ ok: true });
    }

    return json({ ok: false, error: 'Acción no válida.' }, 400);
  } catch (err) {
    return json({ ok: false, error: err.message || 'Error gestionando agenda.' }, 500);
  }
}

async function isPrivateAllowed(env, accessToken, email) {
  const normalized = normalizeEmail(email);
  if (normalized === 'info@iapvision.com' || normalized === 'info@kreateia.com') return true;
  const doc = await getFirestoreDoc(env, accessToken, collectionDocPath(env, 'private_allowed_users', normalized));
  if (!doc) return false;
  const data = fromFields(doc.fields || {});
  return data.active === true;
}

async function listCollection(env, accessToken, collectionName) {
  const res = await fetch(`${firestoreBase(env)}/${collectionName}?pageSize=1000`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return [];
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `No se pudo leer ${collectionName}`);
  return (data.documents || []).map(doc => ({ id: String(doc.name || '').split('/').pop(), ...fromFields(doc.fields || {}) }));
}

async function getFirestoreDoc(env, accessToken, documentPath) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${documentPath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'No se pudo leer Firestore');
  return data;
}

async function commitWrites(env, accessToken, writes) {
  const res = await fetch(`${firestoreBase(env)}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'No se pudo guardar en Firestore');
}

function updateWrite(documentPath, data) {
  return { update: { name: documentPath, fields: toFields(data) } };
}

function collectionDocPath(env, collectionName, docId) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}`;
}

function firestoreBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

function slotDocId(date, time) {
  return `${date}_${String(time || '').replace(':', '')}`;
}

function normalizeDate(value) {
  const clean = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : '';
}

function normalizeTime(value) {
  const clean = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(clean) ? clean : '';
}

function normalizeDocId(value) {
  const clean = String(value || '').trim();
  return /^[A-Za-z0-9_.:-]+$/.test(clean) ? clean : '';
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
