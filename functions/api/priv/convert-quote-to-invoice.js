const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return jsonError('Método no permitido', 405);

  try {
    requireEnv(env, [
      'FIREBASE_API_KEY',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
    ]);

    const idToken = getBearerToken(request);
    if (!idToken) return jsonError('No autenticado', 401);

    const staff = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
    const accessToken = await getServiceAccountToken(env, 'https://www.googleapis.com/auth/datastore');

    const allowed = await isAllowedStaff(env.FIREBASE_PROJECT_ID, accessToken, staff.email);
    if (!allowed) return jsonError('Email no autorizado', 403);

    const body = await request.json().catch(() => null);
    const quoteId = String(body?.quoteId || '').trim();
    if (!quoteId) return jsonError('Falta quoteId', 400);

    const quoteDoc = await getDoc(env.FIREBASE_PROJECT_ID, `private_quotes/${quoteId}`, accessToken);
    const quote = quoteDoc.data;

    if (quote.convertedInvoiceId) {
      return jsonError('Este presupuesto ya fue convertido en factura', 409);
    }

    const payload = normalizeInvoiceFromQuote(body, quote, staff);
    payload.issuer = quote.issuer || {
      name: env.SERVICES_COMPANY_NAME || env.COMPANY_NAME || 'KreateIA',
      taxId: env.SERVICES_COMPANY_TAX_ID || env.COMPANY_TAX_ID || '',
      address: env.SERVICES_COMPANY_ADDRESS || env.COMPANY_ADDRESS || '',
      email: env.SERVICES_COMPANY_EMAIL || env.GMAIL_SENDER || '',
    };

    const result = await createInvoiceFromQuoteWithCounter(
      env.FIREBASE_PROJECT_ID,
      accessToken,
      payload,
      quote,
      quoteId,
    );

    return json({ ok: true, invoice: result.invoice, quote: result.quote });
  } catch (err) {
    return jsonError(err.message || 'Error convirtiendo presupuesto', 500);
  }
}

function normalizeInvoiceFromQuote(body, quote, staff) {
  if ((quote.serviceType || '') !== 'Servicios IA') {
    throw new Error('Solo se convierten presupuestos de Servicios IA');
  }

  if (!quote.client?.email) {
    throw new Error('El presupuesto no tiene datos de cliente');
  }

  const now = new Date().toISOString();
  const issueDate = String(body.issueDate || now.slice(0, 10)).slice(0, 10);

  const notes = [
    quote.notes || '',
    `Factura emitida a partir del presupuesto ${quote.quoteNumber || quote.id}.`,
  ].filter(Boolean).join('\n');

  return {
    serviceType: 'Servicios IA',
    concept: String(quote.concept || '').trim().slice(0, 240),
    notes: String(notes).slice(0, 1200),
    issueDate,
    paymentMethod: normalizePaymentMethod(body.paymentMethod),
    paymentStatus: normalizePaymentStatus(body.paymentStatus),
    paidAt: normalizePaymentStatus(body.paymentStatus) === 'Pagado' ? now.slice(0, 10) : null,
    appointment: null,
    taxRate: Number(quote.taxRate || 21),
    taxLabel: `IVA ${Number(quote.taxRate || 21)}%`,
    baseCents: Number(quote.baseCents || 0),
    taxCents: Number(quote.taxCents || 0),
    totalCents: Number(quote.totalCents || 0),
    signatureDataUrl: String(body.signatureDataUrl || quote.signatureDataUrl || ''),
    client: {
      fullName: String(quote.client.fullName || '').trim().slice(0, 180),
      taxId: String(quote.client.taxId || '').trim().slice(0, 60),
      address: String(quote.client.address || '').trim().slice(0, 320),
      phone: String(quote.client.phone || '').trim().slice(0, 80),
      email: normalizeEmail(quote.client.email),
    },
    sourceQuoteId: quote.id || '',
    sourceQuoteNumber: quote.quoteNumber || '',
    createdAt: now,
    createdBy: {
      uid: staff.uid,
      email: staff.email,
    },
  };
}

function normalizePaymentMethod(value) {
  const allowed = new Set(['Efectivo', 'TPV / Tarjeta', 'Transferencia', 'Bizum', 'Pendiente']);
  const clean = String(value || '').trim();
  return allowed.has(clean) ? clean : 'Pendiente';
}

function normalizePaymentStatus(value) {
  return String(value || '').trim() === 'Pagado' ? 'Pagado' : 'Pendiente';
}

