import crypto from "node:crypto";
import { store } from "./store.js";
import {
  POOL, GOLD_CARD, PER_PACK, PARS, PAR, RANK, FREE_EVERY_HOURS, FREE_PER_WINDOW, FREE_PER_WINDOW_WEDNESDAY,
  REFERRALS_PER_PACK, STREAK_DAYS_PER_PACK, TIMEZONE, HOBBY_SIZE, DARRYL_SIZE,
} from "./cards.js";

export function clock() {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  const h = Number(p.hour) % 24, m = Number(p.minute), s = Number(p.second);
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  const y = new Date(Date.UTC(+p.year, +p.month - 1, +p.day - 1)).toISOString().slice(0, 10);
  const H = FREE_EVERY_HOURS;
  const win = `${day}#${Math.floor(h / H)}`; // which 3-hour window we're in
  return { day, win, yesterday: y, dow, wed: dow === 3, secsLeft: H * 3600 - ((h % H) * 3600 + m * 60 + s) };
}
export const allowanceFor = c => (c.wed ? FREE_PER_WINDOW_WEDNESDAY : FREE_PER_WINDOW);

export const rid = (n = 16) => crypto.randomBytes(n).toString("hex");
const parse = v => { if (v == null) return null; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return null; } };

export async function getPlayer(id) { return parse(await store.get(`player:${id}`)); }
export async function savePlayer(p) { await store.set(`player:${p.id}`, JSON.stringify(p)); }

export function send(res, status, body) { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); }

export async function auth(req) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!/^[a-f0-9]{48}$/.test(t)) return null;
  const id = await store.get(`tok:${t}`);
  return id ? getPlayer(id) : null;
}

export function cleanName(n) {
  return String(n || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
}

async function newCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 20; i++) {
    let c = ""; for (const b of crypto.randomBytes(6)) c += A[b % A.length];
    if (await store.set(`code:${c}`, "pending", { nx: true })) return c;
  }
  throw new Error("Could not make a referral code");
}

