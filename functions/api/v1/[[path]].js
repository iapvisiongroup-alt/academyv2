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
    'generate/image/t2-create':    { endpoint: 'openai-gpt-image-2-create',         costType: 'gptImage2' },
    'generate/image/t2-edit':      { endpoint: 'gpt-image-2-image-to-image',         costType: 'gptImage2' },

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
    'generate/music/clone-voice':  { endpoint: 'suno-voice-clone',      cost: 20 },
    'generate/music/lyrics':       { endpoint: 'gpt-5-mini',            cost: 20 },

    // ARTISTA (foto)
    'generate/artist/photo':       { endpoint: 'nano-banana-2',         cost: 16 },
    'generate/artist/photo-edit':  { endpoint: 'nano-banana-2-edit',    cost:  8 },
};

// Endpoints que no tienen coste y pasan directamente
const FREE_ENDPOINTS = new Set([
    'upload_file',
]);

const MAX_JSON_BODY_BYTES = 1_000_000;
const MAX_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_UPLOADS_PER_HOUR = 30;
const ALLOWED_IMAGE_UPLOAD_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
]);
const ALLOWED_VIDEO_UPLOAD_TYPES = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',
]);

function calculateCost(route, body) {
    // Polling de resultados — siempre gratis
    if (route.startsWith('predictions/')) return { cost: 0, muapiEndpoint: route };

    // Upload — gratis y pasa directamente
    if (FREE_ENDPOINTS.has(route)) return { cost: 0, muapiEndpoint: route };

    const mapped = ROUTE_MAP[route];
    if (!mapped) return null;

    let cost = mapped.cost ?? 0;

    if (mapped.costType === 'gptImage2') {
        const resolution = String(body?.resolution || '1K').toLowerCase();
        if (route === 'generate/image/t2-edit') {
            // MuAPI: 0,09 USD en 2K y 0,15 USD en 4K, con un margen del 40%.
            cost = resolution === '4k' ? 21 : 13;
        } else {
            cost = resolution === '4k' ? 245 : resolution === '2k' ? 125 : 30;
        }
    }

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

function normalizeGptImage2Request(route, body) {
    if (route !== 'generate/image/t2-create' && route !== 'generate/image/t2-edit') {
        return body;
    }

    const allowedAspectRatios = new Set(['auto', '1:1', '16:9', '9:16', '4:3', '3:4']);
    const requestedAspectRatio = String(body?.aspect_ratio || 'auto');
    const requestedResolution = String(body?.resolution || '1K').toUpperCase();

    const normalized = {
        prompt: String(body?.prompt || '').trim(),
        aspect_ratio: allowedAspectRatios.has(requestedAspectRatio) ? requestedAspectRatio : 'auto',
        resolution: requestedResolution === '4K'
            ? '4K'
            : requestedResolution === '2K'
                ? '2K'
                : '1K',
        quality: 'high',
    };

    if (route === 'generate/image/t2-edit') {
        normalized.images_list = Array.isArray(body?.images_list)
            ? body.images_list.filter(value => typeof value === 'string' && value).slice(0, 16)
            : [];
    }

    return normalized;
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

async function checkEdgeRateLimit(context, identity, namespace, limit, windowSeconds) {
    if (typeof caches === 'undefined' || !caches.default) {
        return { allowed: true, retryAfter: 0 };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowSeconds / windowSeconds);
    const bucketEndsAt = (bucket + 1) * windowSeconds;
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${namespace}:${identity}`)
    );
    const hash = Array.from(new Uint8Array(digest).slice(0, 12))
        .map(value => value.toString(16).padStart(2, '0'))
        .join('');
    const key = new Request(`https://rate-limit.kreateia.internal/${namespace}/${hash}/${bucket}`);
    const cached = await caches.default.match(key);
    const current = cached ? Math.max(0, Number(await cached.text()) || 0) : 0;

    if (current >= limit) {
        return {
            allowed: false,
            retryAfter: Math.max(1, bucketEndsAt - nowSeconds),
        };
    }

    const write = caches.default.put(key, new Response(String(current + 1), {
        headers: {
            'Cache-Control': `public, max-age=${windowSeconds}`,
            'Content-Type': 'text/plain',
        },
    }));

    if (typeof context.waitUntil === 'function') context.waitUntil(write);
    else await write;

    return { allowed: true, retryAfter: 0 };
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
        scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.read_write',
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

function getMediaSecret(env) {
    return env.MEDIA_SECRET || env.FIREBASE_PRIVATE_KEY || env.MUAPI_KEY || '';
}

async function encryptMediaUrl(url, env) {
    const code = randomCode();
    const key  = await mediaKey(getMediaSecret(env));
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
    const key    = await mediaKey(getMediaSecret(env));

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
        'firebasestorage.googleapis.com',
        'replicate.delivery',
        'pbxt.replicate',
        'lh3.googleusercontent',
        'suno.ai',
        'cdn.suno.ai',
    ];

    return externalDomains.some(d => value.includes(d));
}

function isOwnStorageUrl(value, env) {
    if (typeof value !== 'string') return false;
    const bucket = getFirebaseStorageBucket(env);
    return value.includes('firebasestorage.googleapis.com')
        && value.includes(`/b/${encodeURIComponent(bucket)}/o/`);
}

function getFirebaseStorageBucket(env) {
    return String(
        env.FIREBASE_STORAGE_BUCKET
        || env.FIREBASE_BUCKET
        || (env.FIREBASE_PROJECT_ID ? `${env.FIREBASE_PROJECT_ID}.firebasestorage.app` : '')
    ).trim();
}

function safeStorageNamePart(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'media';
}

function extensionFromContentType(contentType) {
    const type = String(contentType || '').toLowerCase();
    if (type.includes('image/png')) return 'png';
    if (type.includes('image/webp')) return 'webp';
    if (type.includes('image/gif')) return 'gif';
    if (type.includes('image/jpeg') || type.includes('image/jpg')) return 'jpg';
    if (type.includes('video/mp4')) return 'mp4';
    if (type.includes('video/webm')) return 'webm';
    if (type.includes('video/quicktime')) return 'mov';
    if (type.includes('audio/mpeg')) return 'mp3';
    if (type.includes('audio/wav')) return 'wav';
    return 'bin';
}

function hasBytes(bytes, offset, expected) {
    return expected.every((value, index) => bytes[offset + index] === value);
}

function hasAscii(bytes, offset, expected) {
    return expected.split('').every((value, index) => bytes[offset + index] === value.charCodeAt(0));
}

function uploadBytesMatchContentType(bytes, contentType) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 12) return false;

    if (contentType === 'image/jpeg') return hasBytes(bytes, 0, [0xff, 0xd8, 0xff]);
    if (contentType === 'image/png') return hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (contentType === 'image/gif') return hasAscii(bytes, 0, 'GIF87a') || hasAscii(bytes, 0, 'GIF89a');
    if (contentType === 'image/webp') return hasAscii(bytes, 0, 'RIFF') && hasAscii(bytes, 8, 'WEBP');
    if (contentType === 'image/avif') {
        return hasAscii(bytes, 4, 'ftyp')
            && ['avif', 'avis'].some(brand => hasAscii(bytes, 8, brand));
    }
    if (contentType === 'video/webm') return hasBytes(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3]);
    if (contentType === 'video/mp4' || contentType === 'video/quicktime') {
        return hasAscii(bytes, 4, 'ftyp');
    }

    return false;
}

