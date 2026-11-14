// Bear Squad Trading: "The Gym" replay sessions.
// Serves a hidden past NQ morning (5-minute candles) for the practice game.
// Daily mode: everyone gets the same session (seeded by today's date, PT).
// Practice mode: pick by index. Dates are never sent to the client.
// No secrets used. Data is public historical bar data.

const cache: { t: number; days: Day[] | null } = { t: 0, days: null };
const TTL = 6 * 60 * 60 * 1000;
type Bar = [number, number, number, number, number, number]; // [minuteOfDayPT, o, h, l, c, v]
type Day = { date: string; wd: string; bars: Bar[] };

const START = 330; // 5:30am PT (premarket context)
const OPEN = 390;  // 6:30am PT (game starts)
const END = 510;   // 8:30am PT (game ends)

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", weekday: "short",
});
function parts(ts: number) {
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ts * 1000))) o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, mm: (+o.hour % 24) * 60 + +o.minute, wd: o.weekday };
}
async function loadDays(): Promise<Day[]> {
  if (cache.days && Date.now() - cache.t < TTL) return cache.days;
  const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/NQ%3DF?interval=5m&range=60d", { headers: { "User-Agent": "Mozilla/5.0" } });
  const j = await r.json();
  const res = j.chart.result[0], q = res.indicators.quote[0];
  const by: Record<string, Day> = {};
  res.timestamp.forEach((t: number, i: number) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i];
    if (o == null || h == null || l == null || c == null) return;
    const p = parts(t);
    if (p.mm < START || p.mm >= END) return;
    if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(p.wd)) return;
    const d = by[p.date] || (by[p.date] = { date: p.date, wd: p.wd, bars: [] });
    d.bars.push([p.mm, +o.toFixed(2), +h.toFixed(2), +l.toFixed(2), +c.toFixed(2), v || 0]);
  });
  const today = parts(Date.now() / 1000).date;
  const days = Object.values(by)
    .filter((d) => d.date < today && d.bars.length >= 34 && d.bars.some((b) => b[0] === OPEN))
    .map((d) => ({ ...d, bars: d.bars.sort((a, b) => a[0] - b[0]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  cache.t = Date.now(); cache.days = days;
  return days;
}
function hash(s: string) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const u = new URL(req.url);
    const mode = u.searchParams.get("mode") === "practice" ? "practice" : "daily";
    const days = await loadDays();
    if (days.length < 8) return json({ error: "not enough sessions" }, 503);
    const today = parts(Date.now() / 1000).date;
    let idx: number;
    if (mode === "daily") {
      const pool = days.length - 3; // skip the most recent 3 sessions
      idx = hash("bsq-gym-" + today) % pool;
    } else {
      const i = parseInt(u.searchParams.get("i") || "0", 10);
      idx = ((isNaN(i) ? 0 : i) % days.length + days.length) % days.length;
    }
    const d = days[idx];
    const code = (hash("bsq-" + d.date) % 9000 + 1000).toString();
    const startIdx = d.bars.findIndex((b) => b[0] === OPEN);
    return json({ mode, day: today, session: code, weekday: d.wd, count: days.length, startIdx, bars: d.bars });
  } catch (e) {
    return json({ error: "data source unavailable", detail: String(e) }, 502);
  }
});
