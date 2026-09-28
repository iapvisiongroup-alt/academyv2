const ORIGIN = 'https://academyv2-6ed.pages.dev';

export default {
  async fetch(request) {
    const source = new URL(request.url);
    const target = new URL(source.pathname + source.search, ORIGIN);
    const headers = new Headers(request.headers);
    headers.set('host', target.host);

    const response = await fetch(new Request(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    }));

    const outgoing = new Headers(response.headers);
    outgoing.set('x-kreateia-edge', 'site-proxy');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outgoing,
    });
  },
};
