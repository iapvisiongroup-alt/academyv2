// /functions/api/v1/[[path]].js
// Rutas opacas — el frontend nunca ve los nombres reales de modelos

// ─── Mapeo interno de rutas ───────────────────────────────────────────────────
// Frontend envía: /api/v1/generate/image/create
// Backend mapea: nano-banana-2 con coste 16

const MAIN_ADMIN_EMAILS = new Set([
    'info@iapvision.com',
    'info@kreateia.com',
]);

const ROUTE_MAP = {
    // IMAGEN
    'generate/image/create':       { endpoint: 'nano-banana-2',                    cost: 16 },
    'generate/image/edit':         { endpoint: 'nano-banana-2-edit',               cost:  8 },

    // VÍDEO — coste por 5s * 1.35 margen, escala con duration
    'generate/video/standard':     { endpoint: 'seedance-v2.0-t2v',                  costType: 'video', base5s: 0.75 },
    'generate/video/i2v':          { endpoint: 'seedance-2-vip-image-to-video-fast', costType: 'video', base5s: 1.05 },
    'generate/video/v2v':          { endpoint: 'seedance-2.0-omni-reference-480p',   costType: 'video', base5s: 1.44 },
    'generate/video/extend':       { endpoint: 'sd-2-vip-extend',                    costType: 'video', base5s: 1.05 },
    'generate/video/fast':         { endpoint: 'veo3.1-fast-text-to-video',          costType: 'video', base5s: 0.40 },
    'generate/video/fast-i2v':     { endpoint: 'veo3.1-lite-image-to-video',         costType: 'video', base5s: 0.30 },
    'generate/video/motion':       { endpoint: 'kling-v3.0-std-motion-control',      costType: 'video', base5s: 1.63 },

    // MÚSICA
    'generate/music/create':       { endpoint: 'suno-create-music',     costType: 'musicDuration' },
    'generate/music/extend':       { endpoint: 'suno-extend-music',     cost: 20 },
    'generate/music/remix':        { endpoint: 'suno-remix-music',      cost: 20 },
    'generate/music/vocals':       { endpoint: 'suno-add-vocals',       cost: 20 },
    'generate/music/instrumental': { endpoint: 'suno-add-instrumental', cost: 20 },
    'generate/music/mashup':       { endpoint: 'suno-generate-mashup',  cost: 20 },
    'generate/music/sounds':       { endpoint: 'suno-generate-sounds',  cost:  4 },
    'generate/music/clone-voice':  { endpoint: 'suno-voice-clone',      cost:  0 },
    'generate/music/lyrics':       { endpoint: 'gpt-5-mini',            cost: 20 },

    // ARTISTA (foto)
    'generate/artist/photo':       { endpoint: 'nano-banana-2',         cost: 16 },
    'generate/artist/photo-edit':  { endpoint: 'nano-banana-2-edit',    cost:  8 },
};

// Endpoints que no tienen coste y pasan directamente
const FREE_ENDPOINTS = new Set([
    'upload_file',
]);

function calculateCost(route, body) {
    // Polling de resultados — siempre gratis
    if (route.startsWith('predictions/')) return { cost: 0, muapiEndpoint: route };

    // Upload — gratis y pasa directamente
    if (FREE_ENDPOINTS.has(route)) return { cost: 0, muapiEndpoint: route };

    const mapped = ROUTE_MAP[route];
    if (!mapped) return null;

    let cost = mapped.cost ?? 0;

    // Coste imagen — escala con resolución
    if (mapped.cost !== undefined && (route.includes('image') || route.includes('artist'))) {
        const defaultRes  = route.includes('artist') ? '2k' : '720p';
        const resolution  = String(body?.resolution || defaultRes).toLowerCase();
        const multipliers = { '720p': 1, '1080p': 1.5, '2k': 2, '4k': 4 };
        cost = Math.ceil(mapped.cost * (multipliers[resolution] || 1));
    }

    // Coste vídeo — escala con duración y calidad
    if (mapped.costType === 'video') {
        const secs        = Math.max(5, parseInt(body?.duration) || 5);
        const qualityMult = body?.quality === 'high' ? 1.75 : 1;
        cost = Math.ceil((mapped.base5s / 5) * secs * 1.35 * 100 * qualityMult);
    }

    // Coste música — escala con duración (10 CR por minuto, mínimo 5)
    if (mapped.costType === 'musicDuration') {
        const secs = Math.max(30, parseInt(body?.duration) || 120);
        cost = Math.max(5, Math.ceil((secs / 60) * 10));
    }

    return { cost, muapiEndpoint: mapped.endpoint };
}

