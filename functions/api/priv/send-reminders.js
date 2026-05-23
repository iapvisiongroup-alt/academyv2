const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-reminder-secret',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return jsonError('Metodo no permitido', 405);
  }

  try {
    requireEnv(env, [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
      'GMAIL_SENDER',
      'REMINDER_SECRET',
    ]);

    if (!isAuthorizedReminderRequest(request, env)) {
      return jsonError('No autorizado', 401);
    }

    const firestoreToken = await getServiceAccountToken(env, 'https://www.googleapis.com/auth/datastore');
    const gmailToken = await getGmailDelegatedToken(env);

    const invoices = await listInvoiceDocs(env.FIREBASE_PROJECT_ID, firestoreToken);
    const now = new Date();

    const dueInvoices = invoices.filter((invoice) => {
      const appointment = invoice.appointment || {};
      if (invoice.serviceType !== 'Academia') return false;
      if (!invoice.client?.email) return false;
      if (!appointment.startAt || !appointment.reminderDueAt) return false;
      if (appointment.reminderSentAt) return false;
      if (appointment.reminderSkippedAt) return false;

      const reminderDueAt = new Date(appointment.reminderDueAt);
      const startAt = new Date(appointment.startAt);

      return reminderDueAt <= now && startAt > now;
    });

    const expiredInvoices = invoices.filter((invoice) => {
      const appointment = invoice.appointment || {};
      if (invoice.serviceType !== 'Academia') return false;
      if (!appointment.startAt || appointment.reminderSentAt || appointment.reminderSkippedAt) return false;

      return new Date(appointment.startAt) <= now;
    });

    const results = [];

    for (const invoice of dueInvoices.slice(0, 25)) {
      try {
        const email = buildReminderEmail(env, invoice);
        const gmailResult = await sendGmail(gmailToken, email);

        const updatedAppointment = {
          ...(invoice.appointment || {}),
          reminderSentAt: now.toISOString(),
          reminderEmailMessageId: gmailResult.id || null,
        };

        await updateInvoiceReminder(env.FIREBASE_PROJECT_ID, firestoreToken, invoice.id, {
          appointment: updatedAppointment,
          updatedAt: now.toISOString(),
        });

        results.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          email: invoice.client.email,
          sent: true,
          messageId: gmailResult.id || null,
        });
      } catch (err) {
        results.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          email: invoice.client?.email || null,
          sent: false,
          error: err.message || 'Error enviando recordatorio',
        });
      }
    }

    for (const invoice of expiredInvoices.slice(0, 25)) {
      const updatedAppointment = {
        ...(invoice.appointment || {}),
        reminderSkippedAt: now.toISOString(),
        reminderSkippedReason: 'La cita ya habia pasado cuando se reviso el recordatorio.',
      };

      await updateInvoiceReminder(env.FIREBASE_PROJECT_ID, firestoreToken, invoice.id, {
        appointment: updatedAppointment,
        updatedAt: now.toISOString(),
      });

      results.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        skipped: true,
      });
    }

    return json({
      ok: true,
      checked: invoices.length,
      due: dueInvoices.length,
      expired: expiredInvoices.length,
      processed: results.length,
      results,
    });
  } catch (err) {
    return jsonError(err.message || 'Error enviando recordatorios', 500);
  }
}

