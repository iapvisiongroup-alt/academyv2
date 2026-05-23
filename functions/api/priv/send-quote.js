const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'POST') {
    return jsonError('Método no permitido', 405);
  }

  try {
    requireEnv(env, [
      'FIREBASE_API_KEY',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
      'GMAIL_SENDER',
    ]);

    const idToken = getBearerToken(request);
    if (!idToken) return jsonError('No autenticado', 401);

    const staff = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
    const firestoreToken = await getServiceAccountToken(env, 'https://www.googleapis.com/auth/datastore');

    const allowed = await isAllowedStaff(env.FIREBASE_PROJECT_ID, firestoreToken, staff.email);
    if (!allowed) return jsonError('Email no autorizado', 403);

    const body = await request.json().catch(() => null);
    const quoteId = String(body?.quoteId || '').trim();

    if (!quoteId) return jsonError('Falta quoteId', 400);

    const quoteDoc = await getDoc(env.FIREBASE_PROJECT_ID, `private_quotes/${quoteId}`, firestoreToken);
    const quote = quoteDoc.data;

    if (!quote?.client?.email) {
      return jsonError('El presupuesto no tiene email de cliente', 400);
    }

    const gmailToken = await getGmailDelegatedToken(env);
    const email = buildQuoteEmail(env.GMAIL_SENDER, quote);
    const gmailResult = await sendGmail(gmailToken, email);

    const now = new Date().toISOString();

    await commitWrites(env.FIREBASE_PROJECT_ID, firestoreToken, [{
      update: {
        name: docName(env.FIREBASE_PROJECT_ID, `private_quotes/${quoteId}`),
        fields: toFields({
          emailSentAt: now,
          emailMessageId: gmailResult.id || null,
          updatedAt: now,
        }),
      },
      updateMask: {
        fieldPaths: ['emailSentAt', 'emailMessageId', 'updatedAt'],
      },
    }]);

    return json({
      ok: true,
      messageId: gmailResult.id || null,
    });
  } catch (err) {
    return jsonError(err.message || 'Error enviando presupuesto', 500);
  }
}