// ─── Verificar token Firebase ─────────────────────────────────────────────────
async function verifyFirebaseUser(idToken, firebaseApiKey) {
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
        }
    );

    if (!res.ok) {
        const t = await res.text();
        console.error('[API] identitytoolkit:', res.status, t.slice(0, 100));
        throw new Error('Token inválido');
    }

    const data  = await res.json();
    const user  = data.users?.[0];
    const uid   = user?.localId;
    const email = user?.email || '';

    if (!uid) throw new Error('Token inválido');

    return { uid, email };
}

async function verifyFirebaseToken(idToken, firebaseApiKey) {
    const user = await verifyFirebaseUser(idToken, firebaseApiKey);
    return user.uid;
}

function getBearerToken(request) {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || '';
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
}

// ─── Firestore helpers ────────────────────────────────────────────────────────
function firestoreValueToJs(value) {
    if (!value || typeof value !== 'object') return null;

    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue || 0);
    if ('doubleValue' in value) return Number(value.doubleValue || 0);
    if ('booleanValue' in value) return Boolean(value.booleanValue);
    if ('nullValue' in value) return null;
    if ('timestampValue' in value) return value.timestampValue;

    if ('arrayValue' in value) {
        return (value.arrayValue.values || []).map(firestoreValueToJs);
    }

    if ('mapValue' in value) {
        return firestoreFieldsToJs(value.mapValue.fields || {});
    }

    return null;
}

function firestoreFieldsToJs(fields) {
    const out = {};
    for (const [key, value] of Object.entries(fields || {})) {
        out[key] = firestoreValueToJs(value);
    }
    return out;
}

async function firestoreGetDoc(projectId, docPath, accessToken) {
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const res = await fetch(`${baseUrl}/${docPath}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404) return null;

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Error leyendo Firestore (${res.status}): ${errBody.slice(0, 200)}`);
    }

    const doc = await res.json();

    return {
        name: doc.name,
        updateTime: doc.updateTime,
        data: firestoreFieldsToJs(doc.fields || {}),
    };
}

// ─── Firestore: descontar créditos ───────────────────────────────────────────
async function firestoreDeductCredits(projectId, docPath, cost, accessToken, attempt = 0) {
    const baseUrl  = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const fullName = `projects/${projectId}/databases/(default)/documents/${docPath}`;

    const readRes = await fetch(`${baseUrl}/${docPath}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!readRes.ok) {
        const errBody = await readRes.text();
        throw new Error(`Error leyendo créditos (${readRes.status}): ${errBody.slice(0, 200)}`);
    }

    const doc      = await readRes.json();
    const fields   = doc.fields || {};
    const credits  = parseInt(fields.credits?.integerValue ?? fields.credits?.doubleValue ?? 0);

    if (credits < cost) {
        return {
            ok: false,
            credits,
            cost,
            message: `Saldo insuficiente. Necesitas ${cost} 🪙 y tienes ${credits} 🪙.`,
        };
    }

    const newCredits = credits - cost;
    const commitRes  = await fetch(`${baseUrl}:commit`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            writes: [{
                update: {
                    name: fullName,
                    fields: {
                        credits: { integerValue: String(newCredits) },
                    },
                },
                updateMask: { fieldPaths: ['credits'] },
                currentDocument: { updateTime: doc.updateTime },
            }],
        }),
    });

    if (!commitRes.ok) {
        const errBody = await commitRes.text();

        if (
            attempt < 3
            && (
                commitRes.status === 409
                || errBody.includes('ABORTED')
                || errBody.includes('FAILED_PRECONDITION')
            )
        ) {
            return firestoreDeductCredits(projectId, docPath, cost, accessToken, attempt + 1);
        }

        throw new Error(`Error actualizando créditos (${commitRes.status}): ${errBody.slice(0, 200)}`);
    }

    return { ok: true };
}

// ─── Firestore: reembolsar ────────────────────────────────────────────────────
async function firestoreRefund(projectId, docPath, cost, accessToken) {
    if (cost <= 0) return;

    const baseUrl  = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const fullName = `projects/${projectId}/databases/(default)/documents/${docPath}`;

    const readRes = await fetch(`${baseUrl}/${docPath}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!readRes.ok) return;

    const doc      = await readRes.json();
    const credits  = parseInt(doc.fields?.credits?.integerValue ?? 0);

    await fetch(`${baseUrl}:commit`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            writes: [{
                update: {
                    name: fullName,
                    fields: {
                        credits: { integerValue: String(credits + cost) },
                    },
                },
                updateMask: { fieldPaths: ['credits'] },
                currentDocument: { updateTime: doc.updateTime },
            }],
        }),
    });
}

