const PREFIX = 'coach-journal.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTIONS = new Set(['experience', 'clients']);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Database is not configured' });
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const request = async (path, options = {}) => {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Database request failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  };
  try {
    if (req.method === 'GET') {
      const entries = [];
      // Fetch every page; PostgREST caps the number of rows in a single response.
      for (let offset = 0; ; offset += 500) {
        const rows = await request(`app_state?key=like.${PREFIX}*&select=key,value,updated_at&order=key.asc&limit=500&offset=${offset}`);
        if (!Array.isArray(rows)) throw new Error('Invalid database response');
        for (const row of rows) {
          if (row.key === PREFIX + row.value?.id && SECTIONS.has(row.value?.section)) {
            entries.push({ ...row.value, updatedAt: row.updated_at });
          }
        }
        if (rows.length < 500) break;
      }
      return res.status(200).json({ entries });
    }
    if (req.method === 'POST') {
      const { id, section, date, content, prompt = '' } = req.body || {};
      if (typeof id !== 'string' || !UUID.test(id) || !SECTIONS.has(section) || !validDate(date)
        || typeof content !== 'string' || !content.trim() || content.length > 20000
        || typeof prompt !== 'string' || prompt.length > 200) {
        return res.status(400).json({ error: 'Invalid coaching journal entry' });
      }
      const value = { id: id.toLowerCase(), section, date, content: content.trim(), prompt };
      const rows = await request('app_state?on_conflict=key', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ key: PREFIX + value.id, value, updated_at: new Date().toISOString() }),
      });
      if (!rows?.[0]?.value) throw new Error('Database did not return the saved entry');
      return res.status(200).json({ ...rows[0].value, updatedAt: rows[0].updated_at });
    }
    if (req.method === 'DELETE') {
      const id = req.body?.id;
      if (typeof id !== 'string' || !UUID.test(id)) return res.status(400).json({ error: 'Invalid entry id' });
      await request(`app_state?key=eq.${PREFIX}${id.toLowerCase()}`, {
        method: 'DELETE', headers: { Prefer: 'return=minimal' },
      });
      return res.status(204).end();
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(502).json({ error: 'Coaching journal database request failed' });
  }
}
