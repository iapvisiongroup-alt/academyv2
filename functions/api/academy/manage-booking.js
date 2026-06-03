const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const APP_ID = 'appiapvision';
const ALLOWED_TIMES = ['10:00', '12:00', '17:00', '19:00'];
const CHANGE_LIMIT_HOURS = 24;
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

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    return new Response('Gestión reservas Academia KreateIA activa', {
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
      return json({ ok: false, error: 'Debes iniciar sesión.' }, 401);
    }

    const user = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
    const body = await request.json().catch(() => null);
    const action = String(body?.action || '').trim();
    const bookingId = safeDocId(body?.bookingId || body?.id || '');

    if (!bookingId) {
      return json({ ok: false, error: 'Falta bookingId.' }, 400);
    }

    const accessToken = await getFirebaseAccessToken(env);
    const isAdminAction = action === 'admin_cancel' || action === 'admin_reschedule';

    if (isAdminAction) {
      const allowed = await isPrivateAllowed(env, accessToken, user.email);

      if (!allowed) {
        return json({ ok: false, error: 'No tienes permiso para gestionar reservas internas.' }, 403);
      }
    }

    if (action === 'cancel' || action === 'admin_cancel') {
      return await cancelBooking({ env, accessToken, user, bookingId, body, isAdminAction });
    }

    if (action === 'reschedule' || action === 'admin_reschedule') {
      return await rescheduleBooking({ env, accessToken, user, bookingId, body, isAdminAction });
    }

    return json({ ok: false, error: 'Acción no válida.' }, 400);
  } catch (err) {
    return json({
      ok: false,
      error: err.message || 'Error gestionando reserva.',
    }, err.status || 500);
  }
}

async function cancelBooking({ env, accessToken, user, bookingId, body, isAdminAction }) {
  const loaded = await loadBooking(env, accessToken, user, bookingId, isAdminAction);
  const { booking, uid, userBookingPath, privateBookingPath, privateBookingExists } = loaded;

  if (!isAdminAction && !canChangeBooking(booking)) {
    return json({
      ok: false,
      error: `Solo puedes cancelar o cambiar una clase hasta ${CHANGE_LIMIT_HOURS}h antes.`,
    }, 403);
  }

  const now = new Date();
  const reason = String(body?.reason || body?.cancelReason || '').trim().slice(0, 500);
  const slotId = booking.slotId || slotDocId(booking.date, booking.time);
  const slotPath = collectionDocPath(env, 'academy_slots', slotId);
  const privateCancelData = {
    status: 'cancelled',
    internalStatus: isAdminAction ? 'admin_cancelled' : 'student_cancelled',
    cancelledBy: isAdminAction ? normalizeEmail(user.email) : 'student',
    cancelReason: reason,
    cancelledAt: now,
    cancelledAtIso: now.toISOString(),
    updatedAt: now,
    updatedAtIso: now.toISOString(),
  };

  const writes = [
    privateBookingExists
      ? updateWrite(privateBookingPath, privateCancelData)
      : upsertWrite(privateBookingPath, buildPrivateBookingFallback(booking, uid, bookingId, privateCancelData)),
    deleteWrite(slotPath),
  ];

  if (userBookingPath) {
    writes.unshift(updateWrite(userBookingPath, {
      status: 'cancelled',
      cancelledBy: isAdminAction ? 'admin' : 'student',
      cancelReason: reason,
      cancelledAt: now,
      cancelledAtIso: now.toISOString(),
      updatedAt: now,
      updatedAtIso: now.toISOString(),
    }));
  }

  await commitWrites(env, accessToken, writes);

  if (userBookingPath) await updatePurchaseAfterChange(env, accessToken, uid, booking.courseId, {
    bookingStatus: 'cancelled',
    lastCancelledBookingId: bookingId,
    lastCancelledAt: now,
    updatedAt: now,
  }).catch(() => {});

  return json({
    ok: true,
    action: 'cancelled',
    bookingId,
    releasedSlotId: slotId,
  });
}