// ─── Service Account JWT ──────────────────────────────────────────────────────
async function getServiceAccountToken(env) {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
        iss: env.FIREBASE_CLIENT_EMAIL,
        sub: env.FIREBASE_CLIENT_EMAIL,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/datastore',
    };

    const jwt = await signJWT(payload, env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'));

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!res.ok) {
        const e = await res.text();
        throw new Error(`Token SA: ${e.slice(0, 200)}`);
    }

    return (await res.json()).access_token;
}

async function signJWT(payload, pemKey) {
    const b64u = s => btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const header   = { alg: 'RS256', typ: 'JWT' };
    const unsigned = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;

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

    return `${unsigned}.${b64u(String.fromCharCode(...new Uint8Array(sig)))}`;
}

// ─── Media proxy helpers ──────────────────────────────────────────────────────
function randomCode() {
    const b = crypto.getRandomValues(new Uint8Array(4));
    return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function b64u(bytes) {
    let s = '';
    bytes.forEach(b => s += String.fromCharCode(b));
    return btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function unb64u(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str);
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function mediaKey(secret) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
    return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptMediaUrl(url, env) {
    const code = randomCode();
    const key  = await mediaKey(env.MEDIA_SECRET);
    const iv   = crypto.getRandomValues(new Uint8Array(12));

    const enc = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(JSON.stringify({ url, code }))
    ));

    const packed = new Uint8Array(iv.length + enc.length);
    packed.set(iv, 0);
    packed.set(enc, iv.length);

    return { code, token: b64u(packed) };
}

async function decryptMediaToken(token, env) {
    const packed = unb64u(token);
    const iv     = packed.slice(0, 12);
    const data   = packed.slice(12);
    const key    = await mediaKey(env.MEDIA_SECRET);

    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return JSON.parse(new TextDecoder().decode(dec));
}

function looksLikeMediaUrl(value) {
    if (typeof value !== 'string') return false;
    if (!value.startsWith('http://') && !value.startsWith('https://')) return false;

    // Ya es una URL proxied nuestra
    if (value.includes('/api/v1/media/kreateia-')) return false;

    const externalDomains = [
        'muapi.ai',
        'cdn.muapi.ai',
        'cloudfront.net',
        'd3adwkbyhxyrtq',
        'storage.googleapis.com',
        'replicate.delivery',
        'pbxt.replicate',
        'lh3.googleusercontent',
        'suno.ai',
        'cdn.suno.ai',
    ];

    return externalDomains.some(d => value.includes(d));
}

async function wrapMediaUrls(value, env, request) {
    if (!env.MEDIA_SECRET) return value;

    if (looksLikeMediaUrl(value)) {
        const { code, token } = await encryptMediaUrl(value, env);
        const origin = new URL(request.url).origin;
        return `${origin}/api/v1/media/kreateia-${code}/${token}`;
    }

    if (Array.isArray(value)) {
        return Promise.all(value.map(v => wrapMediaUrls(v, env, request)));
    }

    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = await wrapMediaUrls(v, env, request);
        }
        return out;
    }

    return value;
}

function getOwnMediaToken(value, request) {
    if (typeof value !== 'string') return null;
    if (!value.includes('/api/v1/media/kreateia-')) return null;

    try {
        const current = new URL(request.url);
        const url = new URL(value, current.origin);
        const parts = url.pathname.split('/').filter(Boolean);

        const mediaIndex = parts.findIndex(p => p === 'media');
        if (mediaIndex === -1) return null;

        return parts[mediaIndex + 2] || null;
    } catch {
        return null;
    }
}

