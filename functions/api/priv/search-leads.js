const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const DEFAULT_SECTORS = ['restaurant'];
const MAX_RADIUS_METERS = 50000;
const MAX_RESULTS_PER_SECTOR = 20;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return jsonError('Metodo no permitido', 405);

  try {
    requireEnv(env, [
      'FIREBASE_API_KEY',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
      'GOOGLE_MAPS_API_KEY',
    ]);

    const idToken = getBearerToken(request);
    if (!idToken) return jsonError('No autenticado', 401);

    const staff = await verifyFirebaseToken(idToken, env.FIREBASE_API_KEY);
    const accessToken = await getServiceAccountToken(env, 'https://www.googleapis.com/auth/datastore');
    const allowed = await isAllowedStaff(env.FIREBASE_PROJECT_ID, accessToken, staff.email);
    if (!allowed) return jsonError('Email no autorizado', 403);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return jsonError('Solicitud invalida', 400);

    const sectors = normalizeSectors(body);
    const radiusMeters = normalizeRadius(body.radiusMeters);
    const campaignName = String(body.campaignName || '').trim().slice(0, 160)
      || buildCampaignName(body.locationText, sectors);

    let latitude = Number(body.latitude);
    let longitude = Number(body.longitude);
    const locationText = String(body.locationText || '').trim().slice(0, 220);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      if (!locationText) return jsonError('Falta ubicacion o coordenadas', 400);
      const geocoded = await geocodeLocation(env, locationText);
      latitude = geocoded.latitude;
      longitude = geocoded.longitude;
    }

    if (!isValidCoordinate(latitude, longitude)) {
      return jsonError('Coordenadas invalidas', 400);
    }

    const now = new Date().toISOString();
    const campaignId = safeDocId('campaign_' + now + '_' + campaignName);
    const rawPlaces = await searchNearbyPlaces(env, {
      latitude,
      longitude,
      radiusMeters,
      sectors,
    });

    const deduped = dedupePlaces(rawPlaces);
    const leads = deduped.map(item => normalizeLead({
      place: item.place,
      sector: item.sector,
      campaignId,
      staff,
      now,
    }));

    const campaignDoc = {
      name: campaignName,
      status: 'created',
      locationText,
      latitude,
      longitude,
      radiusMeters,
      sectors,
      totalFound: leads.length,
      createdByUid: staff.uid,
      createdByEmail: staff.email,
      createdAt: now,
      updatedAt: now,
    };

    const writes = [
      {
        update: {
          name: docName(env.FIREBASE_PROJECT_ID, `private_lead_campaigns/${campaignId}`),
          fields: toFields(campaignDoc),
        },
      },
      ...leads.map(lead => ({
        update: {
          name: docName(env.FIREBASE_PROJECT_ID, `private_leads/${lead.id}`),
          fields: toFields(stripInternalId(lead)),
        },
      })),
    ];

    for (const chunk of chunkArray(writes, 400)) {
      await commitWrites(env.FIREBASE_PROJECT_ID, accessToken, chunk);
    }

    return json({
      ok: true,
      campaignId,
      total: leads.length,
      leads: leads.map(lead => ({
        id: lead.id,
        name: lead.name,
        sector: lead.sector,
        phone: lead.phone,
        website: lead.website,
        address: lead.address,
        googleMapsUrl: lead.googleMapsUrl,
        status: lead.status,
      })),
    });
  } catch (err) {
    return jsonError(err.message || 'Error buscando leads', 500);
  }
}

async function searchNearbyPlaces(env, { latitude, longitude, radiusMeters, sectors }) {
  const all = [];

  for (const sector of sectors) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.rating',
          'places.userRatingCount',
          'places.websiteUri',
          'places.nationalPhoneNumber',
          'places.internationalPhoneNumber',
          'places.googleMapsUri',
          'places.types',
        ].join(','),
      },
      body: JSON.stringify({
        includedTypes: [sector],
        maxResultCount: MAX_RESULTS_PER_SECTOR,
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius: radiusMeters,
          },
        },
        languageCode: 'es',
        regionCode: 'ES',
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error?.message || `Google Places: ${res.status}`);
    }

    (data.places || []).forEach(place => {
      all.push({ sector, place });
    });
  }

  return all;
}

async function geocodeLocation(env, locationText) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', locationText);
  url.searchParams.set('region', 'es');
  url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY);

  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(`Google Geocoding: ${res.status}`);
  if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) {
    throw new Error('No se pudo encontrar esa ubicacion');
  }

  const location = data.results[0].geometry.location;
  return {
    latitude: Number(location.lat),
    longitude: Number(location.lng),
  };
}

