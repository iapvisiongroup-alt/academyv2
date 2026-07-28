const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ALLOWED_TIMES = ['10:00', '12:00', '17:00', '19:00'];
const MAX_MESSAGES = 12;
const MAX_TOTAL_CHARS = 8000;
const MAX_BODY_BYTES = 32_000;
const MAX_BOOKINGS_PER_IP_DAY = 2;
const ANNUAL_GROUP_START = '2026-09-11';
const ANNUAL_GROUP_END = '2027-06-25';
const ANNUAL_GROUP_TIMES = new Set(['17:00', '19:00']);

const NATIONAL_HOLIDAYS = {
  '2026-01-01': 'Año Nuevo',
  '2026-01-06': 'Epifanía del Señor',
  '2026-04-03': 'Viernes Santo',
  '2026-05-01': 'Fiesta del Trabajo',
  '2026-08-15': 'Asunción de la Virgen',
  '2026-10-12': 'Fiesta Nacional de España',
  '2026-11-01': 'Todos los Santos',
  '2026-12-06': 'Día de la Constitución',
  '2026-12-08': 'Inmaculada Concepción',
  '2026-12-25': 'Navidad',
  '2027-01-01': 'Año Nuevo',
  '2027-01-06': 'Epifanía del Señor',
  '2027-03-26': 'Viernes Santo',
  '2027-05-01': 'Fiesta del Trabajo',
  '2027-08-15': 'Asunción de la Virgen',
  '2027-10-12': 'Fiesta Nacional de España',
  '2027-11-01': 'Todos los Santos',
  '2027-12-06': 'Día de la Constitución',
  '2027-12-08': 'Inmaculada Concepción',
  '2027-12-25': 'Navidad',
};

const SYSTEM_PROMPT = `
Eres el asistente comercial oficial de KreateIA. Responde siempre en español, con frases breves, claras y profesionales.

INFORMACIÓN AUTORIZADA:
- KreateIA está en C/ Lino León Martínez 6, Torre-Pacheco, Murcia.
- Teléfono y WhatsApp: +34 614 403 913.
- Email de empresas: empresas@kreateia.com.
- KreateIA trabaja presencialmente en Murcia y a distancia con empresas de toda España.
- Servicios: páginas web y landing pages; SEO local y posicionamiento; Google Ads y Meta Ads; marketing digital; automatizaciones con IA; aplicaciones personalizadas; agentes y asistentes internos; fotografía de producto con IA; vídeos publicitarios; anuncios y contenido para redes; consultoría e implantación de IA; formación para empresas.
- La consulta inicial para servicios es gratuita. El precio de cada proyecto depende del alcance y se entrega por escrito antes de empezar.
- No prometas posiciones concretas en Google, cifras de ventas, plazos no confirmados ni precios inventados.
- Cursos online disponibles: Diagnóstico IA 1 a 1 (6,90 €, 30 minutos); IA Express 1 a 1 (149 €, 2 horas); IA Creador (299 €, 4 horas en 3 clases); IA Profesional (490 €, 6 horas en 3 clases).
- Para cursos presenciales, dirige a https://kreateia.com/cursos/.
- Para usar el SaaS, dirige a https://kreateia.com/.

REGLAS:
1. Contesta únicamente sobre KreateIA, sus servicios, cursos y cómo contactar o reservar.
2. Si preguntan por algo ajeno, responde: "Solo puedo ayudarte con los servicios, cursos y reservas de KreateIA."
3. No inventes información. Si no está arriba, indica que el equipo lo confirmará.
4. No des asesoramiento legal, médico o financiero.
5. Si existe intención comercial, ofrece una llamada gratuita.
6. Para reservar, recopila de uno en uno: nombre, empresa o actividad, teléfono, email, motivo de la llamada, fecha y hora.
7. Usa consultar_disponibilidad antes de proponer horas. Nunca propongas un hueco que no devuelva esa función.
8. Resume todos los datos y pregunta "¿Confirmas la reserva?".
9. Solo llama a reservar_llamada si el usuario acaba de confirmar claramente y confirmed=true.
10. Después de reservar, comunica fecha, hora y zona horaria Europe/Madrid. No digas que está reservada antes de recibir ok=true.
`;

