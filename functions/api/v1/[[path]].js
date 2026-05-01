export async function onRequest(context) {
    const { request, env, params } = context;
    
    // Capturamos el endpoint que está pidiendo el frontend
    const endpoint = params.path.join('/');
    const targetUrl = `https://api.muapi.ai/api/v1/${endpoint}`;

    // Clonamos la petición original del frontend
    const newRequest = new Request(request);

    // INYECCIÓN DE SEGURIDAD: Aquí le ponemos tu clave secreta de Cloudflare.
    if (env.MUAPI_KEY) {
        newRequest.headers.set('x-api-key', env.MUAPI_KEY);
    } else {
        return new Response(JSON.stringify({ error: "API Key no configurada en el servidor" }), { status: 500 });
    }

    // Reenviamos la petición a Muapi y le devolvemos el resultado al frontend
    return fetch(targetUrl, newRequest);
}
