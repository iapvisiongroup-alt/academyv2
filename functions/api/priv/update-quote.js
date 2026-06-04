const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return jsonError('Metodo no permitido', 405);

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
    if (!body) return jsonError('Body JSON invalido', 400);

    const quoteId = normalizeDocId(body.quoteId);
    if (!quoteId) return jsonError('Falta quoteId', 400);

    const quoteDoc = await getDoc(env.FIREBASE_PROJECT_ID, `private_quotes/${quoteId}`, accessToken);
    const oldQuote = quoteDoc.data || {};

    if (oldQuote.convertedInvoiceId) {
      return jsonError('No se puede editar un presupuesto que ya tiene factura.', 409);
    }

    const payload = normalizeQuotePayload(body, staff, oldQuote);
    const quote = await updateQuote(env.FIREBASE_PROJECT_ID, accessToken, quoteId, oldQuote, payload);

    return json({ ok: true, quote });
  } catch (err) {
    return jsonError(err.message || 'Error actualizando presupuesto', 500);
  }
}

function normalizeQuotePayload(body, staff, oldQuote) {
  const lineItems = normalizeLineItems(body);
  const baseCents = lineItems.reduce((sum, item) => sum + item.totalCents, 0);
  if (!Number.isFinite(baseCents) || baseCents <= 0) throw new Error('Importe base invalido');

  const client = body.client || {};
  const clientEmail = normalizeEmail(client.email);
  if (!client.fullName || !clientEmail || !clientEmail.includes('@')) throw new Error('Faltan datos del cliente');

  const concept = normalizeConcept(body.concept, lineItems);
  if (!concept) throw new Error('Falta el concepto del presupuesto');

  const taxRate = 21;
  const taxCents = Math.round(baseCents * taxRate / 100);
  const totalCents = baseCents + taxCents;
  const now = new Date().toISOString();
  const issueDate = String(body.issueDate || oldQuote.issueDate || now.slice(0, 10)).slice(0, 10);
  const validUntil = normalizeDate(body.validUntil) || oldQuote.validUntil || addDays(issueDate, 15);

  return {
    serviceType: 'Servicios IA',
    documentType: 'quote',
    status: oldQuote.status || 'Pendiente',
    concept,
    lineItems,
    notes: String(body.notes || '').trim().slice(0, 1200),
    issueDate,
    validUntil,
    taxRate,
    taxLabel: 'IVA 21%',
    baseCents,
    taxCents,
    totalCents,
    client: {
      fullName: String(client.fullName || '').trim().slice(0, 180),
      taxId: String(client.taxId || '').trim().slice(0, 60),
      address: String(client.address || '').trim().slice(0, 320),
      phone: String(client.phone || '').trim().slice(0, 80),
      email: clientEmail,
    },
    editedAt: now,
    editedBy: {
      uid: staff.uid,
      email: staff.email,
    },
    updatedAt: now,
    editedAfterEmail: !!oldQuote.emailSentAt,
  };
}

function normalizeLineItems(body) {
  const rawItems = Array.isArray(body.lineItems) ? body.lineItems : [];
  const items = rawItems.map((item, index) => {
    const quantity = Math.max(0, Number(item?.quantity || 0));
    const unitCents = Number.isFinite(Number(item?.unitCents))
      ? Math.round(Number(item.unitCents))
      : Math.round(Number(item?.unitAmount || 0) * 100);
    const totalCents = Number.isFinite(Number(item?.totalCents))
      ? Math.round(Number(item.totalCents))
      : Math.round(quantity * unitCents);
    const description = String(item?.description || '').trim().slice(0, 240);

    return {
      index: index + 1,
      description,
      quantity: quantity > 0 ? quantity : 1,
      unitCents,
      totalCents,
    };
  }).filter(item => item.description || item.totalCents > 0);

  if (items.length) {
    return items.map((item, index) => ({
      ...item,
      index: index + 1,
      description: item.description || `Concepto ${index + 1}`,
    }));
  }

  const fallbackBaseCents = Math.round(Number(body.baseAmount || 0) * 100);
  const fallbackConcept = String(body.concept || '').trim().slice(0, 240);

  if (!fallbackConcept && fallbackBaseCents <= 0) return [];

  return [{
    index: 1,
    description: fallbackConcept || 'Concepto',
    quantity: 1,
    unitCents: fallbackBaseCents,
    totalCents: fallbackBaseCents,
  }];
}

