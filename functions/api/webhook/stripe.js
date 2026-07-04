// functions/stripe/stripe.js (o webhook.js según tu estructura)

const INTERNAL_PAYMENT_EMAIL = 'empresas@kreateia.com';

async function getServiceAccountToken(env) {
    const now     = Math.floor(Date.now() / 1000);
    const payload = {
        iss:   env.FIREBASE_CLIENT_EMAIL,
        sub:   env.FIREBASE_CLIENT_EMAIL,
        aud:   'https://oauth2.googleapis.com/token',
        iat:   now,
        exp:   now + 3600,
        scope: 'https://www.googleapis.com/auth/datastore',
    };

    const pemKey  = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const pemBody = pemKey
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');
    const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
        'pkcs8', der.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
    );

    const b64u     = s => btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const header   = { alg: 'RS256', typ: 'JWT' };
    const unsigned = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
    const sig      = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    const jwt      = `${unsigned}.${b64u(String.fromCharCode(...new Uint8Array(sig)))}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!res.ok) throw new Error(`Error token SA: ${await res.text()}`);
    return (await res.json()).access_token;
}

async function saveInvoice(projectId, appId, uid, invoiceData, accessToken) {
    const baseUrl  = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const invoiceId = `stripe_${safeDocId(invoiceData.stripeSession || Date.now())}`;
    const docPath  = `artifacts/${appId}/public/data/users/${uid}/invoices/${invoiceId}`;

    const body = {
        fields: {
            invoiceId:   { stringValue: invoiceId },
            planId:      { stringValue: invoiceData.planId },
            planName:    { stringValue: invoiceData.planName },
            credits:     { integerValue: String(invoiceData.credits) },
            amount:      { integerValue: String(invoiceData.amount) },
            currency:    { stringValue: invoiceData.currency },
            email:       { stringValue: invoiceData.email },
            name:        { stringValue: invoiceData.name || '' },
            status:      { stringValue: 'paid' },
            stripeSession: { stringValue: invoiceData.stripeSession },
            createdAt:   { timestampValue: new Date().toISOString() },
            updatedAt:   { timestampValue: new Date().toISOString() },
        }
    };

    const res = await fetch(`${baseUrl}/${docPath}`, {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Error guardando factura (${res.status}): ${err.slice(0, 200)}`);
    }

    return invoiceId;
}