async function unwrapIncomingMediaUrls(value, env, request) {
    if (!env.MEDIA_SECRET) return value;

    const token = getOwnMediaToken(value, request);
    if (token) {
        try {
            const payload = await decryptMediaToken(token, env);
            if (payload?.url) return payload.url;
        } catch {}
    }

    if (Array.isArray(value)) {
        return Promise.all(value.map(v => unwrapIncomingMediaUrls(v, env, request)));
    }

    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = await unwrapIncomingMediaUrls(v, env, request);
        }
        return out;
    }

    return value;
}

async function handleMediaProxy(route, request, env) {
    if (!env.MEDIA_SECRET) return jsonError('MEDIA_SECRET no configurado', 500);

    const parts = route.split('/');
    const token = parts[2];

    if (!token) return jsonError('Media token inválido', 400);

    let payload;
    try {
        payload = await decryptMediaToken(token, env);
    } catch {
        return jsonError('Media token inválido', 400);
    }

    return new Response(null, {
        status: 302,
        headers: {
            Location: payload.url,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

// ─── Herramientas dinámicas desde admin ────────────────────────────────────────
function normalizeEndpoint(endpoint) {
    return String(endpoint || '')
        .trim()
        .replace(/^https:\/\/api\.muapi\.ai\/api\/v1\//, '')
        .replace(/^\/?api\/v1\//, '')
        .replace(/^\/+/, '');
}

function getOptionValues(options) {
    if (!Array.isArray(options)) return [];
    return options.map(opt => {
        if (opt && typeof opt === 'object') return String(opt.value ?? opt.id ?? opt.label ?? '');
        return String(opt);
    }).filter(Boolean);
}

function getDynamicToolCost(tool, inputs) {
    const pricing = tool.pricing && typeof tool.pricing === 'object' ? tool.pricing : {};
    const priceKey = String(
        inputs?.quality
        || inputs?.resolution
        || inputs?.duration
        || inputs?.size
        || 'default'
    );

    let rawCost = pricing[priceKey];

    if (rawCost === undefined || rawCost === null || rawCost === '') {
        rawCost = pricing.default;
    }

    if (rawCost === undefined || rawCost === null || rawCost === '') {
        rawCost = tool.costCredits ?? tool.cost ?? 0;
    }

    return Math.max(0, Math.ceil(Number(rawCost) || 0));
}

function buildDynamicToolParams(tool, inputs) {
    const params = {};

    if (tool.defaultParams && typeof tool.defaultParams === 'object') {
        Object.assign(params, tool.defaultParams);
    }

    if (tool.params && typeof tool.params === 'object') {
        Object.assign(params, tool.params);
    }

    const schema = Array.isArray(tool.schema) ? tool.schema : [];

    if (schema.length) {
        for (const field of schema) {
            const key = field?.key;
            if (!key) continue;

            const paramKey = field.paramKey || field.muapiKey || key;
            let value = inputs[key];

            if ((value === undefined || value === null || value === '') && field.default !== undefined) {
                value = field.default;
            }

            if (field.required && (value === undefined || value === null || value === '')) {
                throw new Error(`Falta el campo obligatorio: ${field.label || key}`);
            }

            if (value === undefined || value === null || value === '') continue;

            const allowed = getOptionValues(field.options);
            if (allowed.length && !allowed.includes(String(value))) {
                throw new Error(`Valor no permitido para ${field.label || key}.`);
            }

            if (field.type === 'number' || field.type === 'range') {
                value = Number(value);
                if (!Number.isFinite(value)) throw new Error(`Valor numérico inválido: ${field.label || key}`);
            }

            if (field.type === 'boolean') {
                value = value === true || value === 'true';
            }

            params[paramKey] = value;
        }
    } else {
        Object.assign(params, inputs || {});
    }

    if (tool.paramMap && typeof tool.paramMap === 'object') {
        for (const [inputKey, paramKey] of Object.entries(tool.paramMap)) {
            if (inputs[inputKey] !== undefined) params[paramKey] = inputs[inputKey];
        }
    }

    if (params.quality && !params.resolution) {
        params.resolution = params.quality;
    }

    if (tool.fixedParams && typeof tool.fixedParams === 'object') {
        Object.assign(params, tool.fixedParams);
    }

    delete params.toolId;
    delete params.cost;
    delete params.price;
    delete params.credits;

    return params;
}

async function handleDynamicToolRun(context, body) {
    const { request, env } = context;

    if (request.method !== 'POST') {
        return jsonError('Método no permitido', 405);
    }

    const token = getBearerToken(request);
    if (!token) return jsonError('No autenticado', 401);

    const missing = [
        'FIREBASE_API_KEY',
        'FIREBASE_CLIENT_EMAIL',
        'FIREBASE_PRIVATE_KEY',
        'FIREBASE_PROJECT_ID',
        'FIREBASE_APP_ID',
    ].filter(k => !env[k]);

    if (missing.length) {
        return jsonError('Config incompleta: ' + missing.join(', '), 500);
    }

    let user;
    try {
        user = await verifyFirebaseUser(token, env.FIREBASE_API_KEY);
    } catch {
        return jsonError('Token inválido o expirado', 401);
    }

    const toolId = String(body?.toolId || '').trim();
    const inputs = body?.inputs && typeof body.inputs === 'object' ? body.inputs : {};

    if (!toolId) return jsonError('Falta toolId', 400);

    let accessToken;
    try {
        accessToken = await getServiceAccountToken(env);
    } catch (e) {
        return jsonError('ERROR_FIREBASE: ' + e.message, 500);
    }

    let toolDoc;
    try {
        toolDoc = await firestoreGetDoc(env.FIREBASE_PROJECT_ID, `admin_ai_tools/${toolId}`, accessToken);
    } catch (e) {
        return jsonError('No se pudo leer la herramienta: ' + e.message, 500);
    }

    if (!toolDoc) return jsonError('Herramienta no encontrada.', 404);

    const tool = toolDoc.data || {};
    const isAdmin = MAIN_ADMIN_EMAILS.has(String(user.email || '').toLowerCase());

    if (tool.enabled !== true && !isAdmin) {
        return jsonError('Esta herramienta no está activa.', 403);
    }

    const endpoint = normalizeEndpoint(tool.endpoint || tool.muapiEndpoint || tool.model);
    if (!endpoint) return jsonError('La herramienta no tiene endpoint de MuAPI configurado.', 500);

    if (tool.provider && String(tool.provider).toLowerCase() !== 'muapi') {
        return jsonError('Proveedor no soportado todavía.', 400);
    }

    let params;
    let cost;

    try {
        cost = getDynamicToolCost(tool, inputs);
        params = buildDynamicToolParams(tool, inputs);
        params = await unwrapIncomingMediaUrls(params, env, request);
    } catch (e) {
        return jsonError(e.message || 'Configuración inválida de herramienta.', 400);
    }

    const userDocPath = `artifacts/${env.FIREBASE_APP_ID}/public/data/users/${user.uid}`;

    if (cost > 0) {
        try {
            const result = await firestoreDeductCredits(
                env.FIREBASE_PROJECT_ID,
                userDocPath,
                cost,
                accessToken
            );

            if (!result.ok) return jsonError(result.message, 402);
        } catch (e) {
            return jsonError('ERROR_CREDITOS: ' + e.message, 500);
        }
    }

    const targetUrl = `https://api.muapi.ai/api/v1/${endpoint}`;

    let muapiResponse;
    let responseBody;

    try {
        muapiResponse = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'x-api-key': env.MUAPI_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
        });

        responseBody = await muapiResponse.text();
    } catch (e) {
        if (cost > 0) {
            try {
                await firestoreRefund(env.FIREBASE_PROJECT_ID, userDocPath, cost, accessToken);
            } catch {}
        }

        return jsonError('Error conectando con el servicio: ' + e.message, 502);
    }

    if (!muapiResponse.ok && cost > 0) {
        try {
            await firestoreRefund(env.FIREBASE_PROJECT_ID, userDocPath, cost, accessToken);
        } catch (e) {
            console.error('[API] Error reembolso herramienta:', e.message);
        }
    }

    const responseContentType = muapiResponse.headers.get('content-type') || 'application/json';

    if (muapiResponse.ok && responseContentType.includes('application/json') && env.MEDIA_SECRET) {
        try {
            const parsed = JSON.parse(responseBody);
            const wrapped = await wrapMediaUrls(parsed, env, request);
            responseBody = JSON.stringify(wrapped);
        } catch {}
    }

    return new Response(responseBody, {
        status: muapiResponse.status,
        headers: {
            'Content-Type': responseContentType,
            'Access-Control-Allow-Origin': '*',
        },
    });
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function onRequest(context) {
    const { request, env, params } = context;

    if (!env.MUAPI_KEY) return jsonError('API Key no configurada', 500);

    const route = Array.isArray(params.path)
        ? params.path.join('/')
        : String(params.path || '');

    // Media proxy — devuelve archivos con URL opaca kreateia-...
    if (route.startsWith('media/')) {
        return handleMediaProxy(route, request, env);
    }

    const contentType = request.headers.get('Content-Type') || '';

    // Leer body
    let body = {};
    let rawBody = null;

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        if (contentType.includes('application/json')) {
            const text = await request.text();
            try {
                body = JSON.parse(text || '{}');
            } catch {
                body = {};
            }

            body = await unwrapIncomingMediaUrls(body, env, request);
            rawBody = JSON.stringify(body);
        } else {
            rawBody = await request.arrayBuffer();
        }
    }

    // Nueva ruta dinámica:
    // POST /api/v1/tools/run
    if (route === 'tools/run') {
        return handleDynamicToolRun(context, body);
    }

    // Calcular coste y resolver endpoint real
    const resolved = calculateCost(route, body);
    if (!resolved) return jsonError(`Ruta desconocida: ${route}`, 404);

    const { cost, muapiEndpoint } = resolved;
    const targetUrl = `https://api.muapi.ai/api/v1/${muapiEndpoint}`;

    // Verificar créditos si hay coste
    let uid = null;

    if (cost > 0) {
        const idToken = getBearerToken(request);
        if (!idToken) return jsonError('No autenticado', 401);

        try {
            uid = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
        } catch {
            return jsonError('Token inválido o expirado', 401);
        }

        const missing = [
            'FIREBASE_CLIENT_EMAIL',
            'FIREBASE_PRIVATE_KEY',
            'FIREBASE_PROJECT_ID',
            'FIREBASE_APP_ID',
        ].filter(k => !env[k]);

        if (missing.length) {
            return jsonError('Config incompleta: ' + missing.join(', '), 500);
        }

        try {
            const accessToken = await getServiceAccountToken(env);
            const docPath = `artifacts/${env.FIREBASE_APP_ID}/public/data/users/${uid}`;
            const result = await firestoreDeductCredits(
                env.FIREBASE_PROJECT_ID,
                docPath,
                cost,
                accessToken
            );

            if (!result.ok) return jsonError(result.message, 402);
        } catch (e) {
            return jsonError('ERROR_CREDITOS: ' + e.message, 500);
        }
    }

    // Llamar a MuAPI
    let muapiResponse;
    let responseBody;

    try {
        const muapiHeaders = new Headers({ 'x-api-key': env.MUAPI_KEY });
        if (contentType) muapiHeaders.set('Content-Type', contentType);

        muapiResponse = await fetch(targetUrl, {
            method: request.method,
            headers: muapiHeaders,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? rawBody : null,
        });

        responseBody = await muapiResponse.text();
    } catch (e) {
        if (cost > 0 && uid) {
            try {
                const at = await getServiceAccountToken(env);
                await firestoreRefund(
                    env.FIREBASE_PROJECT_ID,
                    `artifacts/${env.FIREBASE_APP_ID}/public/data/users/${uid}`,
                    cost,
                    at
                );
            } catch {}
        }

        return jsonError('Error conectando con el servicio: ' + e.message, 502);
    }

    // Reembolsar si MuAPI falla inmediatamente
    if (!muapiResponse.ok && cost > 0 && uid) {
        try {
            const at = await getServiceAccountToken(env);
            await firestoreRefund(
                env.FIREBASE_PROJECT_ID,
                `artifacts/${env.FIREBASE_APP_ID}/public/data/users/${uid}`,
                cost,
                at
            );
        } catch (e) {
            console.error('[API] Error reembolso:', e.message);
        }
    }

    // Envolver URLs de MuAPI con proxy kreateia-...
    const responseContentType = muapiResponse.headers.get('content-type') || '';

    if (muapiResponse.ok && responseContentType.includes('application/json') && env.MEDIA_SECRET) {
        try {
            const parsed  = JSON.parse(responseBody);
            const wrapped = await wrapMediaUrls(parsed, env, request);
            responseBody  = JSON.stringify(wrapped);
        } catch {}
    }

    return new Response(responseBody, {
        status: muapiResponse.status,
        headers: {
            'Content-Type': responseContentType || 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

function jsonError(message, status = 400) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}