async function rescheduleBooking({ env, accessToken, user, bookingId, body, isAdminAction }) {
  const loaded = await loadBooking(env, accessToken, user, bookingId, isAdminAction);
  const { booking, uid, userBookingPath, privateBookingPath, privateBookingExists } = loaded;

  if (!isAdminAction && !canChangeBooking(booking)) {
    return json({
      ok: false,
      error: `Solo puedes cambiar una clase hasta ${CHANGE_LIMIT_HOURS}h antes.`,
    }, 403);
  }

  const newDate = String(body?.newDate || body?.date || '').trim();
  const newTime = String(body?.newTime || body?.time || '').trim();

  validateSlotInput(newDate, newTime);

  if (isPastMadridSlot(newDate, newTime)) {
    return json({ ok: false, error: 'No puedes reservar una hora pasada.' }, 400);
  }

  if (isWeekendDate(newDate)) {
    return json({ ok: false, error: 'Ese día no está disponible.' }, 400);
  }

  if (NATIONAL_HOLIDAYS[newDate]) {
    return json({ ok: false, error: `Ese día es festivo nacional: ${NATIONAL_HOLIDAYS[newDate]}.` }, 400);
  }

  if (isAnnualGroupSlot(newDate, newTime)) {
    return json({ ok: false, error: 'Ese viernes por la tarde está reservado para el Curso Anual IA Online por Zoom.' }, 409);
  }

  const oldSlotId = booking.slotId || slotDocId(booking.date, booking.time);
  const newSlotId = slotDocId(newDate, newTime);

  if (oldSlotId === newSlotId) {
    return json({ ok: false, error: 'Elige un horario diferente.' }, 400);
  }

  const dayBlock = activeBlock(await getFirestoreDoc(
    env,
    accessToken,
    collectionDocPath(env, 'academy_availability_blocks', dayBlockDocId(newDate))
  ));

  const slotBlock = activeBlock(await getFirestoreDoc(
    env,
    accessToken,
    collectionDocPath(env, 'academy_availability_blocks', slotBlockDocId(newDate, newTime))
  ));

  if (dayBlock) {
    return json({ ok: false, error: dayBlock.reason || dayBlock.title || 'Ese día está bloqueado.' }, 409);
  }

  if (slotBlock) {
    return json({ ok: false, error: slotBlock.reason || slotBlock.title || 'Ese horario está bloqueado.' }, 409);
  }

  const existingNewSlot = activeSlot(await getFirestoreDoc(env, accessToken, collectionDocPath(env, 'academy_slots', newSlotId)));

  if (existingNewSlot) {
    return json({ ok: false, error: 'Ese horario ya está reservado.' }, 409);
  }

  const now = new Date();
  const oldDate = booking.date || '';
  const oldTime = booking.time || '';

  const slotData = {
    id: newSlotId,
    date: newDate,
    time: newTime,
    status: 'booked',
    uid,
    email: booking.email || booking.customerEmail || user.email,
    courseId: booking.courseId || '',
    courseName: booking.courseName || '',
    classNumber: Number(booking.classNumber || 1),
    bookingId,
    createdAt: now,
    createdAtIso: now.toISOString(),
  };

  const privateRescheduleData = {
      date: newDate,
      time: newTime,
      slotId: newSlotId,
      status: 'booked',
      internalStatus: 'rescheduled',
      previousDate: oldDate,
      previousTime: oldTime,
      rescheduledBy: isAdminAction ? normalizeEmail(user.email) : 'student',
      rescheduledAt: now,
      rescheduledAtIso: now.toISOString(),
      updatedAt: now,
      updatedAtIso: now.toISOString(),
  };

  const writes = [
    createWrite(collectionDocPath(env, 'academy_slots', newSlotId), slotData),
    deleteWrite(collectionDocPath(env, 'academy_slots', oldSlotId)),
    privateBookingExists
      ? updateWrite(privateBookingPath, privateRescheduleData)
      : upsertWrite(privateBookingPath, buildPrivateBookingFallback(booking, uid, bookingId, privateRescheduleData)),
  ];

  if (userBookingPath) {
    writes.splice(2, 0, updateWrite(userBookingPath, {
      date: newDate,
      time: newTime,
      slotId: newSlotId,
      status: 'booked',
      previousDate: oldDate,
      previousTime: oldTime,
      rescheduledBy: isAdminAction ? 'admin' : 'student',
      rescheduledAt: now,
      rescheduledAtIso: now.toISOString(),
      updatedAt: now,
      updatedAtIso: now.toISOString(),
    }));
  }

  await commitWrites(env, accessToken, writes);

  if (userBookingPath) await updatePurchaseAfterChange(env, accessToken, uid, booking.courseId, {
    bookingStatus: 'rescheduled',
    lastBookingDate: newDate,
    lastBookingTime: newTime,
    lastBookingAt: now,
    updatedAt: now,
  }).catch(() => {});

  return json({
    ok: true,
    action: 'rescheduled',
    bookingId,
    oldSlotId,
    newSlotId,
    booking: {
      id: bookingId,
      date: newDate,
      time: newTime,
      courseId: booking.courseId || '',
      courseName: booking.courseName || '',
      classNumber: Number(booking.classNumber || 1),
      status: 'booked',
    },
  });
}

