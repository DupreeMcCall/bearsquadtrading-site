// Bear Squad Trading: free gamma (GEX) levels for NQ and ES.
// Pulls delayed public options data, computes dealer gamma by strike, returns small JSON for the site.
// No secrets used. Data is public and delayed about 15 minutes.

const SRC: Record<string, { opt: string; fut: string; band: number; name: string }> = {
  NQ: { opt: "QQQ", fut: "NQ=F", band: 0.07, name: "QQQ" },
  ES: { opt: "_SPX", fut: "ES=F", band: 0.05, name: "SPX" },
};
const cache = new Map<string, { t: number; body: string }>();
const TTL = 3 * 60 * 1000;

function pdf(x: number) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }
function bsGamma(S: number, K: number, T: number, iv: number) {
  if (!(iv > 0) || !(T > 0)) return 0;
  const d1 = (Math.log(S / K) + 0.5 * iv * iv * T) / (iv * Math.sqrt(T));
  return pdf(d1) / (S * iv * Math.sqrt(T));
}
function etDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
// deno-lint-ignore no-explicit-any
function computeGex(chain: any, mode: string, band: number, now: Date) {
  const S = chain.current_price, today = etDate(now);
  // deno-lint-ignore no-explicit-any
  let rows: any[] = [];
  // deno-lint-ignore no-explicit-any
  chain.options.forEach((o: any) => {
    const m = /(\d{6})([CP])(\d{8})$/.exec(o.option);
    if (!m || !o.open_interest) return;
    const exp = "20" + m[1].slice(0, 2) + "-" + m[1].slice(2, 4) + "-" + m[1].slice(4, 6);
    if (exp < today) return;
    rows.push({ exp, cp: m[2], k: +m[3] / 1000, oi: o.open_interest, g: o.gamma || 0, iv: o.iv || 0 });
  });
  const exps = Array.from(new Set(rows.map((r) => r.exp))).sort();
  const first = exps[0];
  const lim = new Date(now.getTime() + 45 * 864e5).toISOString().slice(0, 10);
  rows = rows.filter((r) => (mode === "0dte" ? r.exp === first : r.exp <= lim));
  const lo = S * (1 - band), hi = S * (1 + band);
  // deno-lint-ignore no-explicit-any
  const by: Record<string, any> = {};
  rows.forEach((r) => {
    const v = r.g * r.oi * 100 * S * S * 0.01 * (r.cp === "C" ? 1 : -1);
    const b = by[r.k] || (by[r.k] = { k: r.k, call: 0, put: 0 });
    if (r.cp === "C") b.call += v; else b.put += v;
  });
  let net = 0;
  Object.values(by).forEach((b) => { net += b.call + b.put; });
  const strikes = Object.values(by).filter((b) => b.k >= lo && b.k <= hi).sort((a, b) => a.k - b.k);
  // deno-lint-ignore no-explicit-any
  let cw: any = null, pw: any = null;
  strikes.forEach((b) => {
    if (b.k >= S * 0.995 && (!cw || b.call > cw.call)) cw = b;
    if (b.k <= S * 1.005 && (!pw || b.put < pw.put)) pw = b;
  });
  const nowMs = now.getTime(), prof: number[][] = [], N = 60, pl = S * (1 - band * 0.8), ph = S * (1 + band * 0.8);
  for (let i = 0; i <= N; i++) {
    const x = pl + (ph - pl) * i / N;
    let tot = 0;
    for (const r of rows) {
      const T = Math.max((Date.parse(r.exp + "T21:00:00Z") - nowMs) / (365 * 864e5), 1 / (365 * 24));
      tot += bsGamma(x, r.k, T, r.iv) * r.oi * 100 * x * x * 0.01 * (r.cp === "C" ? 1 : -1);
    }
    prof.push([x, tot]);
  }
  let flip: number | null = null, best = 1e18;
  for (let q = 1; q < prof.length; q++) {
    const a = prof[q - 1], c = prof[q];
    if ((a[1] <= 0 && c[1] > 0) || (a[1] >= 0 && c[1] < 0)) {
      const fx = a[0] + (c[0] - a[0]) * (0 - a[1]) / (c[1] - a[1]);
      if (Math.abs(fx - S) < best) { best = Math.abs(fx - S); flip = fx; }
    }
  }
  return {
    exps: mode === "0dte" ? [first] : exps.filter((e) => e <= lim),
    netGex: Math.round(net),
    callWall: cw ? cw.k : null,
    putWall: pw ? pw.k : null,
    flip: flip ? +flip.toFixed(2) : null,
    strikes: strikes.map((b) => [b.k, Math.round(b.call), Math.round(b.put)]),
  };
}
async function futPrice(sym: string) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`, { headers: { "User-Agent": "Mozilla/5.0" } });
    const j = await r.json();
    const m = j.chart.result[0].meta;
    return { price: m.regularMarketPrice, time: m.regularMarketTime };
  } catch (_e) { return null; }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const m = (new URL(req.url).searchParams.get("m") || "NQ").toUpperCase();
  const s = SRC[m];
  if (!s) return new Response(JSON.stringify({ error: "market must be NQ or ES" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  const hit = cache.get(m);
  if (hit && Date.now() - hit.t < TTL) return new Response(hit.body, { headers: { ...cors, "Content-Type": "application/json", "X-Cache": "hit" } });
  try {
    const [cr, fut] = await Promise.all([
      fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${s.opt}.json`).then((r) => r.json()),
      futPrice(s.fut),
    ]);
    const now = new Date();
    const body = JSON.stringify({
      market: m, source: s.name, spot: cr.data.current_price, fut, generated: now.toISOString(),
      all: computeGex(cr.data, "all", s.band, now),
      next: computeGex(cr.data, "0dte", s.band, now),
    });
    cache.set(m, { t: Date.now(), body });
    return new Response(body, { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=120" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "data source unavailable", detail: String(e) }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