async function addCreditsToUser(projectId, appId, uid, credits, accessToken, profileData = {}) {
    const baseUrl  = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const docPath  = `artifacts/${appId}/public/data/users/${uid}`;
    const fullName = `projects/${projectId}/databases/(default)/documents/${docPath}`;
    const sessionId = String(profileData.stripeSession || '').trim();

    if (!sessionId) throw new Error('Falta stripeSession para procesar créditos.');

    // Leer créditos actuales
    const readRes = await fetch(`${baseUrl}/${docPath}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    let currentCredits = 0;
    let updateTime     = null;
    let userExists     = false;

    if (readRes.ok) {
        const doc      = await readRes.json();
        currentCredits = parseInt(doc.fields?.credits?.integerValue ?? 0);
        updateTime     = doc.updateTime;
        userExists     = true;
    } else if (readRes.status === 404) {
        if (!profileData.email) {
            throw new Error(`Usuario no encontrado y Stripe no envió email: ${uid}`);
        }
    } else {
        const err = await readRes.text();
        throw new Error(`Error leyendo usuario (${readRes.status}): ${err.slice(0, 200)}`);
    }

    const now = new Date().toISOString();
    const newCredits = currentCredits + credits;
    const fields = {
        uid: { stringValue: uid },
        credits: { integerValue: String(newCredits) },
        creditsUpdatedAt: { timestampValue: now },
        creditsUpdatedBy: { stringValue: 'stripe_webhook' },
        updatedAt: { timestampValue: now },
    };

    if (profileData.email) fields.email = { stringValue: String(profileData.email).toLowerCase() };
    if (profileData.name) fields.name = { stringValue: String(profileData.name) };
    if (!userExists) {
        fields.role = { stringValue: 'user' };
        fields.createdAt = { timestampValue: now };
    }

    const processedPath = `stripe_processed_sessions/${safeDocId(sessionId)}`;
    const processedFullName = `projects/${projectId}/databases/(default)/documents/${processedPath}`;

    // Escribir con protección idempotente: una sesión de Stripe solo puede sumar créditos una vez.
    const writeBody = {
        writes: [
            {
                update: {
                    name: processedFullName,
                    fields: {
                        stripeSession: { stringValue: sessionId },
                        uid: { stringValue: uid },
                        email: { stringValue: String(profileData.email || '').toLowerCase() },
                        planId: { stringValue: String(profileData.planId || '') },
                        credits: { integerValue: String(credits) },
                        createdAt: { timestampValue: now },
                    },
                },
                currentDocument: { exists: false },
            },
            {
                update: {
                    name: fullName,
                    fields,
                },
                updateMask: { fieldPaths: Object.keys(fields) },
                currentDocument: userExists ? { updateTime } : { exists: false },
            },
        ],
    };

    const writeRes = await fetch(`${baseUrl}:commit`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(writeBody),
    });

    if (!writeRes.ok) {
        const err = await writeRes.text();

        if (
            writeRes.status === 409
            || err.includes('ALREADY_EXISTS')
            || err.includes('FAILED_PRECONDITION')
        ) {
            return { alreadyProcessed: true, credits: currentCredits };
        }

        throw new Error(`Error Firestore (${writeRes.status}): ${err.slice(0, 200)}`);
    }

    return { alreadyProcessed: false, credits: newCredits };
}

export async function onRequestPost(context) {
    const { request, env } = context;

    const signatureHeader = request.headers.get('stripe-signature');
    if (!signatureHeader) {
        return new Response('Missing Stripe signature', { status: 400 });
    }

    try {
        const payload = await request.text();
        const secret  = env.STRIPE_WEBHOOK_SECRET;

        // 1. Verificar firma de Stripe
        const elements  = signatureHeader.split(',');
        const timestamp = elements.find(e => e.startsWith('t='))?.split('=')[1];
        const signature = elements.find(e => e.startsWith('v1='))?.split('=')[1];

        if (!timestamp || !signature) throw new Error('Formato de firma inválido');

        // Verificar que el webhook no sea muy antiguo (5 minutos)
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - parseInt(timestamp)) > 300) {
            throw new Error('Webhook demasiado antiguo');
        }

        const encoder      = new TextEncoder();
        const signedPayload = `${timestamp}.${payload}`;
        const key = await crypto.subtle.importKey(
            'raw', encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false, ['sign']
        );
        const expectedBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
        const expectedSig = Array.from(new Uint8Array(expectedBuf))
            .map(b => b.toString(16).padStart(2, '0')).join('');

        if (signature !== expectedSig) {
            console.error('❌ Firma de Stripe inválida');
            return new Response('Invalid signature', { status: 400 });
        }

        // 2. Parsear evento
        const event = JSON.parse(payload);

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;

            // client_reference_id viene como "starter___uid123"
            const clientRef = session.client_reference_id || '';
            const [planId, uid] = clientRef.split('___');

            if (!uid || !planId) {
                console.error('❌ client_reference_id inválido:', clientRef);
                return new Response('client_reference_id inválido', { status: 400 });
            }

            const PLAN_CREDITS = { starter: 1000, pro: 3000, max: 10000 };
            const PLAN_AMOUNTS = { starter: 999, pro: 2499, max: 6999 };
            const PLAN_CURRENCY = 'eur';
            const creditsToAdd = PLAN_CREDITS[planId];
            const expectedAmount = PLAN_AMOUNTS[planId];

            if (!creditsToAdd) {
                console.error('❌ Plan desconocido:', planId);
                return new Response('Plan desconocido', { status: 400 });
            }

            if (session.payment_status !== 'paid') {
                console.error('❌ Pago no confirmado:', session.payment_status);
                return new Response('Pago no confirmado', { status: 400 });
            }

            if (String(session.currency || '').toLowerCase() !== PLAN_CURRENCY) {
                console.error('❌ Moneda inválida:', session.currency);
                return new Response('Moneda inválida', { status: 400 });
            }

            if (Number(session.amount_total || 0) !== expectedAmount) {
                console.error('❌ Importe no coincide:', session.amount_total, expectedAmount);
                return new Response('Importe inválido', { status: 400 });
            }

            console.log(`💰 PAGO RECIBIDO — uid:${uid} | plan:${planId} | +${creditsToAdd} créditos`);

            // 3. Añadir créditos en Firebase
            const accessToken = await getServiceAccountToken(env);
            const creditResult = await addCreditsToUser(
                env.FIREBASE_PROJECT_ID,
                env.FIREBASE_APP_ID,
                uid,
                creditsToAdd,
                accessToken,
                {
                    email: session.customer_details?.email || '',
                    name: session.customer_details?.name || '',
                    stripeSession: session.id,
                    planId,
                }
            );

            if (creditResult.alreadyProcessed) {
                console.log(`ℹ️ Sesión Stripe ya procesada — ${session.id}`);
                return new Response(JSON.stringify({ status: 'already_processed', credits: creditResult.credits }), { status: 200 });
            }

            console.log(`✅ Créditos añadidos — uid:${uid} | nuevo saldo:${creditResult.credits}`);

            // Guardar factura en Firestore
            const PLAN_NAMES = { starter: 'Iniciación', pro: 'Creador Pro', max: 'Estudio Max' };
            await saveInvoice(
                env.FIREBASE_PROJECT_ID,
                env.FIREBASE_APP_ID,
                uid,
                {
                    planId:        planId,
                    planName:      PLAN_NAMES[planId] || planId,
                    credits:       creditsToAdd,
                    amount:        expectedAmount,
                    currency:      session.currency || 'eur',
                    email:         session.customer_details?.email || '',
                    name:          session.customer_details?.name || '',
                    stripeSession: session.id,
                },
                accessToken
            );

            console.log(`🧾 Factura guardada — uid:${uid} | plan:${planId}`);

            queueInternalPaymentEmail(context, env, {
                uid,
                planId,
                planName: PLAN_NAMES[planId] || planId,
                credits: creditsToAdd,
                totalCredits: creditResult.credits,
                amount: expectedAmount,
                currency: session.currency || 'eur',
                email: session.customer_details?.email || '',
                name: session.customer_details?.name || '',
                stripeSession: session.id,
            });

            return new Response(JSON.stringify({ status: 'success', credits: creditResult.credits }), { status: 200 });
        }

        return new Response(JSON.stringify({ received: true }), { status: 200 });

    } catch (err) {
        console.error(`❌ Webhook Error: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }
}