async function loadBooking(env, accessToken, user, bookingId, isAdminAction) {
  let uid = user.uid;
  let privateBookingPath = collectionDocPath(env, 'private_academy_bookings', bookingId);
  let privateDoc = await getFirestoreDoc(env, accessToken, privateBookingPath);
  let privateBooking = privateDoc ? fromFirestoreFields(privateDoc.fields || {}) : null;

  if (isAdminAction) {
    if (!privateBooking) {
      throw new HttpError('No se encontró la reserva interna.', 404);
    }

    uid = privateBooking.uid || privateBooking.customerUid || '';
  }

  const userBookingPath = uid ? userSubDocPath(env, uid, 'academy_bookings', bookingId) : '';
  const userDoc = userBookingPath ? await getFirestoreDoc(env, accessToken, userBookingPath) : null;

  if (!userDoc && !isAdminAction) {
    throw new HttpError('No se encontró la reserva.', 404);
  }

  const booking = userDoc ? fromFirestoreFields(userDoc.fields || {}) : privateBooking;

  if (String(booking.status || '').toLowerCase() === 'cancelled') {
    throw new HttpError('Esta reserva ya está cancelada.', 409);
  }

  if (!isAdminAction && uid !== user.uid) {
    throw new HttpError('No puedes modificar esta reserva.', 403);
  }

  if (!privateBooking) {
    privateBooking = booking;
  }

  return {
    booking: {
      ...privateBooking,
      ...booking,
    },
    uid,
    userBookingPath: userDoc ? userBookingPath : '',
    privateBookingPath,
    privateBookingExists: !!privateDoc,
  };
}

async function isPrivateAllowed(env, accessToken, email) {
  const normalized = normalizeEmail(email);

  if (normalized === 'info@iapvision.com' || normalized === 'info@kreateia.com') {
    return true;
  }

  const allowedDoc = await getFirestoreDoc(
    env,
    accessToken,
    collectionDocPath(env, 'private_allowed_users', normalized)
  );

  if (!allowedDoc) return false;

  const data = fromFirestoreFields(allowedDoc.fields || {});

  return data.active === true;
}

function canChangeBooking(booking) {
  const classMs = madridWallTimeToUtcMs(booking.date, booking.time);

  if (!classMs) return false;

  return classMs - Date.now() >= CHANGE_LIMIT_HOURS * 60 * 60 * 1000;
}

function madridWallTimeToUtcMs(dateText, timeText) {
  const [year, month, day] = String(dateText || '').split('-').map(Number);
  const [hour, minute] = String(timeText || '').split(':').map(Number);

  if (!year || !month || !day || Number.isNaN(hour)) return 0;

  const guess = Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0);
  const offset = getTimeZoneOffsetMs('Europe/Madrid', new Date(guess));

  return guess - offset;
}

function getTimeZoneOffsetMs(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map = {};

  parts.forEach(part => {
    if (part.type !== 'literal') map[part.type] = part.value;
  });

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );

  return asUtc - date.getTime();
}

function validateSlotInput(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError('Fecha no válida.', 400);
  }

  if (!ALLOWED_TIMES.includes(time)) {
    throw new HttpError('Horario no válido.', 400);
  }
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

function activeBlock(doc) {
  if (!doc) return null;

  const data = fromFirestoreFields(doc.fields || {});
  const status = String(data.status || 'blocked').toLowerCase();

  if (status !== 'blocked') return null;

  return data;
}

function activeSlot(doc) {
  if (!doc) return null;

  const data = fromFirestoreFields(doc.fields || {});
  const status = String(data.status || 'booked').toLowerCase();

  if (['cancelled', 'canceled', 'released', 'deleted'].includes(status)) return null;

  return data;
}

function buildPrivateBookingFallback(booking, uid, bookingId, extraData) {
  const now = new Date();

  return {
    ...booking,
    ...extraData,
    id: bookingId,
    uid,
    customerUid: booking.customerUid || uid,
    customerEmail: booking.customerEmail || booking.email || '',
    email: booking.email || booking.customerEmail || '',
    internalStatus: extraData.internalStatus || booking.internalStatus || 'synced_from_user_booking',
    restoredPrivateCopy: true,
    restoredPrivateCopyAt: now,
    restoredPrivateCopyAtIso: now.toISOString(),
  };
}

function slotDocId(date, time) {
  return `${date}_${String(time || '').replace(':', '')}`;
}

function isAnnualGroupSlot(date, time) {
  if (date < ANNUAL_GROUP_START || date > ANNUAL_GROUP_END) return false;
  if (!ANNUAL_GROUP_TIMES.has(time)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 5;
}

function dayBlockDocId(date) {
  return `${date}_day`;
}

function slotBlockDocId(date, time) {
  return `${date}_${String(time || '').replace(':', '')}`;
}

async function updatePurchaseAfterChange(env, accessToken, uid, courseId, data) {
  if (!uid || !courseId) return;

  await commitWrites(env, accessToken, [
    updateWrite(userSubDocPath(env, uid, 'academy_purchases', courseId), data),
  ]);
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
    const message = data.error?.message || 'No se pudo guardar el cambio.';

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

function upsertWrite(documentPath, data) {
  return {
    update: {
      name: documentPath,
      fields: toFirestoreFields(data),
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
    currentDocument: {
      exists: true,
    },
  };
}

function deleteWrite(documentPath) {
  return {
    delete: documentPath,
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
      'Cache-Control': 'no-store',
    },
  });
}

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