export async function createPlayer(name, ref, email, pw = null) {
  const id = rid(8), token = rid(24);
  if (!email || !(await store.set(`email:${email}`, id, { nx: true }))) return { error: "That email already has an account" };
  const code = await newCode();
  const c = clock();
  const p = { id, name, email, pw, code, created: Date.now(), win: c.win, used: 0, streak: 0, lastOpen: "", opened: 0, score: 0, cards: 0, refBy: null };
  let invitedBy = null;
  const refCode = String(ref || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (refCode) {
    const refId = await store.get(`code:${refCode}`);
    if (refId && refId !== "pending") {
      const inviter = await getPlayer(refId);
      if (inviter) {
        p.refBy = refId; invitedBy = inviter.name;
        await store.incr(`bonus:${id}`); // the new friend's welcome pack
        const n = await store.incr(`refs:${refId}`);
        if (n % REFERRALS_PER_PACK === 0) await store.incr(`hobby:${refId}`); // every 3 friends: a 15-card Hobby pack
      }
    }
  }
  await store.set(`code:${code}`, id);
  await store.set(`tok:${token}`, id);
  await savePlayer(p);
  return { p, token, invitedBy };
}

export async function stateFor(p) {
  const c = clock();
  if (p.win !== c.win) { p.win = c.win; p.used = 0; await savePlayer(p); }
  const allowance = allowanceFor(c);
  const [bonusRaw, refsRaw, invRaw, goldOwner, hobbyRaw, darrylRaw] = await Promise.all([
    store.get(`bonus:${p.id}`), store.get(`refs:${p.id}`), store.lrange(`inv:${p.id}`, 0, -1), store.get("gold:claim"), store.get(`hobby:${p.id}`), store.get(`dpack:${p.id}`),
  ]);
  const bonus = Math.max(0, Number(bonusRaw) || 0);
  let goldBy = null;
  if (goldOwner) goldBy = goldOwner === p.id ? "you" : (await getPlayer(goldOwner))?.name || "someone";
  return {
    name: p.name, code: p.code, score: p.score, opened: p.opened, email: p.email || null, needsEmail: !p.email, hasPassword: !!p.pw,
    streak: (p.lastOpen === c.day || p.lastOpen === c.yesterday) ? p.streak : 0,
    openedToday: p.lastOpen === c.day,
    allowance, used: p.used, bonus, packsLeft: Math.max(0, allowance - p.used) + bonus,
    hobby: Math.max(0, Number(hobbyRaw) || 0), hobbySize: HOBBY_SIZE, darryl: Math.max(0, Number(darrylRaw) || 0), darrylSize: DARRYL_SIZE, everyHours: FREE_EVERY_HOURS,
    wed: c.wed, secsLeft: c.secsLeft,
    refs: Number(refsRaw) || 0, refsPerPack: REFERRALS_PER_PACK, streakPerPack: STREAK_DAYS_PER_PACK,
    inv: invRaw.map(parse).filter(Boolean), goldBy,
  };
}

async function claimSerial(card, par) {
  const key = `pool:${card}:${par}`;
  if (await store.set(`poolinit:${card}:${par}`, "1", { nx: true })) {
    await store.sadd(key, Array.from({ length: PAR[par].print }, (_, i) => String(i + 1)));
  }
  const v = await store.spop(key);
  return v ? Number(v) : null;
}

async function rollOne(p) {
  const r = Math.random(); let par = "base", acc = 0;
  for (const x of PARS) { if (!x.p) continue; acc += x.p; if (r < acc) { par = x.k; break; } }
  let card = POOL[Math.floor(Math.random() * POOL.length)];
  if (par === "gold") {
    if (await store.set("gold:claim", p.id, { nx: true })) return { card: GOLD_CARD, par: "gold", serial: 1 };
    par = "red";
  }
  let serial = null;
  if (par !== "base") { serial = await claimSerial(card, par); if (!serial) par = "base"; }
  return { card, par, serial };
}

export async function openPack(p, kind = "daily") {
  if (!p.email) return { error: "Confirm your email to keep opening packs", status: 403 };
  if (!(await store.set(`lock:${p.id}`, "1", { nx: true, ex: 30 }))) return { error: "Already opening a pack", status: 429 };
  try {
    const c = clock();
    if (p.win !== c.win) { p.win = c.win; p.used = 0; }
    const allowance = allowanceFor(c);
    const special = kind === "hobby" ? { key: `hobby:${p.id}`, size: HOBBY_SIZE, label: "Hobby" }
      : kind === "darryl" ? { key: `dpack:${p.id}`, size: DARRYL_SIZE, label: "Darryl" } : null;
    if (special) {
      const h = await store.decr(special.key);
      if (h < 0) { await store.incr(special.key); return { error: `No ${special.label} packs to open`, status: 403 }; }
    } else if (p.used < allowance) p.used++;
    else {
      const b = await store.decr(`bonus:${p.id}`);
      if (b < 0) { await store.incr(`bonus:${p.id}`); return { error: "No packs left right now", status: 403 }; }
    }
    const pulls = [];
    for (let i = 0; i < (special ? special.size : PER_PACK); i++) {
      const x = await rollOne(p);
      pulls.push({ id: rid(6), ...x, at: Date.now() });
    }
    pulls.sort((a, b) => RANK[a.par] - RANK[b.par]); // best card revealed last
    await store.rpush(`inv:${p.id}`, pulls.map(x => JSON.stringify(x)));
    const pts = pulls.reduce((s, x) => s + PAR[x.par].pts, 0);
    p.score += pts; p.cards += pulls.length; p.opened++;
    await store.zincrby("board", pts, p.id);
    const hits = pulls.filter(x => x.par !== "base");
    if (hits.length) {
      await store.lpush("feed", hits.map(x => JSON.stringify({ name: p.name, card: x.card, par: x.par, serial: x.serial, at: x.at })));
      await store.ltrim("feed", 0, 79);
    }
    let reward = false;
    if (p.lastOpen !== c.day) {
      p.streak = p.lastOpen === c.yesterday ? p.streak + 1 : 1;
      p.lastOpen = c.day;
      if (p.streak % STREAK_DAYS_PER_PACK === 0) { await store.incr(`bonus:${p.id}`); reward = true; }
    }
    await savePlayer(p);
    return { pulls, reward };
  } finally {
    await store.del(`lock:${p.id}`);
  }
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  return {};
}
