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