const TOOLS = [{
  functionDeclarations: [
    {
      name: 'consultar_disponibilidad',
      description: 'Consulta días y horas libres en la agenda real de KreateIA.',
      parameters: {
        type: 'OBJECT',
        properties: {
          days: {
            type: 'INTEGER',
            description: 'Número de días futuros que se deben consultar, entre 7 y 21.',
          },
        },
      },
    },
    {
      name: 'reservar_llamada',
      description: 'Reserva una llamada comercial gratuita tras la confirmación explícita del usuario.',
      parameters: {
        type: 'OBJECT',
        required: ['date', 'time', 'name', 'company', 'phone', 'email', 'topic', 'confirmed'],
        properties: {
          date: { type: 'STRING', description: 'Fecha YYYY-MM-DD previamente devuelta como disponible.' },
          time: { type: 'STRING', description: 'Hora HH:MM previamente devuelta como disponible.' },
          name: { type: 'STRING', description: 'Nombre completo del interesado.' },
          company: { type: 'STRING', description: 'Empresa, actividad o profesión.' },
          phone: { type: 'STRING', description: 'Teléfono de contacto.' },
          email: { type: 'STRING', description: 'Email de contacto.' },
          topic: { type: 'STRING', description: 'Motivo resumido de la llamada.' },
          confirmed: { type: 'BOOLEAN', description: 'True solamente tras la confirmación explícita.' },
        },
      },
    },
  ],
}];

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    return json({
      ok: true,
      service: 'Asistente KreateIA',
      geminiConfigured: Boolean(env.GEMINI_API_KEY),
    });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Método no permitido.' }, 405);
  }

  try {
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return json({ ok: false, error: 'La conversación es demasiado grande.' }, 413);
    }

    requireEnv(env, [
      'GEMINI_API_KEY',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
    ]);

    const body = await request.json().catch(() => null);
    const messages = sanitizeMessages(body?.messages);
    if (!messages.length) {
      return json({ ok: false, error: 'Escribe un mensaje para continuar.' }, 400);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const model = String(env.GEMINI_MODEL || 'gemini-2.5-flash-lite').trim();
    const contents = messages.map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));

    const first = await callGemini(env.GEMINI_API_KEY, model, {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      tools: TOOLS,
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500,
      },
    });

    const modelContent = first?.candidates?.[0]?.content;
    if (!modelContent?.parts?.length) {
      throw new Error('Gemini no devolvió una respuesta válida.');
    }

    const functionPart = modelContent.parts.find(part => part.functionCall);
    if (!functionPart) {
      return json({
        ok: true,
        reply: extractText(modelContent) || '¿En qué servicio de KreateIA puedo ayudarte?',
      });
    }

    const functionCall = functionPart.functionCall;
    const toolResult = await executeTool({
      env,
      ip,
      name: functionCall.name,
      args: functionCall.args || {},
      lastUserMessage: lastUserMessage(messages),
    });

    const second = await callGemini(env.GEMINI_API_KEY, model, {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        ...contents,
        modelContent,
        {
          role: 'user',
          parts: [{
            functionResponse: {
              name: functionCall.name,
              response: toolResult,
            },
          }],
        },
      ],
      tools: TOOLS,
      toolConfig: { functionCallingConfig: { mode: 'NONE' } },
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 500,
      },
    });

    const reply = extractText(second?.candidates?.[0]?.content)
      || (toolResult.ok ? 'Operación realizada correctamente.' : toolResult.error);

    return json({
      ok: true,
      reply,
      action: publicToolResult(functionCall.name, toolResult),
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'services_assistant_error',
      message: error?.message || 'unknown',
    }));

    const missingGemini = String(error?.message || '').includes('GEMINI_API_KEY');
    return json({
      ok: false,
      error: missingGemini
        ? 'El asistente se está terminando de configurar. Puedes escribirnos por WhatsApp al 614 403 913.'
        : 'No he podido responder ahora. Puedes escribirnos por WhatsApp al 614 403 913.',
    }, missingGemini ? 503 : 500);
  }
}

async function executeTool({ env, ip, name, args, lastUserMessage: lastMessage }) {
  if (name === 'consultar_disponibilidad') {
    return getAvailability(env, clamp(Number(args.days || 14), 7, 21));
  }

  if (name === 'reservar_llamada') {
    if (args.confirmed !== true || !hasExplicitConfirmation(lastMessage)) {
      return {
        ok: false,
        error: 'La reserva necesita una confirmación explícita del usuario.',
        needsConfirmation: true,
      };
    }

    return createServiceBooking(env, ip, args);
  }

  return { ok: false, error: 'Función no autorizada.' };
}

