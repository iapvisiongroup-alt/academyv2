const FIREBASE_API_KEY = 'AIzaSyDVD2Sbu7nVbFfVkgujMcgOC_S0oDla-zQ';
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;
const PROJECT_ID_RE = /^(main|[a-f0-9-]{36})$/i;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function cleanName(value, fallback = 'Sin titulo') {
  return String(value || fallback)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9À-ÿ._ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || fallback;
}

function mediaType(contentType) {
  const type = String(contentType || '').toLowerCase();
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('image/') && !type.includes('svg')) return 'image';
  return '';
}

function routeFrom(context) {
  return Array.isArray(context.params.path)
    ? context.params.path.join('/')
    : String(context.params.path || '');
}

function projectKey(uid, id) {
  return `users/${uid}/projects/${id}.json`;
}

async function userFromRequest(request) {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('Debes iniciar sesión.');

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: authorization.slice(7).trim() }),
    },
  );

  if (!response.ok) throw new Error('La sesión no es válida o ha caducado.');
  const user = (await response.json()).users?.[0];
  if (!user?.localId) throw new Error('Usuario no válido.');
  return { uid: user.localId, email: user.email || '' };
}

async function upload(request, bucket, user) {
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const size = Number(request.headers.get('Content-Length') || 0);
  if (size > MAX_UPLOAD_BYTES) return json({ error: 'El archivo supera el máximo de 150 MB.' }, 413);

  const contentType = request.headers.get('Content-Type') || '';
  const type = mediaType(contentType);
  if (!type) return json({ error: 'Formato de archivo no permitido.' }, 415);

  const id = crypto.randomUUID();
  const name = cleanName(decodeURIComponent(request.headers.get('X-File-Name') || 'archivo'), 'archivo');
  const duration = Math.max(0, Number(request.headers.get('X-Media-Duration') || 0));
  const createdAt = new Date().toISOString();

  await bucket.put(`users/${user.uid}/media/${id}`, request.body, {
    httpMetadata: { contentType, cacheControl: 'private, max-age=3600' },
    customMetadata: { id, uid: user.uid, name, type, duration: String(duration), createdAt },
  });

  const origin = new URL(request.url).origin;
  return json({
    asset: {
      id,
      name,
      type,
      duration,
      url: `${origin}/api/kreateedit/file/${user.uid}/${id}`,
      cloud: true,
      createdAt,
    },
  }, 201);
}

