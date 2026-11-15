// Bear Squad Trading: "The Gym" replay sessions.
// Serves a hidden past NQ morning (5-minute candles) for the practice game,
// plus indicators computed from full history (session VWAP, EMA 9/21/50/200 for older pages)
// and prior closes so the page can compute any EMA period the user chooses
// and key levels (prior day high/low/close, overnight high/low).
// Each indicator value only uses candles up to that bar, so nothing leaks ahead.
// Daily mode: everyone gets the same session (seeded by today's date, PT).
// Practice mode: pick by index. Dates are never sent to the client.
// No secrets used. Data is public historical bar data.

type Row = { t: number; date: string; mm: number; wd: string; o: number; h: number; l: number; c: number; v: number };
type Session = {
  wd: string; bars: number[][]; ind: Record<string, number[]>; pre: number[];
  lv: Record<string, number | null>; date: string; t0: number; t1: number;
};
const cache: { t: number; days: Session[] | null } = { t: 0, days: null };
const TTL = 6 * 60 * 60 * 1000;

const START = 330; // 5:30am PT (premarket context)
const OPEN = 390;  // 6:30am PT (game starts)
const END = 510;   // 8:30am PT (game ends)
const RTH_END = 780; // 1:00pm PT
const PERIODS = [9, 21, 50, 200];
const PRE = 1500; // prior 5m closes sent for custom EMA warm-up (~5 trading days)

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", weekday: "short",
});
function parts(ts: number) {
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ts * 1000))) o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, mm: (+o.hour % 24) * 60 + +o.minute, wd: o.weekday };
}
const r2 = (x: number) => Math.round(x * 100) / 100;

