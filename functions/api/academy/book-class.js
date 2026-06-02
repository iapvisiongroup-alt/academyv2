const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const APP_ID = 'appiapvision';
const ALLOWED_TIMES = ['10:00', '12:00', '17:00', '19:00'];

const COURSES = {
  'diagnostico-ia': {
    id: 'diagnostico-ia',
    name: 'Diagnóstico IA 1 a 1',
    totalClasses: 1,
  },
  'ia-express-1a1': {
    id: 'ia-express-1a1',
    name: 'Curso IA Express 1 a 1',
    totalClasses: 1,
  },
  'ia-creador': {
    id: 'ia-creador',
    name: 'Curso IA Creador',
    totalClasses: 3,
  },
  'ia-profesional': {
    id: 'ia-profesional',
    name: 'Curso IA Profesional',
    totalClasses: 3,
  },
};

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
      return json({ ok: false, error: 'Debes iniciar sesión para agendar una clase.' }, 401);
    }

    const user = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
    const body = await request.json().catch(() => null);

    const courseId = String(body?.courseId || '').trim();
    const course = COURSES[courseId];

    if (!course) {
      return json({ ok: false, error: 'Curso no válido.' }, 400);
    }

    const date = String(body?.date || body?.slot?.date || '').trim();
    const time = String(body?.time || body?.slot?.time || '').trim();
    const classNumber = Math.max(1, Math.floor(Number(body?.classNumber || body?.lessonNumber || 1)));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ ok: false, error: 'Fecha no válida.' }, 400);
    }

    if (!ALLOWED_TIMES.includes(time)) {
      return json({ ok: false, error: 'Horario no válido.' }, 400);
    }

    if (classNumber > course.totalClasses) {
      return json({ ok: false, error: 'Número de clase no válido para este curso.' }, 400);
    }

    if (isWeekendDate(date)) {
      return json({ ok: false, error: 'Ese día no está disponible.' }, 400);
    }

    if (isPastMadridSlot(date, time)) {
      return json({ ok: false, error: 'No puedes reservar una hora pasada.' }, 400);
    }

    const accessToken = await getFirebaseAccessToken(env);

    const purchasePath = userSubDocPath(env, user.uid, 'academy_purchases', courseId);
    const purchaseDoc = await getFirestoreDoc(env, accessToken, purchasePath);

    if (!purchaseDoc) {
      return json({ ok: false, error: 'Este curso todavía no aparece como pagado en tu cuenta.' }, 403);
    }

    const purchase = fromFirestoreFields(purchaseDoc.fields || {});
    const purchaseStatus = String(purchase.status || purchase.paymentStatus || '').toLowerCase();

    if (['cancelled', 'canceled', 'refunded', 'reembolsado'].includes(purchaseStatus)) {
      return json({ ok: false, error: 'Esta compra no está activa.' }, 403);
    }

    const slotId = slotDocId(date, time);
    const bookingId = safeDocId(`${user.uid}_${courseId}_${classNumber}`);

    const dayBlockDoc = await getFirestoreDoc(
      env,
      accessToken,
      collectionDocPath(env, 'academy_availability_blocks', dayBlockDocId(date))
    );

    const slotBlockDoc = await getFirestoreDoc(
      env,
      accessToken,
      collectionDocPath(env, 'academy_availability_blocks', slotBlockDocId(date, time))
    );

    const dayBlock = activeBlock(dayBlockDoc);
    const slotBlock = activeBlock(slotBlockDoc);

    if (dayBlock) {
      return json({
        ok: false,
        error: dayBlock.reason || dayBlock.title || 'Ese día está bloqueado en la agenda.',
      }, 409);
    }

    if (slotBlock) {
      return json({
        ok: false,
        error: slotBlock.reason || slotBlock.title || 'Ese horario está bloqueado en la agenda.',
      }, 409);
    }

    const existingBooking = await getFirestoreDoc(
      env,
      accessToken,
      userSubDocPath(env, user.uid, 'academy_bookings', bookingId)
    );

    if (existingBooking) {
      const data = fromFirestoreFields(existingBooking.fields || {});

      if (String(data.status || '').toLowerCase() !== 'cancelled') {
        return json({ ok: false, error: 'Ya tienes esta clase agendada.' }, 409);
      }
    }

    const existingSlot = await getFirestoreDoc(
      env,
      accessToken,
      collectionDocPath(env, 'academy_slots', slotId)
    );

    if (existingSlot) {
      const data = fromFirestoreFields(existingSlot.fields || {});

      if (String(data.status || '').toLowerCase() !== 'cancelled') {
        return json({ ok: false, error: 'Ese horario acaba de ser reservado. Elige otro hueco.' }, 409);
      }
    }

    const now = new Date();
    const studentName = String(body?.studentName || body?.name || user.displayName || '').trim();
    const contactPhone = String(body?.phone || body?.contactPhone || '').trim();
    const notes = String(body?.notes || body?.message || '').trim().slice(0, 800);

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
      studentName,
      contactPhone,
      notes,
      createdAt: now,
      createdAtIso: now.toISOString(),
      updatedAt: now,
      updatedAtIso: now.toISOString(),
      source: 'web',
    };

    const internalBookingData = {
      ...bookingData,
      customerUid: user.uid,
      customerEmail: user.email,
      internalStatus: 'pending_review',
      adminNotes: '',
    };

    const slotData = {
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
    };

    const purchaseUpdate = {
      bookingStatus: course.totalClasses > 1 ? 'class_booked' : 'booked',
      lastBookingDate: date,
      lastBookingTime: time,
      lastBookedClassNumber: classNumber,
      lastBookingAt: now,
      updatedAt: now,
    };

    await commitWrites(env, accessToken, [
      createWrite(collectionDocPath(env, 'academy_slots', slotId), slotData),
      createWrite(userSubDocPath(env, user.uid, 'academy_bookings', bookingId), bookingData),
      createWrite(collectionDocPath(env, 'private_academy_bookings', bookingId), internalBookingData),
      updateWrite(purchasePath, purchaseUpdate),
    ]);

    return json({
      ok: true,
      booking: {
        id: bookingId,
        courseId,
        courseName: course.name,
        classNumber,
        totalClasses: course.totalClasses,
        date,
        time,
        status: 'booked',
      },
    });
  } catch (err) {
    const status = err.status || 500;

    return json({
      ok: false,
      error: err.message || 'Error agendando clase.',
    }, status);
  }
}