async function callGemini(apiKey, model, payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(JSON.stringify({
      event: 'gemini_api_error',
      status: response.status,
      message: data?.error?.message || 'unknown',
    }));
    throw new Error('No se pudo consultar Gemini.');
  }

  return data;
}

async function getAvailability(env, daysToShow) {
  const accessToken = await getFirebaseAccessToken(env);
  const today = madridToday();
  const dates = [];

  for (let offset = 0; offset < daysToShow; offset++) {
    dates.push(addDays(today, offset));
  }

  const slotIds = [];
  const blockIds = [];

  dates.forEach(date => {
    blockIds.push(`${date}_day`);
    ALLOWED_TIMES.forEach(time => {
      const id = slotDocId(date, time);
      slotIds.push(id);
      blockIds.push(id);
    });
  });

  const [slotMap, blockMap] = await Promise.all([
    batchGetDocuments(env, accessToken, 'academy_slots', slotIds),
    batchGetDocuments(env, accessToken, 'academy_availability_blocks', blockIds),
  ]);

  const days = dates.map(date => {
    const weekday = weekdayForDate(date);
    const holiday = NATIONAL_HOLIDAYS[date] || '';
    const dayBlock = activeBlock(blockMap[`${date}_day`]);
    const slots = ALLOWED_TIMES.map(time => {
      const slotId = slotDocId(date, time);
      const occupied = activeSlot(slotMap[slotId]);
      const slotBlock = activeBlock(blockMap[slotId]);
      const unavailable = weekday === 0
        || weekday === 6
        || Boolean(holiday)
        || Boolean(dayBlock)
        || Boolean(slotBlock)
        || Boolean(occupied)
        || isPastMadridSlot(date, time)
        || isAnnualGroupSlot(date, time);

      return { time, available: !unavailable };
    });

    return {
      date,
      label: formatSpanishDate(date),
      slots: slots.filter(slot => slot.available),
    };
  }).filter(day => day.slots.length);

  return {
    ok: true,
    timezone: 'Europe/Madrid',
    days: days.slice(0, 8),
  };
}