function buildReminderEmail(env, invoice) {
  const client = invoice.client || {};
  const appointment = invoice.appointment || {};
  const issuer = invoice.issuer || {};

  const dateText = formatSpanishDate(appointment.date);
  const timeText = appointment.time || '';
  const subject = `Recordatorio de cita en KreateIA - ${dateText} ${timeText}`;

  const html = `
    <!doctype html>
    <html lang="es">
    <body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb;padding:28px">
        <tr>
          <td align="center">
            <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0">
              <tr>
                <td style="padding:24px 28px;background:#0f172a;color:#fff">
                  <div style="font-size:26px;font-weight:900;letter-spacing:-.04em">
                    <span style="color:#60a5fa">Kreate</span><span style="color:#f59e0b">IA</span>
                  </div>
                  <div style="font-size:13px;color:#cbd5e1;margin-top:6px">Recordatorio de cita / clase presencial</div>
                </td>
              </tr>

              <tr>
                <td style="padding:28px">
                  <p style="font-size:16px;line-height:1.6;margin:0 0 18px">Hola ${escapeHtml(client.fullName || '')},</p>

                  <p style="font-size:16px;line-height:1.6;margin:0 0 22px">
                    Te recordamos tu cita en <strong>KreateIA Academia</strong>.
                  </p>

                  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:18px">
                    <tr style="background:#f8fafc">
                      <td style="padding:12px;color:#64748b;font-size:12px;text-transform:uppercase;font-weight:bold">Fecha</td>
                      <td style="padding:12px;color:#64748b;font-size:12px;text-transform:uppercase;font-weight:bold">Hora</td>
                    </tr>
                    <tr>
                      <td style="padding:16px;font-size:20px;font-weight:900">${escapeHtml(dateText)}</td>
                      <td style="padding:16px;font-size:20px;font-weight:900">${escapeHtml(timeText)}</td>
                    </tr>
                  </table>

                  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
                    <tr>
                      <td style="padding:12px;background:#f8fafc;color:#64748b;font-size:12px;text-transform:uppercase;font-weight:bold;width:160px">Curso / servicio</td>
                      <td style="padding:12px">${escapeHtml(invoice.concept || '')}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px;background:#f8fafc;color:#64748b;font-size:12px;text-transform:uppercase;font-weight:bold">Notas</td>
                      <td style="padding:12px">${escapeHtml(appointment.notes || invoice.notes || 'Sin notas adicionales.')}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px;background:#f8fafc;color:#64748b;font-size:12px;text-transform:uppercase;font-weight:bold">Lugar</td>
                      <td style="padding:12px">${escapeHtml(issuer.address || env.ACADEMY_COMPANY_ADDRESS || '')}</td>
                    </tr>
                  </table>

                  <p style="font-size:14px;line-height:1.6;color:#64748b;margin:22px 0 0">
                    Gracias por confiar en KreateIA. Si necesitas cambiar la hora o tienes cualquier duda, responde directamente a este correo.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding:18px 28px;background:#f8fafc;color:#64748b;font-size:12px">
                  KreateIA · www.kreateia.com · ${escapeHtml(env.GMAIL_SENDER)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return {
    to: client.email,
    from: `KreateIA <${env.GMAIL_SENDER}>`,
    replyTo: env.GMAIL_SENDER,
    subject,
    html,
  };
}

async function listInvoiceDocs(projectId, accessToken) {
  let pageToken = '';
  const all = [];

  do {
    const url = new URL(`${firestoreBase(projectId)}/private_invoices`);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (res.status === 404) return [];
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`No se pudieron leer facturas: ${res.status} ${text.slice(0, 180)}`);
    }

    const data = await res.json();
    const docs = data.documents || [];

    docs.forEach((doc) => {
      const id = doc.name.split('/').pop();
      all.push({ id, ...fromFields(doc.fields || {}) });
    });

    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return all;
}

async function updateInvoiceReminder(projectId, accessToken, invoiceId, data) {
  const res = await fetch(firestoreBase(projectId) + ':commit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: [{
        update: {
          name: docName(projectId, `private_invoices/${invoiceId}`),
          fields: toFields(data),
        },
        updateMask: {
          fieldPaths: Object.keys(data),
        },
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`No se pudo actualizar recordatorio: ${res.status} ${text.slice(0, 180)}`);
  }
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
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: b64uBytes(new TextEncoder().encode(mime)) }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'Gmail API no pudo enviar el correo');
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || 'No se pudo obtener token Gmail');
  return data.access_token;
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

  return btoa(bin)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
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
    return { arrayValue: { values: value.map(toValue) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: toFields(value) } };
  }
  return { stringValue: String(value) };
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

function formatSpanishDate(date) {
  if (!date) return '';

  const [year, month, day] = String(date).split('-').map(Number);
  if (!year || !month || !day) return String(date);

  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function isAuthorizedReminderRequest(request, env) {
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret') || '';
  const headerSecret = request.headers.get('x-reminder-secret') || '';

  const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  const bearerSecret = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  return Boolean(env.REMINDER_SECRET)
    && (
      querySecret === env.REMINDER_SECRET
      || headerSecret === env.REMINDER_SECRET
      || bearerSecret === env.REMINDER_SECRET
    );
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

function requireEnv(env, keys) {
  const missing = keys.filter(key => !env[key]);
  if (missing.length) throw new Error('Faltan variables: ' + missing.join(', '));
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
