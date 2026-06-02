const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const COURSES = {
  'diagnostico-ia': {
    id: 'diagnostico-ia',
    name: 'Diagnóstico IA 1 a 1',
    stripePriceId: 'price_1TdohxQ4M7vfTU0LkPEDbA01',
  },
  'ia-express-1a1': {
    id: 'ia-express-1a1',
    name: 'Curso IA Express 1 a 1',
    stripePriceId: 'price_1TdokqQ4M7vfTU0L0cwq4MPp',
  },
  'ia-creador': {
    id: 'ia-creador',
    name: 'Curso IA Creador',
    stripePriceId: 'price_1TdomEQ4M7vfTU0Lc8jiVsbp',
  },
  'ia-profesional': {
    id: 'ia-profesional',
    name: 'Curso IA Profesional',
    stripePriceId: 'price_1TdonMQ4M7vfTU0LGjqa3kkQ',
  },
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    return new Response('Checkout Academia KreateIA activo', {
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
    requireEnv(env, ['FIREBASE_API_KEY']);

    const stripeSecret = env.STRIPE_SECRET_KEY || env.STRIPE_SECRET;

    if (!stripeSecret) {
      throw new Error('Falta STRIPE_SECRET_KEY en Cloudflare');
    }

    const idToken = getBearerToken(request);

    if (!idToken) {
      return json({ ok: false, error: 'Debes iniciar sesión para comprar este curso.' }, 401);
    }

    const user = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);

    const body = await request.json().catch(() => null);
    const courseId = String(body?.courseId || '').trim();
    const course = COURSES[courseId];

    if (!course) {
      return json({ ok: false, error: 'Curso no válido' }, 400);
    }

    const origin = getSiteOrigin(request, env);
    const successUrl = `${origin}/?academy_payment=success&courseId=${encodeURIComponent(course.id)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/?academy_payment=cancel&courseId=${encodeURIComponent(course.id)}`;

    const params = new URLSearchParams();

    params.set('mode', 'payment');
    params.set('line_items[0][price]', course.stripePriceId);
    params.set('line_items[0][quantity]', '1');

    params.set('success_url', successUrl);
    params.set('cancel_url', cancelUrl);

    params.set('client_reference_id', user.uid);
    params.set('customer_email', user.email);
    params.set('customer_creation', 'always');
    params.set('allow_promotion_codes', 'true');

    params.set('metadata[type]', 'academy_course');
    params.set('metadata[uid]', user.uid);
    params.set('metadata[email]', user.email);
    params.set('metadata[courseId]', course.id);
    params.set('metadata[courseName]', course.name);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const stripeData = await stripeRes.json().catch(() => ({}));

    if (!stripeRes.ok) {
      throw new Error(stripeData.error?.message || 'No se pudo crear el pago en Stripe');
    }

    return json({
      ok: true,
      checkoutUrl: stripeData.url,
      sessionId: stripeData.id,
      courseId: course.id,
    });
  } catch (err) {
    return json({
      ok: false,
      error: err.message || 'Error creando checkout Academia',
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
  };
}

function getBearerToken(request) {
  const header = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function getSiteOrigin(request, env) {
  const configured = String(env.PUBLIC_SITE_URL || env.SITE_URL || '').trim().replace(/\/$/, '');

  if (configured) {
    return configured;
  }

  const url = new URL(request.url);
  return url.origin;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
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
