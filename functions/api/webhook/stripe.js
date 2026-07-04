// functions/stripe/stripe.js (o webhook.js según tu estructura)

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

    await fetch(`${baseUrl}/${docPath}`, {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    });

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
            const creditsToAdd = PLAN_CREDITS[planId];

            if (!creditsToAdd) {
                console.error('❌ Plan desconocido:', planId);
                return new Response('Plan desconocido', { status: 400 });
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
            const PLAN_PRICES = { starter: 999, pro: 2499, max: 6999 };
            await saveInvoice(
                env.FIREBASE_PROJECT_ID,
                env.FIREBASE_APP_ID,
                uid,
                {
                    planId:        planId,
                    planName:      PLAN_NAMES[planId] || planId,
                    credits:       creditsToAdd,
                    amount:        PLAN_PRICES[planId] || session.amount_total || 0,
                    currency:      session.currency || 'eur',
                    email:         session.customer_details?.email || '',
                    name:          session.customer_details?.name || '',
                    stripeSession: session.id,
                },
                accessToken
            );

            console.log(`🧾 Factura guardada — uid:${uid} | plan:${planId}`);
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