async function createServiceBooking(env, ip, args) {
  const booking = validateBookingArgs(args);

  if (weekdayForDate(booking.date) === 0 || weekdayForDate(booking.date) === 6) {
    return { ok: false, error: 'Ese día no está disponible.' };
  }
  if (NATIONAL_HOLIDAYS[booking.date]) {
    return { ok: false, error: `Ese día es festivo: ${NATIONAL_HOLIDAYS[booking.date]}.` };
  }
  if (isPastMadridSlot(booking.date, booking.time)) {
    return { ok: false, error: 'Ese horario ya ha pasado.' };
  }
  if (isAnnualGroupSlot(booking.date, booking.time)) {
    return { ok: false, error: 'Ese horario está reservado para formación.' };
  }

  const latestAllowed = addDays(madridToday(), 42);
  if (booking.date > latestAllowed) {
    return { ok: false, error: 'Solo se pueden reservar llamadas dentro de los próximos 42 días.' };
  }

  const accessToken = await getFirebaseAccessToken(env);
  const slotId = slotDocId(booking.date, booking.time);
  const dayBlockPath = collectionDocPath(env, 'academy_availability_blocks', `${booking.date}_day`);
  const slotBlockPath = collectionDocPath(env, 'academy_availability_blocks', slotId);
  const slotPath = collectionDocPath(env, 'academy_slots', slotId);

  const [dayBlockDoc, slotBlockDoc, slotDoc] = await Promise.all([
    getFirestoreDoc(env, accessToken, dayBlockPath),
    getFirestoreDoc(env, accessToken, slotBlockPath),
    getFirestoreDoc(env, accessToken, slotPath),
  ]);

  if (activeBlock(dayBlockDoc)) return { ok: false, error: 'Ese día está bloqueado.' };
  if (activeBlock(slotBlockDoc)) return { ok: false, error: 'Ese horario está bloqueado.' };
  if (activeSlot(slotDoc)) return { ok: false, error: 'Ese horario acaba de ser reservado. Elige otro.' };

  const ipHash = await sha256(`${ip}|${madridToday()}`);
  const limitId = `${madridToday()}_${ipHash.slice(0, 32)}`;
  const limitPath = collectionDocPath(env, 'service_booking_limits', limitId);
  const limitDoc = await getFirestoreDoc(env, accessToken, limitPath);
  const limitData = limitDoc ? fromFields(limitDoc.fields || {}) : {};
  const currentCount = Number(limitData.count || 0);

  if (currentCount >= MAX_BOOKINGS_PER_IP_DAY) {
    return {
      ok: false,
      error: 'Se ha alcanzado el límite de reservas de hoy. Contacta por WhatsApp al 614 403 913.',
    };
  }

  const now = new Date();
  const bookingId = `service_${crypto.randomUUID()}`;
  const bookingPath = collectionDocPath(env, 'private_academy_bookings', bookingId);
  const bookingData = {
    id: bookingId,
    bookingId,
    uid: '',
    customerUid: '',
    email: booking.email,
    customerEmail: booking.email,
    studentName: booking.name,
    contactPhone: booking.phone,
    company: booking.company,
    courseId: 'service-call',
    courseName: 'Llamada de diagnóstico KreateIA',
    serviceType: 'Servicios IA',
    classNumber: 1,
    totalClasses: 1,
    date: booking.date,
    time: booking.time,
    slotId,
    timezone: 'Europe/Madrid',
    status: 'booked',
    internalStatus: 'new_service_lead',
    notes: booking.topic,
    source: 'services_ai_chat',
    createdAt: now,
    createdAtIso: now.toISOString(),
    updatedAt: now,
    updatedAtIso: now.toISOString(),
  };

  const slotData = {
    id: slotId,
    date: booking.date,
    time: booking.time,
    status: 'booked',
    uid: '',
    email: booking.email,
    courseId: 'service-call',
    courseName: 'Llamada de diagnóstico KreateIA',
    classNumber: 1,
    bookingId,
    source: 'services_ai_chat',
    createdAt: now,
    createdAtIso: now.toISOString(),
  };

  const limitWrite = {
    update: {
      name: limitPath,
      fields: toFields({
        count: currentCount + 1,
        date: madridToday(),
        updatedAt: now,
      }),
    },
    currentDocument: limitDoc
      ? { updateTime: limitDoc.updateTime }
      : { exists: false },
  };

  try {
    await commitWrites(env, accessToken, [
      createWrite(slotPath, slotData),
      createWrite(bookingPath, bookingData),
      limitWrite,
    ]);
  } catch (error) {
    if (String(error?.message || '').includes('FAILED_PRECONDITION')
      || String(error?.message || '').includes('ALREADY_EXISTS')) {
      return { ok: false, error: 'Ese horario acaba de ser reservado. Elige otro.' };
    }
    throw error;
  }

  return {
    ok: true,
    booking: {
      id: bookingId,
      date: booking.date,
      time: booking.time,
      timezone: 'Europe/Madrid',
      name: booking.name,
    },
  };
}

function validateBookingArgs(args) {
  const date = String(args.date || '').trim();
  const time = String(args.time || '').trim();
  const name = cleanText(args.name, 80);
  const company = cleanText(args.company, 120);
  const phone = String(args.phone || '').trim().slice(0, 24);
  const email = String(args.email || '').trim().toLowerCase().slice(0, 160);
  const topic = cleanText(args.topic, 700);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('Fecha no válida.');
  if (!ALLOWED_TIMES.includes(time)) throw badRequest('Hora no válida.');
  if (name.length < 2) throw badRequest('Falta el nombre completo.');
  if (company.length < 2) throw badRequest('Falta la empresa o actividad.');
  if (!/^[+\d][\d\s()-]{6,22}$/.test(phone)) throw badRequest('Teléfono no válido.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Email no válido.');
  if (topic.length < 4) throw badRequest('Falta el motivo de la llamada.');

  return { date, time, name, company, phone, email, topic };
}

function sanitizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return [];
  const result = [];
  let totalChars = 0;

  rawMessages.slice(-MAX_MESSAGES).forEach(item => {
    const role = item?.role === 'assistant' ? 'assistant' : 'user';
    const content = cleanText(item?.content, 1200);
    if (!content) return;
    totalChars += content.length;
    if (totalChars <= MAX_TOTAL_CHARS) result.push({ role, content });
  });

  return result;
}

function publicToolResult(name, result) {
  if (name === 'consultar_disponibilidad' && result.ok) {
    return { type: 'availability', timezone: result.timezone, days: result.days };
  }
  if (name === 'reservar_llamada' && result.ok) {
    return { type: 'booking', booking: result.booking };
  }
  return { type: 'notice', ok: false, error: result.error || 'No se pudo completar la acción.' };
}

