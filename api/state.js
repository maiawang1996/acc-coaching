const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const getRows = async path => {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers });
  const body = await response.json();
  if (!response.ok || !Array.isArray(body)) throw new Error(JSON.stringify(body));
  return body;
};

export default async function handler(req, res) {
  if (!url || !key) return res.status(500).json({ error: "Database is not configured" });
  try {
    if (req.method === "GET") {
      const [completedState, reflectionsState, hours] = await Promise.all([
        getRows('app_state?key=eq.completed_courses&select=key,value'),
        getRows('app_state?key=eq.reflections&select=key,value'),
        getRows('coaching_sessions?select=id,session_date,client,topic,duration&order=session_date.desc'),
      ]);
      const state = [...completedState, ...reflectionsState];
      const values = Object.fromEntries(state.map(row => [row.key, row.value]));
      return res.status(200).json({ completed: values.completed_courses ?? [0,1,2,3,4,5], reflections: values.reflections ?? [], hours });
    }

    if (req.method === "POST" && req.body?.type === "session") {
      const { session_date, client, topic, duration } = req.body;
      const response = await fetch(`${url}/rest/v1/coaching_sessions`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({ session_date, client, topic, duration }),
      });
      if (!response.ok) throw new Error(await response.text());
      return res.status(201).json((await response.json())[0]);
    }

    if (req.method === "POST" && req.body?.type === "state") {
      const response = await fetch(`${url}/rest/v1/app_state?on_conflict=key`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([
          { key: "completed_courses", value: req.body.completed },
          { key: "reflections", value: req.body.reflections },
        ]),
      });
      if (!response.ok) throw new Error(await response.text());
      return res.status(204).end();
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: "Database request failed", detail: error.message });
  }
}
