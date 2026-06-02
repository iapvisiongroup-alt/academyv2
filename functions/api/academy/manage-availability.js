const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ALLOWED_TIMES = new Set(['10:00', '12:00', '17:00', '19:00']);

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    return new Response('Control de agenda Academia KreateIA activo', {
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
    if (!idToken) return json({ ok: false, error: 'No autenticado' }, 401);

    const staff = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
    const accessToken = await getServiceAccountToken(env, 'https://www.googleapis.com/auth/datastore');

    const allowed = await isAllowedStaff(env.FIREBASE_PROJECT_ID, accessToken, staff.email);
    if (!allowed) return json({ ok: false, error: 'Email no autorizado' }, 403);

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'list').trim();

    if (action === 'list') {
      const blocks = await listDocs(env.FIREBASE_PROJECT_ID, 'academy_availability_blocks', accessToken);
      const bookings = await listDocs(env.FIREBASE_PROJECT_ID, 'private_academy_bookings', accessToken);

      return json({
        ok: true,
        blocks: blocks
          .map(item => ({ id: item.id, ...item.data }))
          .filter(item => item.status !== 'cancelled')
          .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.time || '').localeCompare(String(b.time || ''))),
        bookings: bookings
          .map(item => ({ id: item.id, ...item.data }))
          .filter(item => item.status !== 'cancelled')
          .sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || ''))),
      });
    }

    if (action === 'block_day') {
      const date = normalizeDate(body.date);
      if (!date) throw new Error('Fecha no válida');

      const reason = normalizeText(body.reason || 'Día no disponible', 160);
      const blockId = `${date}_day`;
      const now = new Date().toISOString();

      const block = {
        id: blockId,
        scope: 'day',
        status: 'blocked',
        type: normalizeType(body.type || 'blocked'),
        date,
        time: '',
        reason,
        title: normalizeText(body.title || reason, 160),
        createdByUid: staff.uid,
        createdByEmail: staff.email,
        createdAt: now,
        updatedAt: now,
      };

      await commitWrites(env.FIREBASE_PROJECT_ID, accessToken, [{
        update: {
          name: docName(env.FIREBASE_PROJECT_ID, `academy_availability_blocks/${blockId}`),
          fields: toFields(block),
        },
      }]);

      return json({ ok: true, block });
    }

    if (action === 'block_slot') {
      const date = normalizeDate(body.date);
      const time = normalizeTime(body.time);
      if (!date) throw new Error('Fecha no válida');
      if (!time) throw new Error('Hora no válida');

      const reason = normalizeText(body.reason || 'Horario no disponible', 160);
      const blockId = `${date}_${time.replace(':', '')}`;
      const now = new Date().toISOString();

      const block = {
        id: blockId,
        scope: 'slot',
        status: 'blocked',
        type: normalizeType(body.type || 'blocked'),
        date,
        time,
        reason,
        title: normalizeText(body.title || reason, 160),
        createdByUid: staff.uid,
        createdByEmail: staff.email,
        createdAt: now,
        updatedAt: now,
      };

      await commitWrites(env.FIREBASE_PROJECT_ID, accessToken, [{
        update: {
          name: docName(env.FIREBASE_PROJECT_ID, `academy_availability_blocks/${blockId}`),
          fields: toFields(block),
        },
      }]);

      return json({ ok: true, block });
    }

    if (action === 'unblock') {
      const blockId = normalizeBlockId(body.blockId);
      if (!blockId) throw new Error('Bloqueo no válido');

      const now = new Date().toISOString();

      await commitWrites(env.FIREBASE_PROJECT_ID, accessToken, [{
        update: {
          name: docName(env.FIREBASE_PROJECT_ID, `academy_availability_blocks/${blockId}`),
          fields: toFields({
            status: 'cancelled',
            cancelledAt: now,
            cancelledByUid: staff.uid,
            cancelledByEmail: staff.email,
            updatedAt: now,
          }),
        },
        updateMask: {
          fieldPaths: [
            'status',
            'cancelledAt',
            'cancelledByUid',
            'cancelledByEmail',
            'updatedAt',
          ],
        },
      }]);

      return json({ ok: true, blockId });
    }

    return json({ ok: false, error: 'Acción no válida' }, 400);
  } catch (err) {
    return json({ ok: false, error: err.message || 'Error gestionando agenda' }, 500);
  }
}

async function isAllowedStaff(projectId, accessToken, email) {
  const key = normalizeEmail(email);
  if (!key) return false;

  const doc = await getDoc(projectId, `private_allowed_users/${key}`, accessToken, true);
  return doc.exists && doc.data.active === true;
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

  if (!user?.localId || !user?.email) throw new Error('Usuario no válido');

  return {
    uid: user.localId,
    email: normalizeEmail(user.email),
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

async function getDoc(projectId, path, accessToken, allowMissing = false) {
  const res = await fetch(`${firestoreBase(projectId)}/${encodePath(path)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 404 && allowMissing) {
    return { exists: false, data: {}, updateTime: null };
  }

  if (!res.ok) throw new Error(`No se pudo leer ${path}`);

  const raw = await res.json();

  return {
    exists: true,
    data: fromFields(raw.fields || {}),
    updateTime: raw.updateTime || null,
  };
}

async function listDocs(projectId, path, accessToken) {
  const res = await fetch(`${firestoreBase(projectId)}/${encodePath(path)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 404) return [];

  if (!res.ok) throw new Error(`No se pudo listar ${path}`);

  const raw = await res.json();

  return (raw.documents || []).map(doc => {
    const parts = String(doc.name || '').split('/');
    return {
      id: parts[parts.length - 1],
      data: fromFields(doc.fields || {}),
    };
  });
}

async function commitWrites(projectId, accessToken, writes) {
  const res = await fetch(firestoreBase(projectId) + ':commit', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore commit: ${res.status} ${text.slice(0, 180)}`);
  }
}

function firestoreBase(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function docName(projectId, path) {
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function toFields(obj) {
  const fields = {};
  Object.entries(obj).forEach(([key, value]) => {
    fields[key] = toValue(value);
  });
  return fields;
}

function toValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };

  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toValue),
      },
    };
  }

  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: toFields(value),
      },
    };
  }

  return { stringValue: String(value) };
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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeDate(value) {
  const clean = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : '';
}

function normalizeTime(value) {
  const clean = String(value || '').trim();
  return ALLOWED_TIMES.has(clean) ? clean : '';
}

function normalizeText(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

function normalizeType(value) {
  const clean = String(value || '').trim();
  return ['blocked', 'meeting', 'personal', 'holiday'].includes(clean) ? clean : 'blocked';
}

function normalizeBlockId(value) {
  const clean = String(value || '').trim();
  return /^[A-Za-z0-9_-]{6,80}$/.test(clean) ? clean : '';
}

function getBearerToken(request) {
  const header = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
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
      'Content-Type': 'application/json',
    },
  });
}
