// /functions/api/v1/[[path]].js

// ─── Costes por modelo ────────────────────────────────────────────────────────
const IMAGE_COSTS = {
    'nano-banana-2':      16,
    'nano-banana-2-edit':  8,
};

const VIDEO_COST_PER_5S = {
    'seedance-v2.0-t2v':                  0.75,
    'seedance-2-vip-image-to-video-fast': 1.05,
    'seedance-2.0-omni-reference-480p':   1.44,
    'sd-2-vip-extend':                    1.05,
    'veo3.1-fast-text-to-video':          0.40,
    'veo3.1-lite-image-to-video':         0.30,
    'kling-v3.0-std-motion-control':      1.63,
};

const MUSIC_COSTS = {
    'suno-create-music':      20,
    'suno-extend-music':      20,
    'suno-remix-music':       20,
    'suno-add-vocals':        20,
    'suno-add-instrumental':  20,
    'suno-generate-mashup':   20,
    'suno-generate-sounds':    4,
    'suno-voice-clone':        0,
    'gpt-5-mini':             20,
    'gpt-5-4':                20,
};

function calculateCost(endpoint, body) {
    if (endpoint.startsWith('predictions/')) return 0;
    if (endpoint === 'upload_file')           return 0;
    if (IMAGE_COSTS[endpoint] !== undefined)  return IMAGE_COSTS[endpoint];
    if (VIDEO_COST_PER_5S[endpoint] !== undefined) {
        const secs   = Math.max(5, parseInt(body?.duration) || 5);
        const base5s = VIDEO_COST_PER_5S[endpoint];
        return Math.ceil((base5s / 5) * secs * 1.35 * 100);
    }
    if (MUSIC_COSTS[endpoint] !== undefined) return MUSIC_COSTS[endpoint];
    return 1;
}

// ─── Verificar token con Firebase identitytoolkit ─────────────────────────────
async function verifyFirebaseToken(idToken, firebaseApiKey) {
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
        }
    );

    if (!res.ok) {
        const errText = await res.text();
        console.error('[API] identitytoolkit error:', res.status, errText);
        throw new Error('Token inválido');
    }

    const data = await res.json();
    const uid  = data.users?.[0]?.localId;
    if (!uid) throw new Error('Token inválido');
    return uid;
}

// ─── Firestore: descontar créditos con precondición updateTime ────────────────
async function firestoreDeductCredits(projectId, docPath, cost, accessToken, attempt = 0) {
    const baseUrl  = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const fullName = `projects/${projectId}/databases/(default)/documents/${docPath}`;

    // 1. Leer documento
    const readRes = await fetch(`${baseUrl}/${docPath}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!readRes.ok) {
        const errBody = await readRes.text();
        throw new Error(`Error leyendo créditos (${readRes.status}): ${errBody.slice(0, 200)}`);
    }

    const doc      = await readRes.json();
    const fields   = doc.fields || {};
    const credits  = parseInt(fields.credits?.integerValue ?? fields.credits?.doubleValue ?? 0);
    const isAdmin  = fields.role?.stringValue === 'admin';

    if (isAdmin) return { ok: true, isAdmin: true };

    if (credits < cost) {
        return {
            ok:      false,
            credits,
            cost,
            message: `Saldo insuficiente. Necesitas ${cost} 🪙 y tienes ${credits} 🪙.`,
        };
    }

    // 2. Escribir con precondición updateTime (atómico)
    const newCredits = credits - cost;
    const commitRes  = await fetch(`${baseUrl}:commit`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            writes: [{
                update: {
                    name:   fullName,
                    fields: { credits: { integerValue: String(newCredits) } },
                },
                updateMask:      { fieldPaths: ['credits'] },
                currentDocument: { updateTime: doc.updateTime },
            }],
        }),
    });

    if (!commitRes.ok) {
        const errBody = await commitRes.text();
        // Reintentar hasta 3 veces si hay conflicto de escritura concurrente
        if (
            attempt < 3 &&
            (commitRes.status === 409 ||
             errBody.includes('ABORTED') ||
             errBody.includes('FAILED_PRECONDITION'))
        ) {
            return firestoreDeductCredits(projectId, docPath, cost, accessToken, attempt + 1);
        }
        throw new Error(`Error actualizando créditos (${commitRes.status}): ${errBody.slice(0, 200)}`);
    }

    return { ok: true, isAdmin: false };
}

// ─── Firestore: reembolsar créditos ──────────────────────────────────────────
async function firestoreRefund(projectId, docPath, cost, accessToken) {
    const baseUrl  = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const fullName = `projects/${projectId}/databases/(default)/documents/${docPath}`;

    const readRes = await fetch(`${baseUrl}/${docPath}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!readRes.ok) return;

    const doc     = await readRes.json();
    const fields  = doc.fields || {};
    const credits = parseInt(fields.credits?.integerValue ?? 0);
    const isAdmin = fields.role?.stringValue === 'admin';
    if (isAdmin) return;

    await fetch(`${baseUrl}:commit`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            writes: [{
                update: {
                    name:   fullName,
                    fields: { credits: { integerValue: String(credits + cost) } },
                },
                updateMask:      { fieldPaths: ['credits'] },
                currentDocument: { updateTime: doc.updateTime },
            }],
        }),
    });
}