async function library(request, bucket, user) {
  const result = await bucket.list({
    prefix: `users/${user.uid}/media/`,
    include: ['customMetadata', 'httpMetadata'],
    limit: 500,
  });
  const origin = new URL(request.url).origin;
  const assets = result.objects.map((object) => {
    const meta = object.customMetadata || {};
    const id = meta.id || object.key.split('/').pop();
    return {
      id,
      name: meta.name || 'Archivo',
      type: meta.type || mediaType(object.httpMetadata?.contentType),
      duration: Number(meta.duration || 0),
      url: `${origin}/api/kreateedit/file/${user.uid}/${id}`,
      cloud: true,
      createdAt: meta.createdAt || object.uploaded,
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return json({ assets });
}

async function listProjects(bucket, user) {
  const result = await bucket.list({
    prefix: `users/${user.uid}/projects/`,
    include: ['customMetadata'],
    limit: 200,
  });

  const projects = result.objects.map((object) => {
    const meta = object.customMetadata || {};
    const filename = object.key.split('/').pop() || '';
    const id = meta.id || filename.replace(/\.json$/i, '') || 'main';
    return {
      id,
      name: meta.name || (id === 'main' ? 'Mi proyecto de vídeo' : 'Proyecto sin nombre'),
      kind: meta.kind === 'photo' ? 'photo' : 'video',
      createdAt: meta.createdAt || object.uploaded,
      updatedAt: meta.updatedAt || object.uploaded,
    };
  }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  return json({ projects });
}

async function createProject(request, bucket, user) {
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const input = await request.json().catch(() => ({}));
  const kind = input.kind === 'photo' ? 'photo' : 'video';
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const project = {
    id,
    name: cleanName(input.name, kind === 'photo' ? 'Nuevo diseño' : 'Nuevo vídeo'),
    kind,
    ratio: '16:9',
    clips: [],
    audioTracks: [],
    videoTracks: [{ id: 'track-1', name: 'Vídeo 1' }],
    activeVideoTrackId: 'track-1',
    createdAt: now,
    updatedAt: now,
  };

  await saveProject(bucket, user, id, { project });
  return json({ project }, 201);
}

async function getProject(bucket, user, id) {
  const object = await bucket.get(projectKey(user.uid, id));
  if (!object) return json({ project: null }, 404);
  return new Response(object.body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function saveProject(bucket, user, id, payload) {
  const project = payload?.project || {};
  const now = new Date().toISOString();
  const normalized = {
    ...project,
    id,
    name: cleanName(project.name, 'Proyecto sin nombre'),
    kind: project.kind === 'photo' ? 'photo' : 'video',
    updatedAt: now,
    createdAt: project.createdAt || now,
  };
  const body = JSON.stringify({ project: normalized });
  if (body.length > 500_000) return json({ error: 'Proyecto demasiado grande.' }, 413);

  await bucket.put(projectKey(user.uid, id), body, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      id,
      uid: user.uid,
      name: normalized.name,
      kind: normalized.kind,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    },
  });
  return json({ ok: true, project: normalized });
}

async function project(request, bucket, user, id) {
  if (!PROJECT_ID_RE.test(id)) return json({ error: 'Proyecto no válido.' }, 400);
  if (request.method === 'GET') return getProject(bucket, user, id);
  if (request.method === 'PUT') {
    const payload = await request.json().catch(() => null);
    if (!payload?.project) return json({ error: 'Datos de proyecto no válidos.' }, 400);
    return saveProject(bucket, user, id, payload);
  }
  if (request.method === 'DELETE') {
    await bucket.delete(projectKey(user.uid, id));
    return json({ ok: true });
  }
  return json({ error: 'Método no permitido' }, 405);
}

async function removeMedia(request, bucket, user) {
  if (request.method !== 'DELETE') return json({ error: 'Método no permitido' }, 405);
  const id = String(new URL(request.url).searchParams.get('id') || '');
  if (!/^[a-f0-9-]{36}$/i.test(id)) return json({ error: 'Archivo no válido.' }, 400);
  await bucket.delete(`users/${user.uid}/media/${id}`);
  return json({ ok: true });
}

async function serveFile(request, bucket, route) {
  const match = route.match(/^file\/([^/]+)\/([a-f0-9-]{36})$/i);
  if (!match) return json({ error: 'Archivo no encontrado.' }, 404);
  const object = await bucket.get(`users/${match[1]}/media/${match[2]}`, {
    range: request.headers,
    onlyIf: request.headers,
  });
  if (!object) return json({ error: 'Archivo no encontrado.' }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (object.range) {
    headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
  }
  return new Response(object.body, { status: object.range ? 206 : 200, headers });
}

export async function onRequest(context) {
  const { request, env } = context;
  const route = routeFrom(context);
  const bucket = env.KREATEEDIT_MEDIA;
  if (!bucket) return json({ error: 'Almacenamiento de KreateEdit no configurado.' }, 500);
  if (route.startsWith('file/')) return serveFile(request, bucket, route);

  let user;
  try {
    user = await userFromRequest(request);
  } catch (error) {
    return json({ error: error.message }, 401);
  }

  try {
    if (route === 'upload') return await upload(request, bucket, user);
    if (route === 'library') return await library(request, bucket, user);
    if (route === 'projects') return request.method === 'GET'
      ? await listProjects(bucket, user)
      : await createProject(request, bucket, user);
    if (route.startsWith('project/')) return await project(request, bucket, user, route.slice(8));
    if (route === 'media') return await removeMedia(request, bucket, user);
    return json({ error: 'Ruta no encontrada.' }, 404);
  } catch (error) {
    console.error(JSON.stringify({ scope: 'KreateEdit', route, message: error.message }));
    return json({ error: error.message || 'Error interno.' }, 500);
  }
}