function safeDocId(value) {
    return String(value || '')
        .trim()
        .replace(/[^A-Za-z0-9_-]/g, '_')
        .slice(0, 180) || `id_${Date.now()}`;
}

function queueInternalPaymentEmail(context, env, payment) {
    const task = notifyInternalCreditPayment(env, payment).catch(err => {
        console.error(`⚠️ Email interno de pago no enviado: ${err.message}`);
    });

    if (typeof context.waitUntil === 'function') {
        context.waitUntil(task);
    }
}

async function notifyInternalCreditPayment(env, payment) {
    if (!env.GMAIL_SENDER) {
        throw new Error('Falta GMAIL_SENDER para enviar aviso interno');
    }

    const gmailToken = await getGmailDelegatedToken(env);
    const email = buildInternalPaymentEmail(env.GMAIL_SENDER, payment);
    await sendGmail(gmailToken, email);
}

function buildInternalPaymentEmail(sender, payment) {
    const customerName = payment.name || 'Cliente sin nombre';
    const customerEmail = payment.email || 'Sin email';
    const subject = `Nuevo pago KreateIA · ${payment.planName} · ${formatMoney(payment.amount, payment.currency)}`;
    const paidAt = new Date().toLocaleString('es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Madrid',
    });

    const rows = [
        ['Cliente', customerName],
        ['Email', customerEmail],
        ['Plan', payment.planName],
        ['Créditos comprados', `${payment.credits} CR`],
        ['Saldo final', `${payment.totalCredits} CR`],
        ['Importe', formatMoney(payment.amount, payment.currency)],
        ['UID Firebase', payment.uid],
        ['Sesión Stripe', payment.stripeSession],
        ['Fecha', paidAt],
    ];

    const rowsHtml = rows.map(([label, value]) => `
        <tr>
            <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#64748b;font-size:13px">${escapeHtml(label)}</td>
            <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;color:#0f172a;font-size:13px;font-weight:800">${escapeHtml(value)}</td>
        </tr>
    `).join('');

    const html = `
        <!doctype html>
        <html lang="es">
        <body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb;padding:28px">
                <tr><td align="center">
                    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0">
                        <tr>
                            <td style="padding:24px 28px;background:#0f172a;color:#fff">
                                <div style="font-size:25px;font-weight:900;letter-spacing:-.04em">
                                    <span style="color:#60a5fa">Kreate</span><span style="color:#f59e0b">IA</span>
                                </div>
                                <div style="font-size:13px;color:#cbd5e1;margin-top:6px">Nuevo pago de créditos confirmado</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:28px">
                                <p style="font-size:16px;line-height:1.6;margin:0 0 18px">
                                    Stripe ha confirmado un pago y el sistema ha añadido los créditos automáticamente.
                                </p>
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;border-collapse:separate;border-spacing:0">
                                    ${rowsHtml}
                                </table>
                                <p style="font-size:12px;line-height:1.5;color:#64748b;margin:18px 0 0">
                                    Este aviso es interno. Si detectas algo raro, revisa Stripe y el documento del usuario en Firestore antes de tocar créditos manualmente.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:18px 28px;background:#f8fafc;color:#64748b;font-size:12px">
                                KreateIA · aviso automático de pagos · ${escapeHtml(sender)}
                            </td>
                        </tr>
                    </table>
                </td></tr>
            </table>
        </body>
        </html>
    `;

    return {
        to: INTERNAL_PAYMENT_EMAIL,
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
        body: JSON.stringify({ raw: b64uBytes(new TextEncoder().encode(mime)) }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || 'Gmail API no pudo enviar el correo');
    return data;
}

async function getGmailDelegatedToken(env) {
    const serviceEmail = env.GOOGLE_CLIENT_EMAIL || env.FIREBASE_CLIENT_EMAIL;
    const privateKey = (env.GOOGLE_PRIVATE_KEY || env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!serviceEmail || !privateKey) {
        throw new Error('Faltan credenciales Google para Gmail');
    }

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

function formatMoney(cents, currency = 'eur') {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: String(currency || 'eur').toUpperCase(),
    }).format((Number(cents) || 0) / 100);
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    }[m]));
}