// ─── Obtener access token con Service Account (WebCrypto) ─────────────────────
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

    const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const jwt        = await signJWT(payload, privateKey);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenRes.ok) {
        const err = await tokenRes.text();
        throw new Error(`Error obteniendo access token: ${err.slice(0, 200)}`);
    }

    const { access_token } = await tokenRes.json();
    return access_token;
}

async function signJWT(payload, pemKey) {
    const header   = { alg: 'RS256', typ: 'JWT' };
    const b64u     = s => btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const b64Head  = b64u(JSON.stringify(header));
    const b64Pay   = b64u(JSON.stringify(payload));
    const unsigned = `${b64Head}.${b64Pay}`;

    const pemBody  = pemKey
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');
    const der      = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', der.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
    );

    const sig    = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned));
    const b64Sig = b64u(String.fromCharCode(...new Uint8Array(sig)));

    return `${unsigned}.${b64Sig}`;
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function onRequest(context) {
    const { request, env, params } = context;

    if (!env.MUAPI_KEY) return jsonError('API Key no configurada', 500);

    const endpoint    = params.path.join('/');
    const targetUrl   = `https://api.muapi.ai/api/v1/${endpoint}`;
    const contentType = request.headers.get('Content-Type') || '';

    // ── Leer body respetando Content-Type ──
    let body = {}, rawBody = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        if (contentType.includes('application/json')) {
            const text = await request.text();
            rawBody = text;
            try { body = JSON.parse(text || '{}'); } catch {}
        } else {
            // multipart/form-data u otros (upload_file)
            rawBody = await request.arrayBuffer();
        }
    }

    const cost = calculateCost(endpoint, body);

    // ── Verificar y descontar créditos ──
    let uid = null;
    if (cost > 0) {
        const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || '';
        const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

        if (!idToken) return jsonError('No autenticado', 401);

        try {
            uid = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
        } catch (e) {
            return jsonError('Token inválido o expirado', 401);
        }

        // Verificar variables de entorno
        const missing = ['FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY','FIREBASE_PROJECT_ID','FIREBASE_APP_ID']
            .filter(k => !env[k]);
        if (missing.length > 0) return jsonError('Config incompleta: ' + missing.join(', '), 500);

        try {
            const accessToken = await getServiceAccountToken(env);
            const docPath     = `artifacts/${env.FIREBASE_APP_ID}/public/data/users/${uid}`;
            const result      = await firestoreDeductCredits(env.FIREBASE_PROJECT_ID, docPath, cost, accessToken);
            if (!result.ok) return jsonError(result.message, 402);
        } catch (e) {
            return jsonError('ERROR_CREDITOS: ' + e.message, 500);
        }
    }

    // ── Llamar a MuAPI ──
    let muapiResponse, responseBody;
    try {
        const muapiHeaders = new Headers({ 'x-api-key': env.MUAPI_KEY });
        if (contentType) muapiHeaders.set('Content-Type', contentType);

        muapiResponse = await fetch(targetUrl, {
            method:  request.method,
            headers: muapiHeaders,
            body:    request.method !== 'GET' && request.method !== 'HEAD' ? rawBody : null,
        });
        responseBody = await muapiResponse.text();
    } catch (e) {
        // Reembolsar si MuAPI falla con error de red
        if (cost > 0 && uid) {
            try {
                const accessToken = await getServiceAccountToken(env);
                const docPath     = `artifacts/${env.FIREBASE_APP_ID}/public/data/users/${uid}`;
                await firestoreRefund(env.FIREBASE_PROJECT_ID, docPath, cost, accessToken);
            } catch {}
        }
        return jsonError('Error conectando con el servicio: ' + e.message, 502);
    }

    // Reembolsar si MuAPI devuelve error
    if (!muapiResponse.ok && cost > 0 && uid) {
        try {
            const accessToken = await getServiceAccountToken(env);
            const docPath     = `artifacts/${env.FIREBASE_APP_ID}/public/data/users/${uid}`;
            await firestoreRefund(env.FIREBASE_PROJECT_ID, docPath, cost, accessToken);
        } catch (e) {
            console.error('[API] Error en reembolso:', e.message);
        }
    }

    return new Response(responseBody, {
        status:  muapiResponse.status,
        headers: {
            'Content-Type':                muapiResponse.headers.get('content-type') || 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

export async function onRequestOptions() {
    return new Response(null, {
        status:  204,
        headers: {
            'Access-Control-Allow-Origin':  '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

function jsonError(message, status = 400) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
}