function isSafeProxiedMediaType(contentType) {
    const type = String(contentType || '').split(';')[0].trim().toLowerCase();
    return ALLOWED_IMAGE_UPLOAD_TYPES.has(type)
        || ALLOWED_VIDEO_UPLOAD_TYPES.has(type)
        || type === 'audio/mpeg'
        || type === 'audio/mp4'
        || type === 'audio/wav'
        || type === 'audio/x-wav'
        || type === 'audio/ogg';
}

function randomStorageId() {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return [...bytes].map(v => v.toString(16).padStart(2, '0')).join('');
}

function isLikelyXmlAccessDenied(text) {
    return /<Code>\s*AccessDenied\s*<\/Code>/i.test(text || '')
        || /<Message>\s*Access Denied\s*<\/Message>/i.test(text || '');
}

function getProviderMediaHeaders(url, env) {
    const headers = new Headers();

    try {
        const hostname = new URL(url).hostname.toLowerCase();
        if ((hostname === 'api.muapi.ai' || hostname.endsWith('.muapi.ai')) && env.MUAPI_KEY) {
            headers.set('x-api-key', env.MUAPI_KEY);
            headers.set('Accept', 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8');
            headers.set('Referer', 'https://muapi.ai/');
            headers.set('User-Agent', 'Mozilla/5.0 (compatible; KreateIA/1.0; +https://kreateia.com)');
        }
    } catch {}

    return headers;
}

async function fetchExternalImage(url, env) {
    const providerHeaders = getProviderMediaHeaders(url, env);
    let headContentType = '';

    try {
        const head = await fetch(url, {
            method: 'HEAD',
            headers: providerHeaders,
        });
        headContentType = head.headers.get('content-type') || '';

        if (head.ok && headContentType && !headContentType.toLowerCase().startsWith('image/')) {
            return null;
        }
    } catch {}

    const res = await fetch(url, { headers: providerHeaders });
    const contentType = res.headers.get('content-type') || headContentType || 'application/octet-stream';

    if (!res.ok) return null;

    const bytes = await res.arrayBuffer();

    if (!String(contentType).toLowerCase().startsWith('image/')) {
        const preview = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.byteLength, 500)));
        if (isLikelyXmlAccessDenied(preview)) return null;
        return null;
    }

    return { bytes, contentType };
}

