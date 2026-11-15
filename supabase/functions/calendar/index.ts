// Bear Squad Trading: economic calendar feed for the site.
// Pulls this week's calendar from the public ForexFactory JSON feed, keeps US (USD) events,
// and caches it for 15 minutes so we never hammer the source.
// No secrets used. Data is public.

type Ev = { title: string; country: string; date: string; impact: string; forecast: string; previous: string };
const SRC = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const TTL = 15 * 60 * 1000;
const cache: { t: number; body: unknown } = { t: 0, body: null };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });

async function load() {
  if (cache.body && Date.now() - cache.t < TTL) return cache.body;
  const r = await fetch(SRC, { headers: { "User-Agent": "Mozilla/5.0 (BearSquadTrading calendar)" } });
  if (!r.ok) throw new Error("source " + r.status);
  const all: Ev[] = await r.json();
  const events = all
    .filter((e) => e.country === "USD")
    .map((e) => ({
      t: Math.floor(new Date(e.date).getTime() / 1000),
      title: e.title,
      impact: e.impact, // High | Medium | Low | Holiday
      forecast: e.forecast || "",
      previous: e.previous || "",
    }))
    .filter((e) => isFinite(e.t))
    .sort((a, b) => a.t - b.t);
  const body = { source: "ForexFactory", generated: Math.floor(Date.now() / 1000), events };
  cache.t = Date.now(); cache.body = body;
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    return json(await load());
  } catch (e) {
    if (cache.body) return json(cache.body); // serve stale on errors
    return json({ error: "calendar unavailable", detail: String(e) }, 502);
  }
});