function buildQuoteEmail(sender, quote) {
  const client = quote.client || {};
  const issuer = quote.issuer || {};

  const subject = `Presupuesto ${quote.quoteNumber} - KreateIA`;

  const html = [
    '<!doctype html>',
    '<html lang="es">',
    '<body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb;padding:28px">',
    '<tr><td align="center">',
    '<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0">',
    '<tr>',
    '<td style="padding:24px 28px;background:#111827;color:#fff">',
    '<div style="font-size:26px;font-weight:900;letter-spacing:-.04em">',
    '<span style="color:#60a5fa">Kreate</span><span style="color:#f59e0b">IA</span>',
    '</div>',
    '<div style="font-size:13px;color:#cbd5e1;margin-top:6px">Presupuesto de servicios IA</div>',
    '</td>',
    '</tr>',

    '<tr>',
    '<td style="padding:28px">',
    `<p style="font-size:16px;line-height:1.6;margin:0 0 18px">Hola ${escapeHtml(client.fullName || 'cliente')},</p>`,
    `<p style="font-size:16px;line-height:1.6;margin:0 0 22px">Te enviamos el presupuesto <strong>${escapeHtml(quote.quoteNumber)}</strong> para el servicio solicitado.</p>`,

    '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse">',
    '<tr>',
    '<td style="width:50%;vertical-align:top;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">',
    '<div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:bold;margin-bottom:6px">Emisor</div>',
    `<div style="font-weight:bold">${escapeHtml(issuer.name || 'KreateIA')}</div>`,
    `<div style="font-size:13px;color:#64748b">${escapeHtml(issuer.taxId || '')}</div>`,
    `<div style="font-size:13px;color:#64748b">${escapeHtml(issuer.address || '')}</div>`,
    '</td>',
    '<td style="width:12px"></td>',
    '<td style="width:50%;vertical-align:top;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">',
    '<div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:bold;margin-bottom:6px">Cliente</div>',
    `<div style="font-weight:bold">${escapeHtml(client.fullName || '')}</div>`,
    `<div style="font-size:13px;color:#64748b">${escapeHtml(client.taxId || '')}</div>`,
    `<div style="font-size:13px;color:#64748b">${escapeHtml(client.address || '')}</div>`,
    '</td>',
    '</tr>',
    '</table>',

    '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">',
    '<tr style="background:#f8fafc">',
    '<td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px;text-transform:uppercase;font-weight:bold">Concepto</td>',
    '<td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b;font-size:12px;text-transform:uppercase;font-weight:bold">Importe</td>',
    '</tr>',
    '<tr>',
    '<td style="padding:14px;border-bottom:1px solid #e2e8f0">',
    `<strong>${escapeHtml(quote.concept || '')}</strong><br>`,
    `<span style="color:#64748b;font-size:13px">Válido hasta ${escapeHtml(quote.validUntil || '')}</span>`,
    '</td>',
    `<td style="padding:14px;border-bottom:1px solid #e2e8f0;text-align:right">${money(quote.baseCents)}</td>`,
    '</tr>',
    '<tr>',
    `<td style="padding:12px;color:#64748b">IVA ${Number(quote.taxRate || 21)}%</td>`,
    `<td style="padding:12px;text-align:right">${money(quote.taxCents)}</td>`,
    '</tr>',
    '<tr style="background:#f8fafc">',
    '<td style="padding:14px;font-size:18px;font-weight:900">Total presupuesto</td>',
    `<td style="padding:14px;text-align:right;font-size:18px;font-weight:900">${money(quote.totalCents)}</td>`,
    '</tr>',
    '</table>',

    '<p style="font-size:13px;line-height:1.6;color:#64748b;margin:22px 0 0">',
    'Este documento es un presupuesto informativo y no constituye factura. Cuando confirmes la aceptación, podremos emitir la factura correspondiente.',
    '</p>',

    quote.notes
      ? `<p style="font-size:13px;line-height:1.6;color:#64748b;margin:12px 0 0"><strong>Notas:</strong> ${escapeHtml(quote.notes)}</p>`
      : '',

    '</td>',
    '</tr>',

    '<tr>',
    `<td style="padding:18px 28px;background:#f8fafc;color:#64748b;font-size:12px">KreateIA · www.kreateia.com · ${escapeHtml(sender)}</td>`,
    '</tr>',

    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('');

  return {
    to: client.email,
    from: `KreateIA <${sender}>`,
    replyTo: sender,
    subject,
    html,
  };
}

async function sendGmail(accessToken, mail) {
  const mime = [
    `To: ${mail.to}`,
    `From: ${mail.from}`,
    `Reply-To: ${mail.replyTo}`,
    `Subject: ${mail.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    mail.html,
  ].join('\r\n');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: b64uBytes(new TextEncoder().encode(mime)),
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error?.message || 'Gmail API no pudo enviar el correo');
  }

  return data;
}

async function getGmailDelegatedToken(env) {
  const serviceEmail = env.GOOGLE_CLIENT_EMAIL || env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (env.GOOGLE_PRIVATE_KEY || env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: serviceEmail,
    sub: env.GMAIL_SENDER,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/gmail.send',
  };

  const jwt = await signJWT(payload, privateKey);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'No se pudo obtener token Gmail');
  }

  return data.access_token;
}

async function isAllowedStaff(projectId, accessToken, email) {
  const doc = await getDoc(projectId, `private_allowed_users/${normalizeEmail(email)}`, accessToken, true);
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

  if (!res.ok) {
    throw new Error('Token inválido o expirado');
  }

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
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 404 && allowMissing) {
    return {
      exists: false,
      data: {},
      updateTime: null,
    };
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

  return {
    stringValue: String(value),
  };
}

function fromFields(fields) {
  const obj = {};

  Object.entries(fields).forEach(([key, value]) => {
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

function money(cents) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format((Number(cents) || 0) / 100);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function b64uJson(obj) {
  return b64uBytes(new TextEncoder().encode(JSON.stringify(obj)));
}

function b64uBytes(bytes) {
  let binary = '';

  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  }

  return btoa(binary)
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

function jsonError(error, status = 400) {
  return json({ ok: false, error }, status);
}
