// /functions/api/v1/[[path]].js
// Backend seguro — verifica créditos ANTES de llamar a MuAPI

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// ─── Inicializar Firebase Admin (una sola vez) ───────────────────────────────
function getFirebaseAdmin(env) {
    if (getApps().length > 0) return getApps()[0];
    return initializeApp({
        credential: cert({
            projectId:    env.FIREBASE_PROJECT_ID,
            clientEmail:  env.FIREBASE_CLIENT_EMAIL,
            privateKey:   env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

// ─── Costes reales por modelo (1 CR = $0.01) ─────────────────────────────────
// Imagen
const IMAGE_COSTS = {
    'nano-banana-2':      16,
    'nano-banana-2-edit':  8,
};

// Vídeo — coste por 5 segundos * 1.35 margen
const VIDEO_COST_PER_5S = {
    'seedance-v2.0-t2v':                  0.75,
    'seedance-2-vip-image-to-video-fast': 1.05,
    'seedance-2.0-omni-reference-480p':   1.44,
    'sd-2-vip-extend':                    1.05,
    'veo3.1-fast-text-to-video':          0.40,
    'veo3.1-lite-image-to-video':         0.30,
    'kling-v3.0-std-motion-control':      1.63,
};

// Música
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

// Artista
const ARTIST_COSTS = {
    'create-artist':       30,
    'create-artist-voice': 80,
};

// Endpoints que NO requieren créditos (polling de resultados)
const FREE_ENDPOINTS = new Set([
    'predictions',
    'upload_file',
]);

// ─── Calcular coste según endpoint y body ────────────────────────────────────
function calculateCost(endpoint, body) {
    // Polling — gratis
    if (endpoint.startsWith('predictions/')) return 0;
    if (FREE_ENDPOINTS.has(endpoint)) return 0;

    // Imagen
    if (IMAGE_COSTS[endpoint] !== undefined) return IMAGE_COSTS[endpoint];

    // Vídeo
    if (VIDEO_COST_PER_5S[endpoint] !== undefined) {
        const duration = parseInt(body?.duration) || 5;
        const secs     = Math.max(5, duration);
        const base5s   = VIDEO_COST_PER_5S[endpoint];
        return Math.ceil((base5s / 5) * secs * 1.35 * 100);
    }

    // Música
    if (MUSIC_COSTS[endpoint] !== undefined) return MUSIC_COSTS[endpoint];

    // Desconocido — cobrar 1 CR de seguridad para que no sea gratis
    return 1;
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function onRequest(context) {
    const { request, env, params } = context;

    // Validar API key de MuAPI
    if (!env.MUAPI_KEY) {
        return jsonError('API Key no configurada en el servidor', 500);
    }

    const endpoint  = params.path.join('/');
    const targetUrl = `https://api.muapi.ai/api/v1/${endpoint}`;

    // ── Leer body ──
    let body = {};
    let rawBody = '';
    const contentType = request.headers.get('content-type') || '';
    if (request.method === 'POST' && contentType.includes('application/json')) {
        try {
            rawBody = await request.text();
            body    = JSON.parse(rawBody);
        } catch { rawBody = ''; }
    }

    // ── Calcular coste ──
    const cost = calculateCost(endpoint, body);

    // ── Si hay coste > 0, verificar y descontar créditos ──
    if (cost > 0) {
        // Verificar token Firebase del usuario
        const authHeader = request.headers.get('Authorization') || '';
        const idToken    = authHeader.replace('Bearer ', '').trim();

        if (!idToken) {
            return jsonError('No autenticado. Inicia sesión para continuar.', 401);
        }

        let uid;
        try {
            const app      = getFirebaseAdmin(env);
            const fbAuth   = getAuth(app);
            const decoded  = await fbAuth.verifyIdToken(idToken);
            uid = decoded.uid;
        } catch (authErr) {
            return jsonError('Token inválido o expirado. Vuelve a iniciar sesión.', 401);
        }

        // Descontar créditos con transacción atómica
        try {
            const app = getFirebaseAdmin(env);
            const db  = getFirestore(app);
            const APP_ID = env.FIREBASE_APP_ID || 'default';

            const userRef = db
                .collection('artifacts')
                .doc(APP_ID)
                .collection('public')
                .doc('data')
                .collection('users')
                .doc(uid);

            // Transacción: leer + verificar + descontar en una sola operación atómica
            const result = await db.runTransaction(async (tx) => {
                const snap    = await tx.get(userRef);
                const data    = snap.exists ? snap.data() : {};
                const isAdmin = data.role === 'admin';

                if (isAdmin) return { ok: true, isAdmin: true };

                const credits = data.credits || 0;
                if (credits < cost) {
                    return {
                        ok:      false,
                        credits,
                        cost,
                        message: `Saldo insuficiente. Necesitas ${cost} 🪙 y tienes ${credits} 🪙.`,
                    };
                }

                tx.update(userRef, { credits: FieldValue.increment(-cost) });
                return { ok: true, isAdmin: false };
            });

            if (!result.ok) {
                return jsonError(result.message, 402);
            }
        } catch (dbErr) {
            console.error('[API] Error en transacción de créditos:', dbErr);
            return jsonError('Error procesando créditos. Inténtalo de nuevo.', 500);
        }
    }

    // ── Llamar a MuAPI ──
    try {
        const muapiRequest = new Request(targetUrl, {
            method:  request.method,
            headers: new Headers({
                'Content-Type': 'application/json',
                'x-api-key':   env.MUAPI_KEY,
            }),
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? (rawBody || null)
                : null,
        });

        const muapiResponse = await fetch(muapiRequest);
        const responseBody  = await muapiResponse.text();

        // Si MuAPI falla DESPUÉS de descontar créditos, intentar reembolsar
        if (!muapiResponse.ok && cost > 0) {
            try {
                const authHeader = request.headers.get('Authorization') || '';
                const idToken    = authHeader.replace('Bearer ', '').trim();
                const app        = getFirebaseAdmin(env);
                const fbAuth     = getAuth(app);
                const decoded    = await fbAuth.verifyIdToken(idToken);
                const db         = getFirestore(app);
                const APP_ID     = env.FIREBASE_APP_ID || 'default';

                const userRef = db
                    .collection('artifacts').doc(APP_ID)
                    .collection('public').doc('data')
                    .collection('users').doc(decoded.uid);

                const snap = await userRef.get();
                if (snap.exists && snap.data().role !== 'admin') {
                    await userRef.update({ credits: FieldValue.increment(cost) });
                    console.log('[API] Créditos reembolsados:', cost, 'uid:', decoded.uid);
                }
            } catch (refundErr) {
                console.error('[API] Error reembolsando créditos:', refundErr);
            }
        }

        return new Response(responseBody, {
            status:  muapiResponse.status,
            headers: {
                'Content-Type': muapiResponse.headers.get('content-type') || 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });

    } catch (fetchErr) {
        return jsonError(`Error conectando con el servicio: ${fetchErr.message}`, 502);
    }
}

// ── OPTIONS para CORS ──
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
