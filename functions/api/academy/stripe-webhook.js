const APP_ID = 'appiapvision';
const ANNUAL_GROUP_ID = 'ia-anual-viernes-2026';
const ANNUAL_CAPACITY = 12;

const GROUP_COURSE = {
  id: 'ia-anual-presencial-viernes',
  name: 'Curso Anual IA Presencial · Grupo Viernes',
  groupId: ANNUAL_GROUP_ID,
  scheduleLabel: 'Viernes de 17:00 a 20:00',
  startsAt: '2026-09-11',
  endsAt: '2027-06-25',
  capacity: ANNUAL_CAPACITY,
  giftLabel: 'Portátil de regalo promocional',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    return new Response('Webhook Academia KreateIA activo', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (request.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 });
  }

  try {
    requireEnv(env, [
      'STRIPE_WEBHOOK_SECRET_ACADEMY',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
    ]);

    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature') || '';
    const valid = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET_ACADEMY || env.STRIPE_WEBHOOK_SECRET);

    if (!valid) {
      return new Response('Firma inválida', { status: 400 });
    }

    const event = JSON.parse(rawBody);

    if (event.type !== 'checkout.session.completed') {
      return json({ ok: true, ignored: true });
    }

    const session = event.data?.object || {};
    const metadata = session.metadata || {};

    if (metadata.type !== 'academy_course') {
      return json({ ok: true, ignored: true });
    }

    if (session.payment_status && session.payment_status !== 'paid') {
      return json({ ok: true, ignored: true, reason: 'not_paid' });
    }

    const uid = String(metadata.uid || session.client_reference_id || '').trim();
    const email = normalizeEmail(metadata.email || session.customer_details?.email || session.customer_email || '');
    const courseId = String(metadata.courseId || '').trim();
    const courseName = String(metadata.courseName || '').trim();
    const courseMode = String(metadata.courseMode || 'one_to_one').trim();
    const groupId = String(metadata.groupId || '').trim();

    if (!uid || !email || !courseId) {
      return new Response('Faltan metadatos de academia', { status: 400 });
    }

    const accessToken = await getFirebaseAccessToken(env);
    const orderPath = userSubDocPath(env, uid, 'academy_orders', session.id);
    const existingOrder = await getFirestoreDoc(env, accessToken, orderPath);

    if (existingOrder) {
      return json({ ok: true, duplicate: true });
    }

    const now = new Date();
    const order = {
      id: session.id,
      type: 'academy_course',
      uid,
      email,
      courseId,
      courseName,
      courseMode,
      groupId: groupId || null,
      amountTotal: Number(session.amount_total || 0),
      currency: session.currency || 'eur',
      paymentStatus: session.payment_status || 'paid',
      stripeCustomerId: session.customer || null,
      stripePaymentIntentId: session.payment_intent || null,
      stripeCheckoutSessionId: session.id,
      createdAt: now,
      createdAtIso: now.toISOString(),
    };

    const purchase = {
      id: courseId,
      uid,
      email,
      courseId,
      courseName,
      courseMode,
      groupId: groupId || null,
      status: 'paid',
      paymentStatus: 'paid',
      bookingStatus: courseMode === 'group' ? 'group_reserved' : 'pending_booking',
      amountTotal: Number(session.amount_total || 0),
      currency: session.currency || 'eur',
      stripeCheckoutSessionId: session.id,
      paidAt: now,
      paidAtIso: now.toISOString(),
      updatedAt: now,
      updatedAtIso: now.toISOString(),
    };

    const writes = [
      createWrite(orderPath, order),
      updateWrite(userSubDocPath(env, uid, 'academy_purchases', courseId), purchase),
      updateWrite(userDocPath(env, uid), {
        lastAcademyPurchase: {
          courseId,
          courseName,
          courseMode,
          paidAt: now.toISOString(),
        },
        updatedAt: now,
      }),
    ];

    if (courseMode === 'group' && groupId === ANNUAL_GROUP_ID) {
      const enrollments = await listCollection(env, accessToken, 'academy_group_enrollments');
      const active = enrollments.filter(item => {
        return item.groupId === ANNUAL_GROUP_ID
          && ['paid', 'enrolled', 'active'].includes(String(item.status || '').toLowerCase());
      });

      if (active.length >= ANNUAL_CAPACITY) {
        writes.push(updateWrite(userSubDocPath(env, uid, 'academy_purchases', courseId), {
          ...purchase,
          status: 'paid_manual_review',
          bookingStatus: 'manual_review_capacity',
          internalNote: 'Pago recibido cuando el grupo aparecía completo. Revisar manualmente.',
        }));
      } else {
        const enrollmentId = `${ANNUAL_GROUP_ID}_${uid}`;
        writes.push(
          updateWrite(collectionDocPath(env, 'academy_group_courses', ANNUAL_GROUP_ID), {
            id: ANNUAL_GROUP_ID,
            courseId: GROUP_COURSE.id,
            name: GROUP_COURSE.name,
            scheduleLabel: GROUP_COURSE.scheduleLabel,
            startsAt: GROUP_COURSE.startsAt,
            endsAt: GROUP_COURSE.endsAt,
            capacity: GROUP_COURSE.capacity,
            giftLabel: GROUP_COURSE.giftLabel,
            status: 'active',
            updatedAt: now,
          }),
          createWrite(collectionDocPath(env, 'academy_group_enrollments', enrollmentId), {
            id: enrollmentId,
            groupId: ANNUAL_GROUP_ID,
            courseId,
            courseName,
            uid,
            email,
            status: 'paid',
            scheduleLabel: GROUP_COURSE.scheduleLabel,
            startsAt: GROUP_COURSE.startsAt,
            endsAt: GROUP_COURSE.endsAt,
            giftLabel: GROUP_COURSE.giftLabel,
            stripeCheckoutSessionId: session.id,
            amountTotal: Number(session.amount_total || 0),
            createdAt: now,
            createdAtIso: now.toISOString(),
            updatedAt: now,
            updatedAtIso: now.toISOString(),
          })
        );
      }
    }

    await commitWrites(env, accessToken, writes);

    return json({ ok: true });
  } catch (err) {
    return new Response(err.message || 'Webhook error', { status: 400 });
  }
}

async function verifyStripeSignature(payload, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map(part => {
      const [key, value] = part.split('=');
      return [key, value];
    })
  );

  if (!parts.t || !parts.v1) return false;

  const signedPayload = `${parts.t}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  return timingSafeEqual(bytesToHex(new Uint8Array(sig)), parts.v1);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
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

async function listCollection(env, accessToken, collectionName) {
  const res = await fetch(`${firestoreBase(env)}/${collectionName}?pageSize=1000`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return [];
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `No se pudo leer ${collectionName}`);
  return (data.documents || []).map(doc => ({ id: String(doc.name || '').split('/').pop(), ...fromFields(doc.fields || {}) }));
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

function createWrite(documentPath, data) {
  return {
    update: { name: documentPath, fields: toFields(data) },
    currentDocument: { exists: false },
  };
}

function updateWrite(documentPath, data) {
  return {
    update: { name: documentPath, fields: toFields(data) },
  };
}

function userDocPath(env, uid) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/artifacts/${APP_ID}/public/data/users/${uid}`;
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
    headers: { 'Content-Type': 'application/json' },
  });
}
