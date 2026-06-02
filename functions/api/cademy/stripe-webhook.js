const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
};

const COURSES = {
  'diagnostico-ia': {
    id: 'diagnostico-ia',
    name: 'Diagnóstico IA 1 a 1',
    amount: 690,
  },
  'ia-express-1a1': {
    id: 'ia-express-1a1',
    name: 'Curso IA Express 1 a 1',
    amount: 14900,
  },
  'ia-creador': {
    id: 'ia-creador',
    name: 'Curso IA Creador',
    amount: 29900,
  },
  'ia-profesional': {
    id: 'ia-profesional',
    name: 'Curso IA Profesional',
    amount: 49000,
  },
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Método no permitido' }, 405);
  }

  try {
    requireEnv(env, [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
    ]);

    const webhookSecret = env.STRIPE_WEBHOOK_SECRET_ACADEMY || env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('Falta STRIPE_WEBHOOK_SECRET_ACADEMY en Cloudflare');
    }

    const signature = request.headers.get('Stripe-Signature') || '';
    const rawBody = await request.text();

    const valid = await verifyStripeSignature(rawBody, signature, webhookSecret);
    if (!valid) {
      return json({ ok: false, error: 'Firma Stripe inválida' }, 400);
    }

    const event = JSON.parse(rawBody);

    if (event.type !== 'checkout.session.completed') {
      return json({ ok: true, ignored: true, type: event.type });
    }

    const session = event.data && event.data.object ? event.data.object : {};
    const metadata = session.metadata || {};

    if (metadata.type !== 'academy_course') {
      return json({ ok: true, ignored: true, reason: 'No es compra de Academia' });
    }

    if (session.payment_status !== 'paid') {
      return json({ ok: true, ignored: true, reason: 'Pago no completado' });
    }

    const uid = normalizeId(metadata.uid);
    const email = normalizeEmail(metadata.email || session.customer_details?.email || session.customer_email);
    const courseId = normalizeCourseId(metadata.courseId);
    const course = COURSES[courseId];

    if (!uid) throw new Error('Falta uid en metadata');
    if (!email || !email.includes('@')) throw new Error('Falta email válido en metadata');
    if (!course) throw new Error('Curso no válido: ' + courseId);

    const appId = String(env.APP_ID || 'appiapvision').trim();
    const now = new Date().toISOString();
    const paidAt = session.created
      ? new Date(Number(session.created) * 1000).toISOString()
      : now;

    const purchase = {
      courseId: course.id,
      courseName: course.name,
      status: 'paid',
      accessStatus: 'active',
      bookingStatus: 'pending',
      canBook: true,

      uid,
      email,

      amount: Number(session.amount_total || course.amount || 0),
      currency: String(session.currency || 'eur').toLowerCase(),

      stripeSessionId: String(session.id || ''),
      stripeCustomerId: String(session.customer || ''),
      stripePaymentIntentId: String(session.payment_intent || ''),
      stripeEventId: String(event.id || ''),

      paidAt,
      createdAt: paidAt,
      updatedAt: now,
    };

    const order = {
      ...purchase,
      checkoutMode: String(session.mode || 'payment'),
      paymentStatus: String(session.payment_status || ''),
      rawAmountSubtotal: Number(session.amount_subtotal || 0),
      rawAmountTotal: Number(session.amount_total || 0),
    };

    const accessToken = await getServiceAccountToken(env, 'https://www.googleapis.com/auth/datastore');

    const userBasePath = `artifacts/${appId}/public/data/users/${uid}`;

    await commitWrites(env.FIREBASE_PROJECT_ID, accessToken, [
      {
        update: {
          name: docName(env.FIREBASE_PROJECT_ID, `${userBasePath}/academy_purchases/${course.id}`),
          fields: toFields(purchase),
        },
      },
      {
        update: {
          name: docName(env.FIREBASE_PROJECT_ID, `${userBasePath}/academy_orders/${session.id}`),
          fields: toFields(order),
        },
      },
      {
        update: {
          name: docName(env.FIREBASE_PROJECT_ID, userBasePath),
          fields: toFields({
            lastAcademyPurchase: {
              courseId: course.id,
              courseName: course.name,
              paidAt,
              updatedAt: now,
            },
          }),
        },
        updateMask: {
          fieldPaths: ['lastAcademyPurchase'],
        },
      },
    ]);

    return json({
      ok: true,
      courseId: course.id,
      uid,
    });
  } catch (err) {
    return json({ ok: false, error: err.message || 'Error procesando webhook Academia' }, 500);
  }
}

async function verifyStripeSignature(payload, signatureHeader, secret) {
  if (!payload || !signatureHeader || !secret) return false;

  const parts = signatureHeader.split(',').map(part => part.trim());
  const timestampPart = parts.find(part => part.startsWith('t='));
  const signatures = parts
    .filter(part => part.startsWith('v1='))
    .map(part => part.slice(3));

  if (!timestampPart || !signatures.length) return false;

  const timestamp = timestampPart.slice(2);
  const timestampNumber = Number(timestamp);

  if (!Number.isFinite(timestampNumber)) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampNumber);
  if (ageSeconds > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = await hmacSha256Hex(secret, signedPayload);

  return signatures.some(sig => safeEqual(sig, expected));
}

async function hmacSha256Hex(secret, message) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  );

  return [...new Uint8Array(signature)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');

  if (left.length !== right.length) return false;

  let result = 0;
  for (let i = 0; i < left.length; i++) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }

  return result === 0;
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

  const jwt = await signJWT(payload, env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    throw new Error('No se pudo obtener token de Google');
  }

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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeId(value) {
  const clean = String(value || '').trim();
  return /^[A-Za-z0-9_-]{3,160}$/.test(clean) ? clean : '';
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