function normalizeLead({ place, sector, campaignId, staff, now }) {
  const placeId = String(place.id || '').trim();
  const name = String(place.displayName?.text || place.displayName || 'Sin nombre').trim().slice(0, 220);
  const phone = String(place.nationalPhoneNumber || place.internationalPhoneNumber || '').trim().slice(0, 80);
  const website = String(place.websiteUri || '').trim().slice(0, 500);
  const googleMapsUrl = String(place.googleMapsUri || '').trim().slice(0, 500);
  const address = String(place.formattedAddress || '').trim().slice(0, 500);
  const latitude = Number(place.location?.latitude || 0);
  const longitude = Number(place.location?.longitude || 0);

  const leadForScript = { name, sector, phone, website, address };

  return {
    id: safeDocId('google_' + (placeId || name)),
    campaignId,
    source: 'google_places',
    placeId,
    name,
    sector,
    status: 'nuevo',
    address,
    phone,
    website,
    googleMapsUrl,
    rating: Number(place.rating || 0),
    reviewCount: Number(place.userRatingCount || 0),
    latitude,
    longitude,
    notes: '',
    aiSummary: buildLeadSummary(leadForScript),
    callScript: buildCallScript(leadForScript),
    lastContactAt: '',
    createdByUid: staff.uid,
    createdByEmail: staff.email,
    createdAt: now,
    updatedAt: now,
  };
}

function buildLeadSummary(lead) {
  const sectorText = lead.sector ? `Sector detectado: ${lead.sector}. ` : '';
  const webText = lead.website ? 'Tiene web publica, conviene revisarla antes de llamar. ' : 'No aparece web publica en la ficha. ';
  const phoneText = lead.phone ? 'Tiene telefono disponible para primer contacto humano.' : 'No aparece telefono en la ficha.';
  return `${sectorText}${webText}${phoneText}`;
}

function buildCallScript(lead) {
  return [
    `Hola, buenos dias. Llamo de KreateIA, somos una empresa de automatizacion e inteligencia artificial.`,
    `He visto vuestra empresa en Google y queria preguntarte algo rapido: estamos ayudando a negocios de vuestro sector a captar mas clientes y ahorrar tiempo con automatizaciones sencillas.`,
    `No te quiero vender nada ahora mismo. Solo queria saber si os interesaria que os enviemos una propuesta breve por email o WhatsApp para verla con calma.`,
    `Si me dices que no, no volvemos a contactar. Si te interesa, te envio la informacion y ya decidis tranquilos.`,
  ].join('\n');
}

function dedupePlaces(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = String(item.place?.id || item.place?.displayName?.text || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function normalizeSectors(body) {
  const raw = Array.isArray(body.sectors)
    ? body.sectors
    : body.sector
      ? [body.sector]
      : DEFAULT_SECTORS;

  const sectors = raw
    .map(v => String(v || '').trim().toLowerCase())
    .map(v => v.replace(/\s+/g, '_'))
    .filter(v => /^[a-z0-9_]+$/.test(v))
    .slice(0, 8);

  return sectors.length ? [...new Set(sectors)] : DEFAULT_SECTORS;
}

function normalizeRadius(value) {
  const radius = Math.round(Number(value) || 5000);
  return Math.min(MAX_RADIUS_METERS, Math.max(500, radius));
}

function buildCampaignName(locationText, sectors) {
  const location = String(locationText || 'zona seleccionada').trim();
  return `${location} - ${sectors.join(', ')}`.slice(0, 160);
}

function stripInternalId(lead) {
  const { id, ...data } = lead;
  return data;
}

function isValidCoordinate(latitude, longitude) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

function safeDocId(value) {
  const clean = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 140);

  return clean || ('lead_' + Date.now());
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function isAllowedStaff(projectId, accessToken, email) {
  const doc = await getDoc(projectId, `private_allowed_users/${normalizeEmail(email)}`, accessToken, true);
  return doc.exists && doc.data.active === true;
}

async function verifyFirebaseToken(idToken, firebaseApiKey) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) throw new Error('Token invalido o expirado');

  const data = await res.json();
  const user = data.users?.[0];
  if (!user?.localId || !user?.email) throw new Error('Token invalido');

  return {
    uid: user.localId,
    email: normalizeEmail(user.email),
  };
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

async function getDoc(projectId, path, accessToken, allowMissing = false) {
  const res = await fetch(`${firestoreBase(projectId)}/${encodePath(path)}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (res.status === 404 && allowMissing) return { exists: false, data: {}, updateTime: null };
  if (!res.ok) throw new Error(`No se pudo leer ${path}`);

  const raw = await res.json();
  return {
    exists: true,
    data: fromFields(raw.fields || {}),
    updateTime: raw.updateTime || null,
  };
}

async function commitWrites(projectId, accessToken, writes) {
  const res = await fetch(firestoreBase(projectId) + ':commit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) throw new Error(`Firestore commit: ${res.status} ${(await res.text()).slice(0, 180)}`);
}

function firestoreBase(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function docName(projectId, path) {
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function toFields(obj) {
  const fields = {};
  Object.entries(obj).forEach(([k, v]) => {
    fields[k] = toValue(v);
  });
  return fields;
}

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}

function fromFields(fields) {
  const obj = {};
  Object.entries(fields).forEach(([k, v]) => {
    obj[k] = fromValue(v);
  });
  return obj;
}

function fromValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}

function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function requireEnv(env, keys) {
  const missing = keys.filter(k => !env[k]);
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
