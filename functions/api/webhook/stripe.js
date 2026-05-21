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

async function addCreditsToUser(projectId, appId, uid, credits, accessToken) {
    const baseUrl  = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const docPath  = `artifacts/${appId}/public/data/users/${uid}`;
    const fullName = `projects/${projectId}/databases/(default)/documents/${docPath}`;

    // Leer créditos actuales
    const readRes = await fetch(`${baseUrl}/${docPath}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    let currentCredits = 0;
    let updateTime     = null;

    if (readRes.ok) {
        const doc      = await readRes.json();
        currentCredits = parseInt(doc.fields?.credits?.integerValue ?? 0);
        updateTime     = doc.updateTime;
    }

    const newCredits = currentCredits + credits;

    // Escribir con transacción atómica
    const writeBody = {
        writes: [{
            update: {
                name:   fullName,
                fields: { credits: { integerValue: String(newCredits) } },
            },
            updateMask: { fieldPaths: ['credits'] },
            ...(updateTime ? { currentDocument: { updateTime } } : {}),
        }],
    };

    const writeRes = await fetch(`${baseUrl}:commit`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(writeBody),
    });

    if (!writeRes.ok) {
        const err = await writeRes.text();
        throw new Error(`Error Firestore (${writeRes.status}): ${err.slice(0, 200)}`);
    }

    return newCredits;
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
            const newBalance  = await addCreditsToUser(
                env.FIREBASE_PROJECT_ID,
                env.FIREBASE_APP_ID,
                uid,
                creditsToAdd,
                accessToken
            );

            console.log(`✅ Créditos añadidos — uid:${uid} | nuevo saldo:${newBalance}`);
            return new Response(JSON.stringify({ status: 'success', credits: newBalance }), { status: 200 });
        }

        return new Response(JSON.stringify({ received: true }), { status: 200 });

    } catch (err) {
        console.error(`❌ Webhook Error: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }
}
