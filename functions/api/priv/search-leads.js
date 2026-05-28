const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const DEFAULT_SECTORS = ['restaurant'];
const MAX_RADIUS_METERS = 50000;
const MAX_RESULTS_PER_SECTOR = 20;
const MAX_WEBSITE_AUDITS = 40;

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

    const customQuery = normalizeCustomQuery(body.customQuery);
    const sectors = normalizeSectors(body, customQuery);
    const radiusMeters = normalizeRadius(body.radiusMeters);
    const campaignName = String(body.campaignName || '').trim().slice(0, 160)
      || buildCampaignName(body.locationText, sectors, customQuery);

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
    const rawPlaces = await searchPlaces(env, {
      latitude,
      longitude,
      radiusMeters,
      sectors,
      customQuery,
      locationText,
    });

    const deduped = dedupePlaces(rawPlaces);
    const baseLeads = deduped.map(item => normalizeLead({
      place: item.place,
      sector: item.sector,
      campaignId,
      staff,
      now,
      customQuery,
    }));
    const leads = await enrichLeadsWithWebsiteReports(baseLeads);

    const campaignDoc = {
      name: campaignName,
      status: 'created',
      locationText,
      latitude,
      longitude,
      radiusMeters,
      sectors,
      customQuery,
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
        websiteScore: lead.websiteScore,
      })),
    });
  } catch (err) {
    return jsonError(err.message || 'Error buscando leads', 500);
  }
}

async function searchPlaces(env, { latitude, longitude, radiusMeters, sectors, customQuery, locationText }) {
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

  if (customQuery) {
    const textPlaces = await searchTextPlaces(env, {
      latitude,
      longitude,
      radiusMeters,
      customQuery,
      locationText,
    });

    textPlaces.forEach(place => {
      all.push({ sector: customQuery, place });
    });
  }

  return all;
}

async function searchTextPlaces(env, { latitude, longitude, radiusMeters, customQuery, locationText }) {
  const textQuery = locationText ? `${customQuery} en ${locationText}` : customQuery;
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
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
      textQuery,
      maxResultCount: MAX_RESULTS_PER_SECTOR,
      locationBias: {
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
    throw new Error(data.error?.message || `Google Text Search: ${res.status}`);
  }

  return data.places || [];
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

function normalizeLead({ place, sector, campaignId, staff, now, customQuery }) {
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
    customQuery: customQuery || '',
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
    hasWebsite: !!website,
    websiteStatus: website ? 'pending' : 'no_website',
    websiteScore: website ? 0 : 20,
    websiteReport: website ? 'Auditoria web pendiente.' : 'No aparece web publica en Google Places. Oportunidad: ofrecer web, ficha local, presencia digital y automatizaciones basicas.',
    seoIssues: website ? [] : ['No aparece web publica en la ficha'],
    socialLinks: [],
    lastContactAt: '',
    createdByUid: staff.uid,
    createdByEmail: staff.email,
    createdAt: now,
    updatedAt: now,
  };
}

