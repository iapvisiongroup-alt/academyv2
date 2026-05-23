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
    if (!quote?.client?.email) return jsonError('El presupuesto no tiene email de cliente', 400);

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
      updateMask: { fieldPaths: ['emailSentAt', 'emailMessageId', 'updatedAt'] },
    }]);

    return json({ ok: true, messageId: gmailResult.id || null });
  } catch (err) {
    return jsonError(err.message || 'Error enviando presupuesto', 500);
  }
}

function buildQuoteEmail(sender, quote) {
  const clientName = escapeHtml(quote.client.fullName || 'cliente');
  const quoteNumber = escapeHtml(quote.quoteNumber);
  const issuer = quote.issuer || {};
  const subject = `Presupuesto ${quote.quoteNumber} - KreateIA`;

  const html = `
    <!doctype html>
    <html lang="es">
    <body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb;padding:28px">
        <tr><td align="center">
          <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0">
            <tr>
              <td style="padding:24px 28px;background:#111827;color:#fff">
                <div style="font-size:26px;font-weight:900;letter-spacing:-.04em">
                  <span style="color:#60a5fa">Kreate</span><span style="color:#f59e0b">IA</span>
                </div>
                <div style="font-size:13px;color:#cbd5e1;margin-top:6px">Presupuesto de servicios IA</div>
              </td>
            </tr>

            <tr>
              <td style="padding:28px">
                <p style="font-size:16px;line-height:1.6;margin:0 
