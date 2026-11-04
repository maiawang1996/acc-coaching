export function createJournalFixture(initial = []) {
  const rows = new Map(initial.map(row => [row.key, structuredClone(row)]));
  const fixture = {
    rows, offline: false, calls: [],
    async fetch(url, options = {}) {
      if (!url.startsWith('https://fixture.supabase.test/rest/v1/app_state')) throw new Error('Unexpected test destination');
      const parsed = new URL(url), method = options.method || 'GET';
      fixture.calls.push({ method, query: parsed.search });
      if (fixture.offline) return new Response('{}', { status: 503 });
      if (method === 'GET') {
        const key = parsed.searchParams.get('key');
        const matching = [...rows.values()].filter(row => key.startsWith('like.')
          ? row.key.startsWith(key.slice(5, -1)) : row.key === key.slice(3));
        matching.sort((a, b) => a.key.localeCompare(b.key));
        const offset = Number(parsed.searchParams.get('offset') || 0);
        return Response.json(matching.slice(offset, offset + Number(parsed.searchParams.get('limit') || 500)));
      }
      if (method === 'POST') {
        const row = JSON.parse(options.body); rows.set(row.key, row);
        return Response.json([row]);
      }
      if (method === 'DELETE') {
        rows.delete(parsed.searchParams.get('key').slice(3));
        return new Response(null, { status: 204 });
      }
      throw new Error('Unexpected test method');
    },
  };
  return fixture;
}

export async function invoke(handler, method, body) {
  const result = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; }, end() { return this; } };
  await handler({ method, body }, result);
  return result;
}