async function createInvoiceFromQuoteWithCounter(projectId, accessToken, payload, quote, quoteId, attempt = 0) {
  if (attempt > 5) {
    throw new Error('No se pudo reservar número de factura. Inténtalo de nuevo.');
  }

  const counterPath = 'private_counters/invoices';
  const counterDoc = await getDoc(projectId, counterPath, accessToken, true);

  const lastNumber = counterDoc.exists ? Number(counterDoc.data.lastNumber || 0) : 0;
  const nextNumber = lastNumber + 1;
  const padded = String(nextNumber).padStart(5, '0');

  const invoiceNumber = `KIA-${padded}`;
  const invoiceId = invoiceNumber;
  const clientId = normalizeClientId(quote.clientId) || `client_${padded}`;
  const now = new Date().toISOString();

  const invoice = {
    id: invoiceId,
    invoiceNumber,
    clientId,
    ...payload,
    updatedAt: now,
    emailSentAt: null,
  };

  const updatedQuote = {
    status: 'Aceptado',
    acceptedAt: now,
    convertedInvoiceId: invoiceId,
    convertedInvoiceNumber: invoiceNumber,
    updatedAt: now,
  };

  const clientFields = {
    id: clientId,
    ...payload.client,
    serviceType: 'Servicios IA',
    lastConcept: payload.concept,
    lastInvoiceNumber: invoiceNumber,
    lastQuoteNumber: quote.quoteNumber || quoteId,
    lastQuoteConcept: payload.concept,
    agreementText: 'El cliente acepta el presupuesto indicado y se emite la factura correspondiente al servicio IA contratado.',
    archivedAt: null,
    updatedAt: now,
  };

  const clientFieldPaths = [
    'id',
    'fullName',
    'taxId',
    'address',
    'phone',
    'email',
    'serviceType',
    'lastConcept',
    'lastInvoiceNumber',
    'lastQuoteNumber',
    'lastQuoteConcept',
    'agreementText',
    'archivedAt',
    'updatedAt',
  ];

  if (payload.signatureDataUrl) {
    clientFields.signatureDataUrl = payload.signatureDataUrl;
    clientFields.lastSignatureAt = payload.createdAt;
    clientFieldPaths.push('signatureDataUrl', 'lastSignatureAt');
  }

  const writes = [
    {
      update: {
        name: docName(projectId, counterPath),
        fields: toFields({ lastNumber: nextNumber, updatedAt: now }),
      },
      updateMask: { fieldPaths: ['lastNumber', 'updatedAt'] },
      ...(counterDoc.updateTime ? { currentDocument: { updateTime: counterDoc.updateTime } } : {}),
    },
    {
      update: {
        name: docName(projectId, `private_clients/${clientId}`),
        fields: toFields(clientFields),
      },
      updateMask: { fieldPaths: clientFieldPaths },
    },
    {
      update: {
        name: docName(projectId, `private_invoices/${invoiceId}`),
        fields: toFields(invoice),
      },
    },
    {
      update: {
        name: docName(projectId, `private_quotes/${quoteId}`),
        fields: toFields(updatedQuote),
      },
      updateMask: {
        fieldPaths: [
          'status',
          'acceptedAt',
          'convertedInvoiceId',
          'convertedInvoiceNumber',
          'updatedAt',
        ],
      },
    },
  ];

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

    if (
      res.status === 409 ||
      text.includes('FAILED_PRECONDITION') ||
      text.includes('ABORTED')
    ) {
      await sleep(120 + attempt * 100);
      return createInvoiceFromQuoteWithCounter(projectId, accessToken, payload, quote, quoteId, attempt + 1);
    }

    throw new Error(`Firestore commit: ${res.status} ${text.slice(0, 180)}`);
  }

  return {
    invoice,
    quote: { ...quote, ...updatedQuote },
  };
}

async function isAllowedStaff(projectId, accessToken, email) {
  const doc = await getDoc(projectId, `private_allowed_users/${normalizeEmail(email)}`, accessToken, true);
  return doc.exists && doc.data.active === true;
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

  if (!user?.localId || !user?.email) {
    throw new Error('Token inválido');
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

  const jwt = await signJWT(payload, env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
    ['sign'],
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );

  return `${unsigned}.${b64uBytes(new Uint8Array(sig))}`;
}

async function getDoc(projectId, path, accessToken, allowMissing = false) {
  const res = await fetch(`${firestoreBase(projectId)}/${encodePath(path)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
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
  Object.entries(obj).forEach(([k, v]) => {
    fields[k] = toValue(v);
  });
  return fields;
}

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}

function fromFields(fields) {
  const obj = {};
  Object.entries(fields).forEach(([k, v]) => {
    obj[k] = fromValue(v);
  });
  return obj;
}

function fromValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
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

function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeClientId(id) {
  const clean = String(id || '').trim();
  return /^[A-Za-z0-9_-]{3,140}$/.test(clean) ? clean : '';
}

function requireEnv(env, keys) {
  const missing = keys.filter(k => !env[k]);
  if (missing.length) {
    throw new Error('Faltan variables: ' + missing.join(', '));
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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

function jsonError(error, status = 400) {
  return json({ ok: false, error }, status);
}
