const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const APP_ID = 'appiapvision';
const MAIN_ADMIN_EMAILS = new Set([
  'info@iapvision.com',
  'info@kreateia.com',
]);

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    return json({ ok: true, message: 'Admin users API active' });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Método no permitido' }, 405);
  }

  try {
    requireEnv(env, ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);

    const idToken = getBearerToken(request);
    if (!idToken) return json({ ok: false, error: 'Falta sesión admin.' }, 401);

    const admin = await verifyFirebaseUser(idToken, env.FIREBASE_API_KEY);
    if (!MAIN_ADMIN_EMAILS.has(normalizeEmail(admin.email))) {
      return json({ ok: false, error: 'No autorizado.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const accessToken = await getFirebaseAccessToken(env);
    const appId = env.FIREBASE_APP_ID || env.APP_ID || APP_ID;

    if (action === 'listUsers') {
      const users = await listUsers(env.FIREBASE_PROJECT_ID, appId, accessToken);
      return json({ ok: true, users });
    }

    if (action === 'setCredits') {
      const uid = cleanUid(body.uid);
      const credits = sanitizeCredits(body.credits);
      const result = await setUserCredits(env.FIREBASE_PROJECT_ID, appId, accessToken, uid, credits, admin.email, 'setCredits');
      return json({ ok: true, ...result });
    }

    if (action === 'adjustCredits') {
      const uid = cleanUid(body.uid);
      const amount = Math.trunc(Number(body.amount || 0));
      if (!Number.isFinite(amount) || amount === 0) throw new Error('Cantidad no válida.');

      const user = await getUserDoc(env.FIREBASE_PROJECT_ID, appId, accessToken, uid);
      const current = Math.max(0, Math.trunc(Number(user.credits || 0)));
      const credits = sanitizeCredits(current + amount);
      const result = await setUserCredits(env.FIREBASE_PROJECT_ID, appId, accessToken, uid, credits, admin.email, 'adjustCredits');
      return json({ ok: true, ...result });
    }

    return json({ ok: false, error: 'Acción no válida.' }, 400);
  } catch (err) {
    return json({ ok: false, error: err.message || 'Error admin.' }, 500);
  }
}

async function listUsers(projectId, appId, accessToken) {
  const path = `artifacts/${appId}/public/data/users`;
  const users = [];
  let pageToken = '';

  do {
    const url = new URL(`${firestoreBase(projectId)}/${encodePath(path)}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || 'No se pudieron cargar usuarios.');

    for (const item of data.documents || []) {
      const fields = fromFirestoreFields(item.fields || {});
      const uid = String(item.name || '').split('/').pop();

      users.push({
        id: uid,
        uid,
        email: fields.email || '',
        credits: Math.max(0, Math.trunc(Number(fields.credits || 0))),
        role: fields.role || 'user',
        updatedAt: fields.updatedAt || '',
      });
    }

    pageToken = data.nextPageToken || '';
  } while (pageToken);

  users.sort((a, b) => {
    const creditsDiff = Number(b.credits || 0) - Number(a.credits || 0);
    if (creditsDiff) return creditsDiff;
    return String(a.email || '').localeCompare(String(b.email || ''));
  });

  return users;
}

async function getUserDoc(projectId, appId, accessToken, uid) {
  const path = `artifacts/${appId}/public/data/users/${uid}`;
  const res = await fetch(`${firestoreBase(projectId)}/${encodePath(path)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) throw new Error('Usuario no encontrado.');

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'No se pudo leer usuario.');

  return fromFirestoreFields(data.fields || {});
}

async function setUserCredits(projectId, appId, accessToken, uid, credits, adminEmail, reason) {
  await getUserDoc(projectId, appId, accessToken, uid);

  const now = new Date().toISOString();
  const path = `artifacts/${appId}/public/data/users/${uid}`;
  const fullName = `projects/${projectId}/databases/(default)/documents/${path}`;

  const res = await fetch(`${firestoreBase(projectId)}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: [{
        update: {
          name: fullName,
          fields: {
            credits: { integerValue: String(credits) },
            creditsUpdatedAt: { timestampValue: now },
            creditsUpdatedBy: { stringValue: normalizeEmail(adminEmail) },
            creditsUpdateReason: { stringValue: reason },
          },
        },
        updateMask: {
          fieldPaths: ['credits', 'creditsUpdatedAt', 'creditsUpdatedBy', 'creditsUpdateReason'],
        },
      }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'No se pudieron actualizar créditos.');

  return { uid, credits };
}

async function verifyFirebaseUser(idToken, firebaseApiKey) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'Token inválido.');

  const user = data.users?.[0];
  if (!user?.localId || !user?.email) throw new Error('Usuario no válido.');

  return {
    uid: user.localId,
    email: normalizeEmail(user.email),
  };
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
  if (!res.ok || !data.access_token) throw new Error(data.error_description || 'No se pudo autenticar con Firebase.');

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

function fromFirestoreFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    out[key] = fromFirestoreValue(value);
  }
  return out;
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue || 0);
  if ('doubleValue' in value) return Number(value.doubleValue || 0);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
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
  let raw;
  if (typeof input === 'string') {
    raw = input;
  } else {
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer || input);
    raw = '';
    for (const byte of bytes) raw += String.fromCharCode(byte);
  }

  return btoa(raw).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function cleanUid(uid) {
  const value = String(uid || '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(value)) throw new Error('UID no válido.');
  return value;
}

function sanitizeCredits(value) {
  const credits = Math.trunc(Number(value));
  if (!Number.isFinite(credits) || credits < 0 || credits > 1000000) {
    throw new Error('Créditos no válidos.');
  }
  return credits;
}

function getBearerToken(request) {
  const header = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function encodePath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function firestoreBase(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function requireEnv(env, keys) {
  const missing = keys.filter(key => !env[key]);
  if (missing.length) throw new Error('Faltan variables: ' + missing.join(', '));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