function activeBlock(doc) {
  if (!doc) return null;

  const data = fromFirestoreFields(doc.fields || {});

  if (!data) return null;

  const status = String(data.status || 'blocked').toLowerCase();

  if (status !== 'blocked') return null;

  return data;
}

function slotDocId(date, time) {
  return `${date}_${String(time || '').replace(':', '')}`;
}

function dayBlockDocId(date) {
  return `${date}_day`;
}

function slotBlockDocId(date, time) {
  return `${date}_${String(time || '').replace(':', '')}`;
}

function isWeekendDate(dateText) {
  const [year, month, day] = String(dateText || '').split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();

  return weekday === 0 || weekday === 6;
}

function isPastMadridSlot(dateText, timeText) {
  const now = getMadridNowParts();
  const minutes = timeToMinutes(timeText);

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

  parts.forEach(part => {
    if (part.type !== 'literal') map[part.type] = part.value;
  });

  return {
    date: `${map.year}-${map.month}-${map.day}`,
    minutes: Number(map.hour || 0) * 60 + Number(map.minute || 0),
  };
}

function timeToMinutes(timeText) {
  const [hour, minute] = String(timeText || '').split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

async function verifyFirebaseToken(idToken, firebaseApiKey) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    throw new Error('Token inválido o expirado');
  }

  const data = await res.json();
  const user = data.users?.[0];

  if (!user?.localId || !user?.email) {
    throw new Error('Usuario no válido');
  }

  return {
    uid: user.localId,
    email: normalizeEmail(user.email),
    displayName: user.displayName || '',
  };
}

async function getFirestoreDoc(env, accessToken, documentPath) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${documentPath}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 404) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error?.message || 'No se pudo leer Firestore');
  }

  return data;
}

async function commitWrites(env, accessToken, writes) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data.error?.message || 'No se pudo guardar la reserva.';

    if (message.includes('already exists') || message.includes('ALREADY_EXISTS')) {
      throw new HttpError('Ese horario acaba de ser reservado. Elige otro hueco.', 409);
    }

    throw new Error(message);
  }

  return data;
}

function createWrite(documentPath, data) {
  return {
    update: {
      name: documentPath,
      fields: toFirestoreFields(data),
    },
    currentDocument: {
      exists: false,
    },
  };
}

function updateWrite(documentPath, data) {
  return {
    update: {
      name: documentPath,
      fields: toFirestoreFields(data),
    },
    updateMask: {
      fieldPaths: Object.keys(data),
    },
  };
}

function userSubDocPath(env, uid, subcollection, docId) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/artifacts/${APP_ID}/public/data/users/${uid}/${subcollection}/${docId}`;
}

function collectionDocPath(env, collectionName, docId) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}`;
}

async function getFirebaseAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const jwt = await signJwt(header, payload, env.FIREBASE_PRIVATE_KEY);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || 'No se pudo autenticar con Firebase');
  }

  return data.access_token;
}

async function signJwt(header, payload, privateKey) {
  const enc = new TextEncoder();

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    enc.encode(unsigned)
  );

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

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function base64Url(input) {
  let bytes;

  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }

  let binary = '';

  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function toFirestoreFields(data) {
  const fields = {};

  Object.entries(data || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      fields[key] = toFirestoreValue(value);
    }
  });

  return fields;
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };

  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue),
      },
    };
  }

  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: toFirestoreFields(value),
      },
    };
  }

  return { stringValue: String(value) };
}

function fromFirestoreFields(fields) {
  const out = {};

  Object.entries(fields || {}).forEach(([key, value]) => {
    out[key] = fromFirestoreValue(value);
  });

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

  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(fromFirestoreValue);
  }

  if ('mapValue' in value) {
    return fromFirestoreFields(value.mapValue.fields || {});
  }

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

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