function extractText(content) {
  return (content?.parts || [])
    .filter(part => typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim();
}

function lastUserMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') return messages[index].content;
  }
  return '';
}

function hasExplicitConfirmation(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /\b(confirmo|confirmar|si[, ]+confirmo|de acuerdo|correcto|adelante|reservala|reserva)\b/.test(normalized);
}

function activeBlock(doc) {
  if (!doc) return null;
  const data = doc.fields ? fromFields(doc.fields) : doc;
  return String(data?.status || 'blocked').toLowerCase() === 'blocked' ? data : null;
}

function activeSlot(doc) {
  if (!doc) return null;
  const data = doc.fields ? fromFields(doc.fields) : doc;
  const status = String(data?.status || 'booked').toLowerCase();
  return ['cancelled', 'canceled', 'released', 'deleted'].includes(status) ? null : data;
}

function isAnnualGroupSlot(date, time) {
  return date >= ANNUAL_GROUP_START
    && date <= ANNUAL_GROUP_END
    && ANNUAL_GROUP_TIMES.has(time)
    && weekdayForDate(date) === 5
    && !NATIONAL_HOLIDAYS[date];
}

function isPastMadridSlot(date, time) {
  const now = madridNowParts();
  const [hour, minute] = String(time || '').split(':').map(Number);
  const slotMinutes = (hour || 0) * 60 + (minute || 0);
  if (date < now.date) return true;
  if (date > now.date) return false;
  return slotMinutes <= now.minutes;
}

function madridNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const map = {};
  parts.forEach(part => {
    if (part.type !== 'literal') map[part.type] = part.value;
  });
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    minutes: Number(map.hour || 0) * 60 + Number(map.minute || 0),
  };
}

function madridToday() {
  return madridNowParts().date;
}

function addDays(dateText, amount) {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function weekdayForDate(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function formatSpanishDate(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function slotDocId(date, time) {
  return `${date}_${String(time || '').replace(':', '')}`;
}

async function batchGetDocuments(env, accessToken, collectionName, ids) {
  if (!ids.length) return {};
  const documents = ids.map(id => collectionDocPath(env, collectionName, id));
  const response = await fetch(`${firestoreBase(env)}:batchGet`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ documents }),
  });
  if (!response.ok) throw new Error('No se pudo consultar la agenda.');
  const data = await response.json();
  const result = {};
  (data || []).forEach(item => {
    if (item.found) result[item.found.name.split('/').pop()] = item.found;
  });
  return result;
}

async function getFirestoreDoc(env, accessToken, documentPath) {
  const response = await fetch(`https://firestore.googleapis.com/v1/${documentPath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || 'No se pudo leer la agenda.');
  return data;
}

async function commitWrites(env, accessToken, writes) {
  const response = await fetch(`${firestoreBase(env)}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${data?.error?.status || ''} ${data?.error?.message || 'No se pudo guardar la reserva.'}`.trim());
  }
}

function createWrite(documentPath, data) {
  return {
    update: { name: documentPath, fields: toFields(data) },
    currentDocument: { exists: false },
  };
}

function collectionDocPath(env, collectionName, docId) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}`;
}

function firestoreBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

async function getFirebaseAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: env.FIREBASE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    env.FIREBASE_PRIVATE_KEY
  );
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || 'No se pudo autenticar con Firebase.');
  }
  return data.access_token;
}

async function signJwt(header, payload, privateKey) {
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64Url(signature)}`;
}

function pemToArrayBuffer(pem) {
  const clean = String(pem || '')
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function base64Url(input) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toFields(object) {
  const fields = {};
  Object.entries(object || {}).forEach(([key, value]) => {
    if (value !== undefined) fields[key] = toValue(value);
  });
  return fields;
}

function toValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFields(value) } };
  return { stringValue: String(value) };
}

function fromFields(fields) {
  const result = {};
  Object.entries(fields || {}).forEach(([key, value]) => {
    result[key] = fromValue(value);
  });
  return result;
}

function fromValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromValue);
  if ('mapValue' in value) return fromFields(value.mapValue.fields || {});
  return null;
}

function cleanText(value, maxLength = 1200) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function requireEnv(env, keys) {
  const missing = keys.filter(key => !env[key]);
  if (missing.length) throw new Error(`Faltan variables: ${missing.join(', ')}`);
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