async function loadDays(): Promise<Session[]> {
  if (cache.days && Date.now() - cache.t < TTL) return cache.days;
  const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/NQ%3DF?interval=5m&range=60d", { headers: { "User-Agent": "Mozilla/5.0" } });
  const j = await r.json();
  const res = j.chart.result[0], q = res.indicators.quote[0];
  const rows: Row[] = [];
  res.timestamp.forEach((t: number, i: number) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || h == null || l == null || c == null) return;
    const p = parts(t);
    rows.push({ t, date: p.date, mm: p.mm, wd: p.wd, o, h, l, c, v: q.volume[i] || 0 });
  });
  rows.sort((a, b) => a.t - b.t);

  // EMAs over the full series
  const ema: Record<number, number[]> = {};
  for (const n of PERIODS) {
    const k = 2 / (n + 1); const out: number[] = []; let e = rows.length ? rows[0].c : 0;
    rows.forEach((row, i) => { e = i === 0 ? row.c : row.c * k + e * (1 - k); out.push(e); });
    ema[n] = out;
  }
  // Session VWAP, resets at the 3:00pm PT Globex open (or after a long gap)
  const vwap: number[] = []; let pv = 0, vv = 0;
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    if (!prev || (row.mm >= 900 && prev.mm < 900) || row.t - prev.t > 3600) { pv = 0; vv = 0; }
    const tp = (row.h + row.l + row.c) / 3; pv += tp * row.v; vv += row.v;
    vwap.push(vv > 0 ? pv / vv : tp);
  });

  // RTH summary per date (for prior-day levels)
  const rth: Record<string, { h: number; l: number; c: number; endT: number }> = {};
  rows.forEach((row) => {
    if (row.mm < OPEN || row.mm >= RTH_END) return;
    const d = rth[row.date] || (rth[row.date] = { h: -Infinity, l: Infinity, c: row.c, endT: row.t });
    d.h = Math.max(d.h, row.h); d.l = Math.min(d.l, row.l); d.c = row.c; d.endT = row.t;
  });
  const rthDates = Object.keys(rth).sort();

  const today = parts(Date.now() / 1000).date;
  const byDate: Record<string, number[]> = {};
  rows.forEach((row, i) => { if (row.mm >= START && row.mm < END) (byDate[row.date] = byDate[row.date] || []).push(i); });

  const days: Session[] = [];
  for (const date of Object.keys(byDate).sort()) {
    const idx = byDate[date], first = rows[idx[0]];
    if (date >= today || !["Mon", "Tue", "Wed", "Thu", "Fri"].includes(first.wd)) continue;
    if (idx.length < 34 || !idx.some((i) => rows[i].mm === OPEN)) continue;
    const prevDate = rthDates.filter((d) => d < date).pop();
    if (!prevDate) continue;
    const pd = rth[prevDate];
    const openT = rows[idx.find((i) => rows[i].mm === OPEN)!].t;
    let onh = -Infinity, onl = Infinity;
    rows.forEach((row) => {
      if (row.t > pd.endT && row.t < openT && (row.date !== prevDate || row.mm >= 900)) { onh = Math.max(onh, row.h); onl = Math.min(onl, row.l); }
    });
    const ind: Record<string, number[]> = { vwap: idx.map((i) => r2(vwap[i])) };
    for (const n of PERIODS) ind["e" + n] = idx.map((i) => r2(ema[n][i]));
    days.push({
      date, wd: first.wd, t0: first.t, t1: rows[idx[idx.length - 1]].t + 300,
      bars: idx.map((i) => { const b = rows[i]; return [b.mm, r2(b.o), r2(b.h), r2(b.l), r2(b.c), b.v]; }),
      ind,
      // closes before the session window, so the page can compute any EMA period the user picks
      pre: rows.slice(Math.max(0, idx[0] - PRE), idx[0]).map((r) => r2(r.c)),
      lv: { pdh: r2(pd.h), pdl: r2(pd.l), pdc: r2(pd.c), onh: isFinite(onh) ? r2(onh) : null, onl: isFinite(onl) ? r2(onl) : null },
    });
  }
  // skip the first few sessions so EMA 200 has enough history
  const out = days.slice(3);
  cache.t = Date.now(); cache.days = out;
  return out;
}
// Real 1-minute candles for the session window, when Yahoo still has them (roughly the last 30 days).
// Older sessions return null and the page builds the minutes from the 5-minute bars instead.
const m1Cache = new Map<string, number[][] | null>();
const SB_URL = Deno.env.get("SUPABASE_URL") || "", SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
// 1) our own stored library (public.nq_1m, filled daily by pg_cron); 2) Yahoo for the last ~30 days.
async function fromLibrary(d: Session): Promise<number[][] | null> {
  if (!SB_URL || !SB_ANON) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/nq_1m?d=eq.${d.date}&mm=gte.${START}&mm=lt.${END + 5}&select=mm,o,h,l,c,v&order=mm`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
    if (!r.ok) return null;
    const rows = (await r.json()).map((x: Record<string, number>) => [+x.mm, +x.o, +x.h, +x.l, +x.c, +x.v]);
    return rows.length >= d.bars.length * 5 * 0.8 ? rows : null;
  } catch (_e) { return null; }
}
async function loadM1(d: Session): Promise<number[][] | null> {
  if (m1Cache.has(d.date)) return m1Cache.get(d.date)!;
  let out: number[][] | null = await fromLibrary(d);
  if (!out && Date.now() / 1000 - d.t0 < 29 * 86400) {
    try {
      const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 4000);
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/NQ%3DF?interval=1m&period1=${d.t0}&period2=${d.t1}`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: ac.signal });
      clearTimeout(to);
      const j = await r.json(); const res = j?.chart?.result?.[0];
      if (res?.timestamp) {
        const q = res.indicators.quote[0], rows: number[][] = [];
        res.timestamp.forEach((t: number, i: number) => {
          const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
          if (o == null || h == null || l == null || c == null || t < d.t0 || t >= d.t1) return;
          rows.push([parts(t).mm, r2(o), r2(h), r2(l), r2(c), q.volume[i] || 0]);
        });
        if (rows.length >= d.bars.length * 5 * 0.8) out = rows;
      }
    } catch (_e) { out = null; }
  }
  if (out) m1Cache.set(d.date, out);
  return out;
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
    const m1 = await loadM1(d);
    return json({ mode, day: today, session: code, weekday: d.wd, count: days.length, startIdx, bars: d.bars, ind: d.ind, pre: d.pre, lv: d.lv, m1 });
  } catch (e) {
    return json({ error: "data source unavailable", detail: String(e) }, 502);
  }
});