async function uploadImageBytesToFirebaseStorage({
    bytes,
    contentType,
    uid,
    env,
    accessToken,
    source = 'kreateia-generated-media',
}) {
    const bucket = getFirebaseStorageBucket(env);
    if (!bucket || !env.FIREBASE_PROJECT_ID || !accessToken) {
        throw new Error('Firebase Storage no está configurado.');
    }

    const downloadToken = crypto.randomUUID();
    const ext = extensionFromContentType(contentType);
    const objectName = [
        'users',
        safeStorageNamePart(uid || 'anonymous'),
        'generated',
        `${Date.now()}-${randomStorageId()}.${ext}`,
    ].join('/');

    const boundary = `kreateia-${randomStorageId()}`;
    const metadata = {
        name: objectName,
        contentType,
        metadata: {
            firebaseStorageDownloadTokens: downloadToken,
            source,
        },
    };

    const imageBytes = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes);
    const encoder = new TextEncoder();
    const prefix = encoder.encode(
        `--${boundary}\r\n`
        + 'Content-Type: application/json; charset=UTF-8\r\n\r\n'
        + JSON.stringify(metadata)
        + `\r\n--${boundary}\r\n`
        + `${contentType ? `Content-Type: ${contentType}\r\n` : ''}\r\n`
    );
    const suffix = encoder.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(prefix.byteLength + imageBytes.byteLength + suffix.byteLength);
    body.set(prefix, 0);
    body.set(imageBytes, prefix.byteLength);
    body.set(suffix, prefix.byteLength + imageBytes.byteLength);

    const uploadRes = await fetch(
        `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=multipart`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
        }
    );

    if (!uploadRes.ok) {
        const err = await uploadRes.text().catch(() => '');
        throw new Error(`No se pudo guardar la imagen (${uploadRes.status}): ${err.slice(0, 200)}`);
    }

    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media&token=${downloadToken}`;
}

async function uploadImageToFirebaseStorage({ sourceUrl, uid, env, accessToken }) {
    const bucket = getFirebaseStorageBucket(env);
    if (!bucket || !env.FIREBASE_PROJECT_ID || !accessToken) return sourceUrl;
    if (!looksLikeMediaUrl(sourceUrl) || isOwnStorageUrl(sourceUrl, env)) return sourceUrl;

    const image = await fetchExternalImage(sourceUrl, env);
    if (!image) return sourceUrl;

    try {
        return await uploadImageBytesToFirebaseStorage({
            bytes: image.bytes,
            contentType: image.contentType,
            uid,
            env,
            accessToken,
        });
    } catch (e) {
        console.error('[API] No se pudo persistir imagen:', e.message);
        return sourceUrl;
    }
}

function getOpenAIImageSize(aspectRatio, resolution) {
    const ratio = String(aspectRatio || 'auto');
    const selectedResolution = String(resolution || '1K').toUpperCase();
    const sizes1K = {
        '1:1': '1024x1024',
        '16:9': '1536x864',
        '9:16': '864x1536',
        '4:3': '1280x960',
        '3:4': '960x1280',
    };
    const sizes2K = {
        '1:1': '2048x2048',
        '16:9': '2048x1152',
        '9:16': '1152x2048',
        '4:3': '2048x1536',
        '3:4': '1536x2048',
    };
    const sizes4K = {
        '1:1': '2880x2880',
        '16:9': '3840x2160',
        '9:16': '2160x3840',
        '4:3': '3264x2448',
        '3:4': '2448x3264',
    };

    const sizes = selectedResolution === '4K'
        ? sizes4K
        : selectedResolution === '2K'
            ? sizes2K
            : sizes1K;
    return sizes[ratio] || 'auto';
}

function decodeBase64Image(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function callOpenAIImage2({ route, body, env, uid, accessToken, cost }) {
    if (route !== 'generate/image/t2-create') {
        throw new Error('OpenAI solo está habilitado para crear imágenes desde texto.');
    }

    const endpoint = 'https://api.openai.com/v1/images/generations';
    const size = getOpenAIImageSize(body?.aspect_ratio, body?.resolution);
    const headers = {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
    };
    const requestBody = JSON.stringify({
        model: 'gpt-image-2',
        prompt: String(body?.prompt || '').trim(),
        size,
        quality: 'high',
        output_format: 'jpeg',
        output_compression: 92,
        stream: true,
        partial_images: 1,
    });

    const encoder = new TextEncoder();
    const userDocPath = `artifacts/${env.FIREBASE_APP_ID}/public/data/users/${uid}`;
    let openAIReader = null;

    return new Response(new ReadableStream({
        async start(controller) {
            const decoder = new TextDecoder();
            let buffer = '';
            let finished = false;
            let refunded = false;

            const send = payload => {
                if (!finished) controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'));
            };

            const heartbeat = setInterval(() => {
                send({ type: 'progress' });
            }, 8000);

            const refund = async () => {
                if (refunded || !(cost > 0) || !uid || !accessToken) return;
                refunded = true;
                await firestoreRefund(
                    env.FIREBASE_PROJECT_ID,
                    userDocPath,
                    cost,
                    accessToken
                );
            };

            try {
                send({ type: 'progress' });

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: requestBody,
                });

                if (!response.ok) {
                    const responseText = await response.text();
                    let data = {};
                    try {
                        data = JSON.parse(responseText || '{}');
                    } catch {}

                    const error = new Error(
                        data?.error?.message
                        || `OpenAI devolvió ${response.status}. Inténtalo de nuevo en unos minutos.`
                    );
                    error.status = response.status;
                    throw error;
                }

                if (!response.body) {
                    throw new Error('OpenAI no inició la transmisión de la imagen.');
                }

                openAIReader = response.body.getReader();

                while (true) {
                    const { value, done } = await openAIReader.read();
                    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const rawLine of lines) {
                        const line = rawLine.trim();
                        if (!line.startsWith('data:')) continue;

                        const rawEvent = line.slice(5).trim();
                        if (!rawEvent || rawEvent === '[DONE]') continue;

                        let event;
                        try {
                            event = JSON.parse(rawEvent);
                        } catch {
                            continue;
                        }

                        if (event.type === 'error') {
                            throw new Error(event.error?.message || event.message || 'OpenAI no pudo generar la imagen.');
                        }

                        if (event.type === 'image_generation.partial_image'
                            || event.type === 'image_edit.partial_image') {
                            send({ type: 'progress', partial: true });
                            continue;
                        }

                        if (event.type !== 'image_generation.completed'
                            && event.type !== 'image_edit.completed') {
                            continue;
                        }

                        const base64 = event.b64_json || event.data?.[0]?.b64_json;
                        if (!base64) throw new Error('OpenAI no devolvió la imagen final.');

                        const url = await uploadImageBytesToFirebaseStorage({
                            bytes: decodeBase64Image(base64),
                            contentType: 'image/jpeg',
                            uid,
                            env,
                            accessToken,
                            source: 'openai-gpt-image-2',
                        });

                        send({
                            type: 'completed',
                            result: {
                                url,
                                image_url: url,
                                status: 'completed',
                                model: 'gpt-image-2',
                                size,
                                quality: 'high',
                                usage: event.usage || null,
                            },
                        });
                        finished = true;
                        clearInterval(heartbeat);
                        controller.close();
                        await openAIReader.cancel().catch(() => {});
                        return;
                    }

                    if (done) break;
                }

                throw new Error('OpenAI terminó sin devolver la imagen final.');
            } catch (error) {
                try {
                    await refund();
                } catch (refundError) {
                    console.error('[OpenAI] Error reembolsando créditos:', refundError.message);
                }

                console.error('[OpenAI] Error GPT Image 2 durante stream:', error.message);
                send({ type: 'error', error: error.message || 'No se pudo generar la imagen con OpenAI.' });
                finished = true;
                clearInterval(heartbeat);
                controller.close();
            }
        },
        async cancel() {
            if (openAIReader) await openAIReader.cancel().catch(() => {});
        },
    }), {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

async function persistImageUrls(value, { uid, env, accessToken }) {
    if (!value) return value;

    if (typeof value === 'string') {
        try {
            return await uploadImageToFirebaseStorage({ sourceUrl: value, uid, env, accessToken });
        } catch (e) {
            console.error('[API] Error persistiendo imagen:', e.message);
            return value;
        }
    }

    if (Array.isArray(value)) {
        return Promise.all(value.map(item => persistImageUrls(item, { uid, env, accessToken })));
    }

    if (typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            out[key] = await persistImageUrls(item, { uid, env, accessToken });
        }
        return out;
    }

    return value;
}

async function wrapMediaUrls(value, env, request) {
    if (!getMediaSecret(env)) return value;

    if (looksLikeMediaUrl(value)) {
        const { code, token } = await encryptMediaUrl(value, env);
        const origin = new URL(request.url).origin;
        return `${origin}/api/v1/media/kreateia-${code}/${token}/KreateIA-${code}`;
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
    if (!getMediaSecret(env)) return value;

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
    if (!getMediaSecret(env)) return jsonError('Proxy multimedia no configurado', 500);

    const parts = route.split('/');
    const token = parts[2];

    if (!token) return jsonError('Media token inválido', 400);

    let payload;
    try {
        payload = await decryptMediaToken(token, env);
    } catch {
        return jsonError('Media token inválido', 400);
    }

    const upstreamHeaders = getProviderMediaHeaders(payload.url, env);
    const range = request.headers.get('Range');
    if (range) upstreamHeaders.set('Range', range);

    let upstream;
    try {
        upstream = await fetch(payload.url, { headers: upstreamHeaders });
    } catch {
        return jsonError('No se pudo cargar el archivo multimedia', 502);
    }

    if (!upstream.ok && upstream.status !== 206) {
        let upstreamHost = 'unknown';
        try {
            upstreamHost = new URL(payload.url).hostname;
        } catch {}
        console.error('[MediaProxy] Upstream rechazó el archivo', {
            host: upstreamHost,
            status: upstream.status,
            contentType: upstream.headers.get('Content-Type') || '',
        });
        return jsonError('El archivo multimedia ya no está disponible', upstream.status);
    }

    const contentType = upstream.headers.get('Content-Type') || 'application/octet-stream';
    if (!isSafeProxiedMediaType(contentType)) {
        console.error('[MediaProxy] Tipo multimedia bloqueado', {
            contentType,
        });
        return jsonError('Tipo de archivo multimedia no permitido', 415);
    }

    const extension = extensionFromContentType(contentType);
    const headers = new Headers({
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="KreateIA-${payload.code}.${extension}"`,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
    });

    ['Accept-Ranges', 'Content-Range', 'Content-Length', 'ETag', 'Last-Modified'].forEach(name => {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
    });

    return new Response(upstream.body, {
        status: upstream.status,
        headers,
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

        if (!muapiResponse.ok) {
            console.error('[MuAPI] Petición rechazada', {
                route: 'tools/run',
                endpoint,
                status: muapiResponse.status,
                response: responseBody.slice(0, 1000),
                input: {
                    aspect_ratio: params?.aspect_ratio,
                    resolution: params?.resolution,
                    quality: params?.quality,
                    images_count: Array.isArray(params?.images_list) ? params.images_list.length : 0,
                },
            });
        }
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

    if (muapiResponse.ok && responseContentType.includes('application/json')) {
        try {
            let parsed = JSON.parse(responseBody);
            parsed = await persistImageUrls(parsed, {
                uid: user.uid,
                env,
                accessToken,
            });

            if (getMediaSecret(env)) {
                parsed = await wrapMediaUrls(parsed, env, request);
            }

            responseBody = JSON.stringify(parsed);
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

    const route = Array.isArray(params.path)
        ? params.path.join('/')
        : String(params.path || '');
    const isOpenAIImageRoute = route === 'generate/image/t2-create';

    if (isOpenAIImageRoute && !env.OPENAI_API_KEY) {
        return jsonError('Falta OPENAI_API_KEY en Cloudflare.', 500);
    }
    if (!isOpenAIImageRoute && !env.MUAPI_KEY) {
        return jsonError('API Key no configurada', 500);
    }

    // Media proxy — devuelve archivos con URL opaca kreateia-...
    if (route.startsWith('media/')) {
        return handleMediaProxy(route, request, env);
    }

    const idToken = getBearerToken(request);
    if (!idToken) return jsonError('No autenticado', 401);

    let authenticatedUser;
    try {
        authenticatedUser = await verifyFirebaseUser(idToken, env.FIREBASE_API_KEY);
    } catch {
        return jsonError('Token inválido o expirado', 401);
    }

    const contentType = request.headers.get('Content-Type') || '';

    if (route === 'upload_file' && request.method === 'POST') {
        try {
            const uid = authenticatedUser.uid;
            const rateLimit = await checkEdgeRateLimit(
                context,
                uid,
                'media-upload',
                MAX_UPLOADS_PER_HOUR,
                60 * 60
            );
            if (!rateLimit.allowed) {
                return jsonError(
                    'Has realizado demasiadas subidas. Espera antes de intentarlo de nuevo.',
                    429,
                    { 'Retry-After': String(rateLimit.retryAfter) }
                );
            }

            const accessToken = await getServiceAccountToken(env);
            const form = await request.formData();
            const file = form.get('file');

            if (!file || typeof file.arrayBuffer !== 'function') {
                return jsonError('No se recibió ningún archivo.', 400);
            }

            const fileType = String(file.type || 'application/octet-stream').toLowerCase();
            const isImage = ALLOWED_IMAGE_UPLOAD_TYPES.has(fileType);
            const isVideo = ALLOWED_VIDEO_UPLOAD_TYPES.has(fileType);
            if (!isImage && !isVideo) {
                return jsonError('Formato de archivo no permitido.', 400);
            }

            const maxBytes = isImage ? MAX_IMAGE_UPLOAD_BYTES : MAX_VIDEO_UPLOAD_BYTES;
            if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxBytes) {
                return jsonError(
                    isImage
                        ? 'La imagen supera el límite de 25 MB.'
                        : 'El vídeo supera el límite de 100 MB.',
                    413
                );
            }

            const bytes = new Uint8Array(await file.arrayBuffer());
            if (!uploadBytesMatchContentType(bytes, fileType)) {
                return jsonError('El contenido del archivo no coincide con su formato.', 400);
            }

            const url = await uploadImageBytesToFirebaseStorage({
                bytes,
                contentType: fileType,
                uid,
                env,
                accessToken,
                source: 'kreateia-user-upload',
            });
            const publicUrl = await wrapMediaUrls(url, env, request);

            return new Response(JSON.stringify({
                url: publicUrl,
                file_url: publicUrl,
                status: 'completed',
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        } catch (error) {
            console.error('[Upload] Error guardando referencia:', error.message);
            return jsonError(error.message || 'No se pudo guardar el archivo.', 500);
        }
    }

    // Leer body
    let body = {};
    let rawBody = null;

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        if (contentType.includes('application/json')) {
            const text = await request.text();
            if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
                return jsonError('La petición es demasiado grande.', 413);
            }

            try {
                body = JSON.parse(text || '{}');
            } catch {
                return jsonError('JSON inválido.', 400);
            }

            body = await unwrapIncomingMediaUrls(body, env, request);
            body = normalizeGptImage2Request(route, body);
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
    let serviceAccessToken = null;

    if (cost > 0) {
        uid = authenticatedUser.uid;

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
            serviceAccessToken = await getServiceAccountToken(env);
            const docPath = `artifacts/${env.FIREBASE_APP_ID}/public/data/users/${uid}`;
            const result = await firestoreDeductCredits(
                env.FIREBASE_PROJECT_ID,
                docPath,
                cost,
                serviceAccessToken
            );

            if (!result.ok) return jsonError(result.message, 402);
        } catch (e) {
            return jsonError('ERROR_CREDITOS: ' + e.message, 500);
        }
    }

    if (!uid) uid = authenticatedUser.uid;

    if (isOpenAIImageRoute) {
        try {
            return await callOpenAIImage2({
                route,
                body,
                env,
                uid,
                accessToken: serviceAccessToken,
                cost,
            });
        } catch (e) {
            if (cost > 0 && uid && serviceAccessToken) {
                try {
                    await firestoreRefund(
                        env.FIREBASE_PROJECT_ID,
                        `artifacts/${env.FIREBASE_APP_ID}/public/data/users/${uid}`,
                        cost,
                        serviceAccessToken
                    );
                } catch (refundError) {
                    console.error('[OpenAI] Error reembolsando créditos:', refundError.message);
                }
            }

            console.error('[OpenAI] Error GPT Image 2:', e.message);
            return jsonError(e.message || 'No se pudo generar la imagen con OpenAI.', e.status || 502);
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

        if (route.startsWith('predictions/') && muapiResponse.ok) {
            try {
                const pollData = JSON.parse(responseBody);
                const pollStatus = String(
                    pollData?.status
                    || pollData?.output?.status
                    || pollData?.data?.status
                    || 'unknown'
                ).toLowerCase();
                const hasResult = Boolean(
                    pollData?.url
                    || pollData?.image_url
                    || pollData?.output?.url
                    || pollData?.output?.image_url
                    || pollData?.outputs?.length
                    || pollData?.data?.outputs?.length
                );

                console.log('[MuAPI] Estado de generación', {
                    status: pollStatus,
                    has_result: hasResult,
                    has_error: Boolean(pollData?.error || pollData?.message),
                });
            } catch {}
        }

        if (!muapiResponse.ok) {
            console.error('[MuAPI] Petición rechazada', {
                route,
                endpoint: muapiEndpoint,
                status: muapiResponse.status,
                response: responseBody.slice(0, 1000),
            });
        }
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

    if (muapiResponse.ok && responseContentType.includes('application/json')) {
        try {
            let parsed  = JSON.parse(responseBody);

            if (!uid) {
                const idToken = getBearerToken(request);
                if (idToken && env.FIREBASE_API_KEY) {
                    try {
                        uid = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
                    } catch {}
                }
            }

            if (!serviceAccessToken && uid && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY && env.FIREBASE_PROJECT_ID) {
                try {
                    serviceAccessToken = await getServiceAccountToken(env);
                } catch (e) {
                    console.error('[API] No se pudo preparar persistencia de media:', e.message);
                }
            }

            if (uid && serviceAccessToken) {
                parsed = await persistImageUrls(parsed, {
                    uid,
                    env,
                    accessToken: serviceAccessToken,
                });
            }

            if (getMediaSecret(env)) {
                parsed = await wrapMediaUrls(parsed, env, request);
            }

            responseBody  = JSON.stringify(parsed);
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

function jsonError(message, status = 400, extraHeaders = {}) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            ...extraHeaders,
        },
    });
}
