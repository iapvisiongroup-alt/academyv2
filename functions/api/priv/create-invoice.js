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
    if (!body) return jsonError('Body JSON inválido', 400);

    const payload = normalizeInvoicePayload(body, staff);
    payload.issuer = getIssuerForService(env, payload.serviceType);

    const invoice = await createInvoiceWithCounter(
      env.FIREBASE_PROJECT_ID,
      accessToken,
      payload,
      body.clientId
    );

    return json({ ok: true, invoice });
  } catch (err) {
    return jsonError(err.message || 'Error creando factura', 500);
  }
}

function normalizeInvoicePayload(body, staff) {
  const serviceType = body.serviceType === 'Academia' ? 'Academia' : 'Servicios IA';
  const baseCents = Math.round(Number(body.baseAmount || 0) * 100);

  if (!Number.isFinite(baseCents) || baseCents <= 0) {
    throw new Error('Importe base inválido');
  }

  const client = body.client || {};
  const clientEmail = normalizeEmail(client.email);

  if (!client.fullName || !clientEmail || !clientEmail.includes('@')) {
    throw new Error('Faltan datos del cliente');
  }

  if (!body.concept) throw new Error('Falta el concepto');

  if (!body.signatureDataUrl || !String(body.signatureDataUrl).startsWith('data:image/png;base64,')) {
    throw new Error('Falta la firma del cliente');
  }

  const taxRate = serviceType === 'Academia' ? 0 : 21;
  const taxCents = Math.round(baseCents * taxRate / 100);
  const totalCents = baseCents + taxCents;
  const now = new Date().toISOString();

  return {
    serviceType,
    concept: String(body.concept).trim().slice(0, 240),
    notes: String(body.notes || '').trim().slice(0, 1200),
    issueDate: String(body.issueDate || now.slice(0, 10)).slice(0, 10),
    paymentMethod: normalizePaymentMethod(body.paymentMethod),
    paymentStatus: normalizePaymentStatus(body.paymentStatus),
    paidAt: normalizePaymentStatus(body.paymentStatus) === 'Pagado' ? now.slice(0, 10) : null,
    appointment: normalizeAppointment(body.appointment, serviceType),
    taxRate,
    taxLabel: taxRate === 0 ? 'Formación exenta de IVA' : 'IVA 21%',
    baseCents,
    taxCents,
    totalCents,
    signatureDataUrl: String(body.signatureDataUrl),
    client: {
      fullName: String(client.fullName || '').trim().slice(0, 180),
      taxId: String(client.taxId || '').trim().slice(0, 60),
      address: String(client.address || '').trim().slice(0, 320),
      phone: String(client.phone || '').trim().slice(0, 80),
      email: clientEmail,
    },
    createdAt: now,
    createdBy: {
      uid: staff.uid,
      email: staff.email,
    },
  };
}

function getIssuerForService(env, serviceType) {
  if (serviceType === 'Academia') {
    return {
      name: env.ACADEMY_COMPANY_NAME || env.COMPANY_NAME || 'KreateIA',
      taxId: env.ACADEMY_COMPANY_TAX_ID || env.COMPANY_TAX_ID || '',
      address: env.ACADEMY_COMPANY_ADDRESS || env.COMPANY_ADDRESS || '',
      email: env.ACADEMY_COMPANY_EMAIL || env.GMAIL_SENDER || '',
    };
  }

  return {
    name: env.SERVICES_COMPANY_NAME || env.COMPANY_NAME || 'KreateIA',
    taxId: env.SERVICES_COMPANY_TAX_ID || env.COMPANY_TAX_ID || '',
    address: env.SERVICES_COMPANY_ADDRESS || env.COMPANY_ADDRESS || '',
    email: env.SERVICES_COMPANY_EMAIL || env.GMAIL_SENDER || '',
  };
}

function normalizePaymentMethod(value) {
  const allowed = new Set(['Efectivo', 'TPV / Tarjeta', 'Transferencia', 'Bizum', 'Pendiente']);
  const clean = String(value || '').trim();
  return allowed.has(clean) ? clean : 'No indicado';
}

function normalizePaymentStatus(value) {
  return String(value || '').trim() === 'Pendiente' ? 'Pendiente' : 'Pagado';
}

function normalizeAppointment(value, serviceType) {
  if (serviceType !== 'Academia') return null;

  const appointment = value || {};
  const date = String(appointment.date || '').trim();
  const time = String(appointment.time || '').trim();
  const notes = String(appointment.notes || '').trim().slice(0, 500);

  if (!date || !time) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;

  const startAt = `${date}T${time}:00${madridOffsetForDate(date)}`;
  const reminderDueAt = new Date(new Date(startAt).getTime() - 24 * 60 * 60 * 1000).toISOString();

  return {
    date,
    time,
    timezone: 'Europe/Madrid',
    startAt,
    reminderDueAt,
    reminderSentAt: null,
    notes,
  };
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

async function createInvoiceWithCounter(projectId, accessToken, payload, requestedClientId = '', attempt = 0) {
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
  const clientId = normalizeClientId(requestedClientId) || `client_${padded}`;

  const existingClient = normalizeClientId(requestedClientId)
    ? await getDoc(projectId, `private_clients/${clientId}`, accessToken, true)
    : { exists: false };

  const now = new Date().toISOString();

  const invoice = {
    id: invoiceId,
    invoiceNumber,
    clientId,
    ...payload,
    updatedAt: now,
    emailSentAt: null,
  };

  const clientFields = {
    id: clientId,
    ...payload.client,
    serviceType: payload.serviceType,
    lastConcept: payload.concept,
    lastInvoiceNumber: invoiceNumber,
    signatureDataUrl: payload.signatureDataUrl,
    lastSignatureAt: payload.createdAt,
    agreementText: agreementText(payload.serviceType),
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
    'signatureDataUrl',
    'lastSignatureAt',
    'agreementText',
    'archivedAt',
    'updatedAt',
  ];

  if (!existingClient.exists) {
    clientFields.createdAt = payload.createdAt;
    clientFieldPaths.push('createdAt');
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
  ];

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
    if (res.status === 409 || text.includes('FAILED_PRECONDITION') || text.includes('ABORTED')) {
      await sleep(120 + attempt * 100);
      return createInvoiceWithCounter(projectId, accessToken, payload, requestedClientId, attempt + 1);
    }
    throw new Error(`Firestore commit: ${res.status} ${text.slice(0, 180)}`);
  }

  return invoice;
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

  if (!res.ok) throw new Error('Token inválido o expirado');

  const data = await res.json();
  const user = data.users?.[0];

  if (!user?.localId || !user?.email) throw new Error('Token inválido');

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
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getDoc(projectId, path, accessToken, allowMissing = false) {
  const res = await fetch(`${firestoreBase(projectId)}/${encodePath(path)}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
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
  if (v instanceof Date) return { timestampValue: v.toISOString() };
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

function agreementText(serviceType) {
  return serviceType === 'Academia'
    ? 'El cliente/alumno acepta la inscripción o contratación del curso indicado, el tratamiento de sus datos para gestión administrativa y la emisión de factura correspondiente.'
    : 'El cliente acepta la contratación del servicio IA indicado, el tratamiento de sus datos para gestión administrativa y la emisión de factura correspondiente.';
}

function requireEnv(env, keys) {
  const missing = keys.filter(k => !env[k]);
  if (missing.length) throw new Error('Faltan variables: ' + missing.join(', '));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function jsonError(error, status = 400) {
  return json({ ok: false, error }, status);
}