function buildLeadSummary(lead, report = null) {
  const sectorText = lead.sector ? `Sector detectado: ${lead.sector}. ` : '';
  const webText = lead.website ? 'Tiene web publica, conviene revisarla antes de llamar. ' : 'No aparece web publica en la ficha. ';
  const phoneText = lead.phone ? 'Tiene telefono disponible para primer contacto humano.' : 'No aparece telefono en la ficha.';

  if (!report) return `${sectorText}${webText}${phoneText}`;

  const scoreText = `Puntuacion web aproximada: ${report.score}/100. `;
  const issueText = report.issues.length
    ? `Flaquezas: ${report.issues.slice(0, 4).join(', ')}. `
    : 'No se detectan flaquezas SEO basicas en portada. ';
  const socialText = report.socialLinks.length
    ? `Redes detectadas: ${report.socialLinks.map(link => link.platform).join(', ')}.`
    : 'No se detectan redes sociales enlazadas desde la web.';

  return `${sectorText}${webText}${phoneText} ${scoreText}${issueText}${socialText}`;
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

async function enrichLeadsWithWebsiteReports(leads) {
  const limited = leads.slice(0, MAX_WEBSITE_AUDITS);
  const audited = await mapWithConcurrency(limited, 5, async lead => {
    if (!lead.website) return lead;

    const report = await analyzeWebsite(lead.website);
    return {
      ...lead,
      hasWebsite: true,
      websiteStatus: report.status,
      websiteScore: report.score,
      websiteReport: report.summary,
      seoIssues: report.issues,
      socialLinks: report.socialLinks,
      aiSummary: buildLeadSummary(lead, report),
    };
  });

  const auditedById = new Map(audited.map(lead => [lead.id, lead]));
  return leads.map(lead => auditedById.get(lead.id) || lead);
}

async function analyzeWebsite(url) {
  const started = Date.now();
  const normalizedUrl = normalizeWebsiteUrl(url);

  try {
    const res = await fetchWithTimeout(normalizedUrl, 4500);
    const statusCode = res.status;
    const finalUrl = res.url || normalizedUrl;
    const contentType = res.headers.get('content-type') || '';

    if (!res.ok) {
      return buildWebsiteReport({
        status: 'error',
        score: 30,
        statusCode,
        finalUrl,
        loadMs: Date.now() - started,
        issues: [`La web responde con error HTTP ${statusCode}`],
        socialLinks: [],
      });
    }

    if (!contentType.includes('text/html')) {
      return buildWebsiteReport({
        status: 'limited',
        score: 45,
        statusCode,
        finalUrl,
        loadMs: Date.now() - started,
        issues: ['La URL no devuelve HTML revisable'],
        socialLinks: [],
      });
    }

    const html = await res.text();
    const title = cleanText(extractTitle(html));
    const description = cleanText(extractMetaContent(html, 'description'));
    const h1 = cleanText(extractH1(html));
    const viewport = extractMetaContent(html, 'viewport');
    const canonical = extractCanonical(html);
    const socialLinks = extractSocialLinks(html, finalUrl);
    const issues = [];

    if (!finalUrl.startsWith('https://')) issues.push('No carga en HTTPS');
    if (!title) issues.push('Falta titulo SEO');
    else if (title.length < 20) issues.push('Titulo SEO demasiado corto');
    else if (title.length > 70) issues.push('Titulo SEO demasiado largo');
    if (!description) issues.push('Falta meta descripcion');
    else if (description.length < 70) issues.push('Meta descripcion demasiado corta');
    else if (description.length > 170) issues.push('Meta descripcion demasiado larga');
    if (!h1) issues.push('Falta encabezado H1');
    if (!viewport) issues.push('No se detecta etiqueta viewport movil');
    if (!canonical) issues.push('No se detecta canonical');
    if (!socialLinks.length) issues.push('No se detectan redes sociales enlazadas');

    const loadMs = Date.now() - started;
    if (loadMs > 3500) issues.push('La portada responde lenta');

    const score = Math.max(15, 100 - (issues.length * 12) - (loadMs > 3500 ? 10 : 0));

    return buildWebsiteReport({
      status: 'ok',
      score,
      statusCode,
      finalUrl,
      loadMs,
      title,
      description,
      h1,
      issues,
      socialLinks,
    });
  } catch (err) {
    return buildWebsiteReport({
      status: 'error',
      score: 25,
      statusCode: 0,
      finalUrl: normalizedUrl,
      loadMs: Date.now() - started,
      issues: ['No se pudo cargar la web para analizarla'],
      socialLinks: [],
      error: String(err.message || '').slice(0, 120),
    });
  }
}

function buildWebsiteReport(report) {
  const issueText = report.issues.length ? report.issues.join('; ') : 'Sin fallos basicos detectados';
  const socialText = report.socialLinks.length
    ? report.socialLinks.map(link => `${link.platform}: ${link.url}`).join(' | ')
    : 'No detectadas';

  return {
    ...report,
    summary: [
      `Estado web: ${report.status} (${report.statusCode || 'sin codigo'}).`,
      `Puntuacion aproximada: ${report.score}/100.`,
      `Carga aproximada: ${report.loadMs} ms.`,
      report.title ? `Titulo: ${report.title}.` : '',
      report.description ? `Descripcion: ${report.description}.` : '',
      `Flaquezas: ${issueText}.`,
      `Redes sociales: ${socialText}.`,
    ].filter(Boolean).join('\n'),
  };
}

function normalizeSectors(body, customQuery = '') {
  const raw = Array.isArray(body.sectors)
    ? body.sectors
    : body.sector
      ? [body.sector]
      : customQuery
        ? []
        : DEFAULT_SECTORS;

  const sectors = raw
    .map(v => String(v || '').trim().toLowerCase())
    .map(v => v.replace(/\s+/g, '_'))
    .filter(v => /^[a-z0-9_]+$/.test(v))
    .slice(0, 8);

  if (sectors.length) return [...new Set(sectors)];
  return customQuery ? [] : DEFAULT_SECTORS;
}

function normalizeCustomQuery(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function normalizeRadius(value) {
  const radius = Math.round(Number(value) || 5000);
  return Math.min(MAX_RADIUS_METERS, Math.max(500, radius));
}

function buildCampaignName(locationText, sectors, customQuery = '') {
  const location = String(locationText || 'zona seleccionada').trim();
  const target = customQuery || sectors.join(', ');
  return `${location} - ${target || 'busqueda'}`.slice(0, 160);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);

  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function normalizeWebsiteUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return 'https://' + url;
}

function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1] : '';
}

function extractMetaContent(html, name) {
  const source = String(html || '');
  const namePattern = new RegExp(`<meta[^>]+(?:name|property)=["']${escapeRegex(name)}["'][^>]*>`, 'i');
  const tag = source.match(namePattern)?.[0] || '';
  const content = tag.match(/content=["']([^"']*)["']/i);
  return content ? content[1] : '';
}

function extractH1(html) {
  const match = String(html || '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? stripTags(match[1]) : '';
}

function extractCanonical(html) {
  const tag = String(html || '').match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0] || '';
  const href = tag.match(/href=["']([^"']*)["']/i);
  return href ? href[1] : '';
}

function extractSocialLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const source = String(html || '');
  const hrefRegex = /href=["']([^"']+)["']/gi;
  const platforms = [
    ['Instagram', 'instagram.com'],
    ['Facebook', 'facebook.com'],
    ['TikTok', 'tiktok.com'],
    ['LinkedIn', 'linkedin.com'],
    ['YouTube', 'youtube.com'],
    ['X/Twitter', 'twitter.com'],
    ['X/Twitter', 'x.com'],
  ];

  let match;
  while ((match = hrefRegex.exec(source)) !== null) {
    const rawUrl = normalizeHref(match[1], baseUrl);
    const lower = rawUrl.toLowerCase();
    const platform = platforms.find(([, domain]) => lower.includes(domain));
    if (!platform || seen.has(rawUrl)) continue;
    seen.add(rawUrl);
    links.push({ platform: platform[0], url: rawUrl.slice(0, 500) });
  }

  return links.slice(0, 12);
}

function normalizeHref(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return String(href || '').trim();
  }
}

function cleanText(value) {
  return decodeHtml(stripTags(String(value || '')))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
