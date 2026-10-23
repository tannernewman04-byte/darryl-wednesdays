// Upstash Redis when connected (Vercel Marketplace sets the env vars);
// otherwise an in-memory store so the site still runs locally.
// Upstash Redis REST API (plain fetch, no packages needed).
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function redisStore() {
  const cmd = async (...args) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(args.map(a => (typeof a === "number" ? String(a) : a))),
    });
    const j = await r.json();
    if (j.error) throw new Error("Redis: " + j.error);
    return j.result;
  };
  return {
    kind: "redis",
    get: k => cmd("GET", k),
    mget: keys => (keys.length ? cmd("MGET", ...keys) : Promise.resolve([])),
    set: (k, v, o = {}) => {
      const a = ["SET", k, String(v)];
      if (o.nx) a.push("NX");
      if (o.ex) a.push("EX", o.ex);
      return cmd(...a);
    },
    del: k => cmd("DEL", k),
    incr: k => cmd("INCR", k),
    decr: k => cmd("DECR", k),
    sadd: (k, members) => cmd("SADD", k, ...members),
    spop: k => cmd("SPOP", k),
    rpush: (k, values) => cmd("RPUSH", k, ...values),
    lpush: (k, values) => cmd("LPUSH", k, ...values),
    lrange: (k, a, b) => cmd("LRANGE", k, a, b),
    ltrim: (k, a, b) => cmd("LTRIM", k, a, b),
    zincrby: (k, n, m) => cmd("ZINCRBY", k, n, m),
    ztop: async (k, n) => {
      const flat = await cmd("ZRANGE", k, 0, n - 1, "REV", "WITHSCORES");
      const out = [];
      for (let i = 0; i < flat.length; i += 2) out.push({ member: String(flat[i]), score: Number(flat[i + 1]) });
      return out;
    },
  };
}

function memoryStore() {
  const g = globalThis.__darrylMem || (globalThis.__darrylMem = { kv: new Map(), exp: new Map() });
  const kv = g.kv;
  const alive = k => {
    const e = g.exp.get(k);
    if (e && e < Date.now()) { kv.delete(k); g.exp.delete(k); }
    return kv.has(k);
  };
  const list = k => (alive(k) ? kv.get(k) : (kv.set(k, []), kv.get(k)));
  const norm = (i, len) => (i < 0 ? len + i : i);
  return {
    kind: "memory",
    async get(k) { return alive(k) ? kv.get(k) : null; },
    async mget(keys) { return keys.map(k => (alive(k) ? kv.get(k) : null)); },
    async set(k, v, o = {}) {
      if (o.nx && alive(k)) return null;
      kv.set(k, String(v));
      if (o.ex) g.exp.set(k, Date.now() + o.ex * 1000); else g.exp.delete(k);
      return "OK";
    },
    async del(k) { kv.delete(k); return 1; },
    async incr(k) { const v = (Number(alive(k) ? kv.get(k) : 0) || 0) + 1; kv.set(k, String(v)); return v; },
    async decr(k) { const v = (Number(alive(k) ? kv.get(k) : 0) || 0) - 1; kv.set(k, String(v)); return v; },
    async sadd(k, members) { if (!alive(k)) kv.set(k, new Set()); members.forEach(m => kv.get(k).add(String(m))); return members.length; },
    async spop(k) {
      if (!alive(k)) return null;
      const arr = [...kv.get(k)]; if (!arr.length) return null;
      const m = arr[Math.floor(Math.random() * arr.length)]; kv.get(k).delete(m); return m;
    },
    async rpush(k, values) { const l = list(k); l.push(...values.map(String)); return l.length; },
    async lpush(k, values) { const l = list(k); values.forEach(v => l.unshift(String(v))); return l.length; },
    async lrange(k, a, b) { const l = list(k); const s = norm(a, l.length), e = norm(b, l.length); return l.slice(s, e + 1); },
    async ltrim(k, a, b) { const l = list(k); const s = norm(a, l.length), e = norm(b, l.length); kv.set(k, l.slice(s, e + 1)); return "OK"; },
    async zincrby(k, n, m) { if (!alive(k)) kv.set(k, new Map()); const z = kv.get(k); z.set(m, (z.get(m) || 0) + n); return z.get(m); },
    async ztop(k, n) { if (!alive(k)) return []; return [...kv.get(k)].map(([member, score]) => ({ member, score })).sort((a, b) => b.score - a.score).slice(0, n); },
  };
}

export const store = url && token ? redisStore() : memoryStore();
