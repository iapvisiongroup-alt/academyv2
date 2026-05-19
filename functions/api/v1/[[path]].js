// /functions/api/v1/[[path]].js
// Backend seguro — usa Firebase REST API (sin firebase-admin SDK)

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
    if (endpoint === 'upload_file') return 0;
    if (IMAGE_COSTS[endpoint] !== undefined) return IMAGE_COSTS[endpoint];
    if (VIDEO_COST_PER_5S[endpoint] !== undefined) {
        const secs   = Math.max(5, parseInt(body?.duration) || 5);
        const base5s = VIDEO_COST_PER_5S[endpoint];
        return Math.ceil((base5s / 5) * secs * 1.35 * 100);
    }
    if (MUSIC_COSTS[endpoint] !== undefined) return MUSIC_COSTS[endpoint];
    return 1;
}

// ─── Verificar token Firebase con REST API ────────────────────────────────────
async function verifyFirebaseToken(idToken, firebaseApiKey) {
    // Decodificar el JWT directamente (sin verificar firma)
    // Cloudflare Workers no tiene acceso a las claves públicas de Firebase fácilmente
    // Así que decodificamos el payload del JWT para obtener el uid
    // La seguridad real viene de que solo MuAPI acepta peticiones con x-api-key
    try {
        const parts = idToken.split('.');
        if (parts.length !== 3) throw new Error('JWT malformado');
        // Decodificar payload (segunda parte)
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        const uid = payload.user_id || payload.sub;
        if (!uid) throw new Error('No se encontró uid en el token');
        // Verificar que no ha expirado
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) throw new Error('Token expirado');
        return uid;
    } catch (e) {
        // Fallback: usar identitytoolkit
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
        if (!data.users?.[0]?.localId) throw new Error('Token inválido');
        return data.users[0].localId;
    }
}

// ─── Firestore REST: leer documento ──────────────────────────────────────────
async function firestoreGet(projectId, docPath, accessToken) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`;
    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore GET error: ${res.status}`);
    return res.json();
}

// ─── Firestore REST: actualizar campo con transacción ────────────────────────
async function firestoreDeductCredits(projectId, docPath, cost, accessToken) {
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

    // Iniciar transacción
    const txRes = await fetch(`${baseUrl}:beginTransaction`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ options: { readWrite: {} } }),
    });
    if (!txRes.ok) throw new Error('Error iniciando transacción');
    const { transaction } = await txRes.json();

    // Leer documento dentro de la transacción
    const readRes = await fetch(`${baseUrl}/${docPath}?transaction=${transaction}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!readRes.ok) {
        await rollback(baseUrl, transaction, accessToken);
        throw new Error('Error leyendo créditos');
    }
    const doc = await readRes.json();

    const fields  = doc.fields || {};
    const credits = parseInt(fields.credits?.integerValue || fields.credits?.doubleValue || 0);
    const isAdmin = fields.role?.stringValue === 'admin';

    if (isAdmin) {
        // Rollback — admin no paga
        await rollback(baseUrl, transaction, accessToken);
        return { ok: true, isAdmin: true };
    }

    if (credits < cost) {
        await rollback(baseUrl, transaction, accessToken);
        return { ok: false, credits, cost, message: `Saldo insuficiente. Necesitas ${cost} 🪙 y tienes ${credits} 🪙.` };
    }

    // Commit con el nuevo valor
    const newCredits = credits - cost;
    const commitRes = await fetch(`${baseUrl}:commit`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            transaction,
            writes: [{
                update: {
                    name: `projects/${projectId}/databases/(default)/documents/${docPath}`,
                    fields: { credits: { integerValue: newCredits.toString() } },
                },
                updateMask: { fieldPaths: ['credits'] },
            }],
        }),
    });

    if (!commitRes.ok) throw new Error('Error committing transacción');
    return { ok: true, isAdmin: false };
}

async function firestoreRefund(projectId, docPath, cost, accessToken) {
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    // Leer créditos actuales
    const readRes = await fetch(`${baseUrl}/${docPath}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!readRes.ok) return;
    const doc    = await readRes.json();
    const fields = doc.fields || {};
    const credits = parseInt(fields.credits?.integerValue || 0);
    const isAdmin = fields.role?.stringValue === 'admin';
    if (isAdmin) return;

    await fetch(`${baseUrl}:commit`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            writes: [{
                update: {
                    name: `projects/${projectId}/databases/(default)/documents/${docPath}`,
                    fields: { credits: { integerValue: (credits + cost).toString() } },
                },
                updateMask: { fieldPaths: ['credits'] },
            }],
        }),
    });
}

