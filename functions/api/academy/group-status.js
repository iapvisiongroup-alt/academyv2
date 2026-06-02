const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ANNUAL_GROUP_ID = 'ia-anual-viernes-2026';
const ANNUAL_CAPACITY = 12;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Método no permitido' }, 405);
  }

  try {
    requireEnv(env, ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);
    const accessToken = await getFirebaseAccessToken(env);
    const enrollments = await listCollection(env, accessToken, 'academy_group_enrollments');
    const active = enrollments.filter(item => {
      return item.groupId === ANNUAL_GROUP_ID
        && ['paid', 'enrolled', 'active'].includes(String(item.status || '').toLowerCase());
    });

    return json({
      ok: true,
      groupId: ANNUAL_GROUP_ID,
      soldOut: active.length >= ANNUAL_CAPACITY,
    });
  } catch (err) {
    return json({ ok: false, error: err.message || 'No se pudo cargar el estado del grupo' }, 500);
  }
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