function normalizeConcept(concept, lineItems) {
  const clean = String(concept || '').trim();
  if (clean) return clean.slice(0, 240);
  return lineItems.map(item => item.description).filter(Boolean).join(' + ').slice(0, 240);
}

async function updateQuote(projectId, accessToken, quoteId, oldQuote, payload) {
  const clientId = normalizeClientId(oldQuote.clientId) || normalizeClientId(payload.clientId) || '';
  const quote = {
    ...oldQuote,
    ...payload,
    id: oldQuote.id || quoteId,
    quoteNumber: oldQuote.quoteNumber || quoteId,
    clientId: clientId || oldQuote.clientId || '',
  };

  const quoteFieldPaths = [
    'serviceType',
    'documentType',
    'status',
    'concept',
    'lineItems',
    'notes',
    'issueDate',
    'validUntil',
    'taxRate',
    'taxLabel',
    'baseCents',
    'taxCents',
    'totalCents',
    'client',
    'editedAt',
    'editedBy',
    'updatedAt',
    'editedAfterEmail',
  ];

  const writes = [
    {
      update: {
        name: docName(projectId, `private_quotes/${quoteId}`),
        fields: toFields(payload),
      },
      updateMask: { fieldPaths: quoteFieldPaths },
    },
  ];

  if (clientId) {
    writes.push({
      update: {
        name: docName(projectId, `private_clients/${clientId}`),
        fields: toFields({
          ...payload.client,
          serviceType: 'Servicios IA',
          lastConcept: payload.concept,
          lastLineItems: payload.lineItems || [],
          lastQuoteNumber: oldQuote.quoteNumber || quoteId,
          lastQuoteConcept: payload.concept,
          updatedAt: payload.updatedAt,
        }),
      },
      updateMask: {
        fieldPaths: [
          'fullName',
          'taxId',
          'address',
          'phone',
          'email',
          'serviceType',
          'lastConcept',
          'lastLineItems',
          'lastQuoteNumber',
          'lastQuoteConcept',
          'updatedAt',
        ],
      },
    });
  }

  await commitWrites(projectId, accessToken, writes);
  return quote;
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error('Token invalido o expirado');
  const data = await res.json();
  const user = data.users?.[0];
  if (!user?.localId || !user?.email) throw new Error('Token invalido');
  return { uid: user.localId, email: normalizeEmail(user.email) };
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
  if (!res.ok) throw new Error('No se pudo obtener token de Google');
  return (await res.json()).access_token;
}

async function signJWT(payload, pemKey) {
  const unsigned = `${b64uJson({ alg: 'RS256', typ: 'JWT' })}.${b64uJson(payload)}`;
  const pemBody = pemKey.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
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
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getDoc(projectId, path, accessToken, allowMissing = false) {
  const res = await fetch(`${firestoreBase(projectId)}/${encodePath(path)}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (res.status === 404 && allowMissing) return { exists: false, data: {}, updateTime: null };
  if (!res.ok) throw new Error(`No se pudo leer ${path}`);
  const raw = await res.json();
  return { exists: true, data: fromFields(raw.fields || {}), updateTime: raw.updateTime || null };
}

async function commitWrites(projectId, accessToken, writes) {
  const res = await fetch(firestoreBase(projectId) + ':commit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
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
  Object.entries(obj).forEach(([k, v]) => { fields[k] = toValue(v); });
  return fields;
}

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}

function fromFields(fields) {
  const obj = {};
  Object.entries(fields).forEach(([k, v]) => { obj[k] = fromValue(v); });
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

function normalizeDocId(id) {
  const clean = String(id || '').trim();
  return /^[A-Za-z0-9_-]{3,160}$/.test(clean) ? clean : '';
}

function normalizeDate(value) {
  const clean = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : '';
}

function addDays(dateText, days) {
  const [year, month, day] = String(dateText || '').split('-').map(Number);
  const d = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function requireEnv(env, keys) {
  const missing = keys.filter(k => !env[k]);
  if (missing.length) throw new Error('Faltan variables: ' + missing.join(', '));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function jsonError(error, status = 400) {
  return json({ ok: false, error }, status);
}