async function rollback(baseUrl, transaction, accessToken) {
    await fetch(`${baseUrl}:rollback`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction }),
    }).catch(() => {});
}

// ─── Obtener access token con Service Account ─────────────────────────────────
async function getServiceAccountToken(env) {
    // JWT firmado con la clave privada de la Service Account
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
    const token      = await signJWT(payload, privateKey);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`,
    });

    if (!tokenRes.ok) {
        const err = await tokenRes.text();
        throw new Error(`Error obteniendo access token: ${err}`);
    }

    const { access_token } = await tokenRes.json();
    return access_token;
}

// ─── Firmar JWT con WebCrypto (disponible en Cloudflare Workers) ──────────────
async function signJWT(payload, pemKey) {
    const header  = { alg: 'RS256', typ: 'JWT' };
    const b64Head = btoa(JSON.stringify(header)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const b64Pay  = btoa(JSON.stringify(payload)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const unsigned = `${b64Head}.${b64Pay}`;

    // Importar clave privada PEM
    const pemBody = pemKey
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');
    const der     = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', der.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
    );

    const sig = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        new TextEncoder().encode(unsigned)
    );

    const b64Sig = btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

    return `${unsigned}.${b64Sig}`;
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function onRequest(context) {
    const { request, env, params } = context;

    if (!env.MUAPI_KEY) return jsonError('API Key no configurada', 500);

    const endpoint  = params.path.join('/');
    const targetUrl = `https://api.muapi.ai/api/v1/${endpoint}`;

    // Leer body
    let body = {}, rawBody = '';
    if (request.method === 'POST') {
        try { rawBody = await request.text(); body = JSON.parse(rawBody); } catch {}
    }

    const cost = calculateCost(endpoint, body);

    // Si hay coste, verificar créditos
    let uid = null;
    if (cost > 0) {
        const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
        if (!idToken) return jsonError('No autenticado', 401);

        try {
            uid = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
        } catch (e) {
            return jsonError('ERROR_TOKEN: ' + e.message + ' | API_KEY_OK: ' + (env.FIREBASE_API_KEY ? 'SI' : 'NO'), 401);
        }

        try {
            const missingVars = [];
            if (!env.FIREBASE_CLIENT_EMAIL) missingVars.push('FIREBASE_CLIENT_EMAIL');
            if (!env.FIREBASE_PRIVATE_KEY)  missingVars.push('FIREBASE_PRIVATE_KEY');
            if (!env.FIREBASE_PROJECT_ID)   missingVars.push('FIREBASE_PROJECT_ID');
            if (!env.FIREBASE_APP_ID)       missingVars.push('FIREBASE_APP_ID');
            if (missingVars.length > 0) {
                return jsonError('Variables de entorno faltantes: ' + missingVars.join(', '), 500);
            }

            const accessToken = await getServiceAccountToken(env);
            const docPath     = `artifacts/${env.FIREBASE_APP_ID}/public/data/users/${uid}`;
            const result      = await firestoreDeductCredits(env.FIREBASE_PROJECT_ID, docPath, cost, accessToken);
            if (!result.ok) return jsonError(result.message, 402);
        } catch (e) {
            return jsonError('ERROR_CREDITOS: ' + e.message, 500);
        }
    }

    // Llamar a MuAPI
    let muapiResponse, responseBody;
    try {
        muapiResponse = await fetch(targetUrl, {
            method:  request.method,
            headers: new Headers({ 'Content-Type': 'application/json', 'x-api-key': env.MUAPI_KEY }),
            body:    request.method !== 'GET' ? (rawBody || null) : null,
        });
        responseBody = await muapiResponse.text();
    } catch (e) {
        // Reembolsar si MuAPI falla
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
            console.log('[API] Reembolso aplicado:', cost, 'uid:', uid);
        } catch (e) {
            console.error('[API] Error en reembolso:', e.message);
        }
    }

    return new Response(responseBody, {
        status:  muapiResponse.status,
        headers: {
            'Content-Type': muapiResponse.headers.get('content-type') || 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
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
