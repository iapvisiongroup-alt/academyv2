const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const COURSES = {
  'diagnostico-ia': {
    id: 'diagnostico-ia',
    name: 'Diagnóstico IA 1 a 1',
    maxBookings: 1,
  },
  'ia-express-1a1': {
    id: 'ia-express-1a1',
    name: 'Curso IA Express 1 a 1',
    maxBookings: 1,
  },
  'ia-creador': {
    id: 'ia-creador',
    name: 'Curso IA Creador',
    maxBookings: 3,
  },
  'ia-profesional': {
    id: 'ia-profesional',
    name: 'Curso IA Profesional',
    maxBookings: 3,
  },
};

const ALLOWED_TIMES = new Set([
  '10:00',
  '12:00',
  '17:00',
  '19:00',
]);

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    return new Response('Agenda Academia KreateIA activa', {
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
      return json({ ok: false, error: 'Debes iniciar sesión para agendar clase.' }, 401);
    }

    const user = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);

    const body = await request.json().catch(() => null);
    const courseId = normalizeCourseId(body?.courseId);
    const date = String(body?.date || '').trim();
    const time = String(body?.time || '').trim();

    const course = COURSES[courseId];

    if (!course) throw new Error('Curso no válido');
    if (!isValidDate(date)) throw new Error('Fecha no válida');
    if (!ALLOWED_TIMES.has(time)) throw new Error('Hora no válida');
    if (!isFutureMadridSlot(date, time)) throw new Error('El horario elegido ya ha pasado');

    const accessToken = await getServiceAccountToken(env, 'https://www.googleapis.com/auth/datastore');
    const appId = String(env.APP_ID || 'appiapvision').trim();
    const userBasePath = `artifacts/${appId}/public/data/users/${user.uid}`;

    const purchaseDoc = await getDoc(
      env.FIREBASE_PROJECT_ID,
      `${userBasePath}/academy_purchases/${course.id}`,
      accessToken,
      true
    );

    if (!purchaseDoc.exists || purchaseDoc.data.status !== 'paid') {
      throw new Error('Este curso no está pagado todavía');
    }

    const currentBookings = await listDocs(
      env.FIREBASE_PROJECT_ID,
      `${userBasePath}/academy_bookings`,
      accessToken
    );

    const courseBookings = currentBookings.filter(item => {
      return item.data.courseId === course.id && item.data.status !== 'cancelled';
    });

    if (courseBookings.length >= course.maxBookings) {
      throw new Error('Ya tienes todas las clases agendadas para este curso');
    }

    const globalSlotId = `${date}_${time.replace(':', '')}`;
    const globalSlotPath = `academy_slots/${globalSlotId}`;
    const globalSlot = await getDoc(env.FIREBASE_PROJECT_ID, globalSlotPath, accessToken, true);

    if (globalSlot.exists && globalSlot.data.status === 'booked') {
      throw new Error('Ese horario ya no está disponible');
    }

    const bookingNumber = courseBookings.length + 1;
    const bookingId = `${course.id}_clase_${bookingNumber}`;
    const internalBookingId = `${date}_${time.replace(':', '')}_${user.uid}_${course.id}`;
    const now = new Date().toISOString();
    const startAt = `${date}T${time}:00${madridOffsetForDate(date)}`;

    const booking = {
      id: bookingId,
      uid: user.uid,
      email: user.email,
      courseId: course.id,
      courseName: course.name,
      classNumber: bookingNumber,
      totalClasses: course.maxBookings,
      date,
      time,
      timezone: 'Europe/Madrid',
      startAt,
      status: 'booked',
      zoomUrl: '',
      notes: '',
      createdAt: now,
      updatedAt: now,
    };

    const internalBooking = {
      ...booking,
      id: internalBookingId,
      userBookingId: bookingId,
      source: 'academy_web',
      customerName: String(purchaseDoc.data.customerName || ''),
      customerPhone: String(purchaseDoc.data.customerPhone || ''),
      adminStatus: 'pending_zoom',
      adminNotes: '',
      notifiedAt: null,
    };

    const slot = {
      id: globalSlotId,
      uid: user.uid,
      email: user.email,
      courseId: course.id,
      courseName: course.name,
      bookingId,
      internalBookingId,
      date,
      time,
      timezone: 'Europe/Madrid',
      startAt,
      status: 'booked',
      createdAt: now,
      updatedAt: now,
    };

    await commitWrites(env.FIREBASE_PROJECT_ID, accessToken, [
      {
        update: {
          name: docName(env.FIREBASE_PROJECT_ID, `${userBasePath}/academy_bookings/${bookingId}`),
          fields: toFields(booking),
        },
      },
      {
        update: {
          name: docName(env.FIREBASE_PROJECT_ID, `private_academy_bookings/${internalBookingId}`),
          fields: toFields(internalBooking),
        },
      },
      {
        update: {
          name: docName(env.FIREBASE_PROJECT_ID, globalSlotPath),
          fields: toFields(slot),
        },
        currentDocument: {
          exists: false,
        },
      },
      {
        update: {
          name: docName(env.FIREBASE_PROJECT_ID, `${userBasePath}/academy_purchases/${course.id}`),
          fields: toFields({
            bookingStatus: bookingNumber >= course.maxBookings ? 'complete' : 'partial',
            lastBookingAt: now,
            updatedAt: now,
          }),
        },
        updateMask: {
          fieldPaths: ['bookingStatus', 'lastBookingAt', 'updatedAt'],
        },
      },
    ]);

    return json({
      ok: true,
      booking,
    });
  } catch (err) {
    return json({
      ok: false,
      error: err.message || 'Error agendando clase',
    }, 500);
  }
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

  if (!res.ok) {
    throw new Error(`No se pudo leer ${path}`);
  }

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

  if (!res.ok) {
    throw new Error(`No se pudo listar ${path}`);
  }

  const raw = await res.json();

  return (raw.documents || []).map(doc => {
    const nameParts = String(doc.name || '').split('/');
    return {
      id: nameParts[nameParts.length - 1],
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

    if (text.includes('current document does not exist') || text.includes('FAILED_PRECONDITION')) {
      throw new Error('Ese horario ya no está disponible');
    }

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

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
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

function getBearerToken(request) {
  const header = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeCourseId(value) {
  const clean = String(value || '').trim();
  return /^[a-z0-9_-]{3,80}$/.test(clean) ? clean : '';
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
