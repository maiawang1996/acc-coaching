const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

export default async function handler(req, res) {
  if (!url || !key) return res.status(500).json({ error: "Database is not configured" });
  const state = await fetch(`${url}/rest/v1/app_state?key=eq.completed_courses&select=value`, { headers }).then(r => r.json());
  const hours = await fetch(`${url}/rest/v1/coaching_sessions?select=id,session_date,client,topic,duration&order=session_date.desc`, { headers }).then(r => r.json());
  res.status(200).json({ completed: state[0]?.value ?? [0,1,2,3,4,5], hours: hours.map(r => ({ ...r, date: r.session_date })) });
}
