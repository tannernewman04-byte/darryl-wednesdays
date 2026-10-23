// Every /api/* route lives in this one serverless function (Vercel's free plan allows 12 functions).
import { PACK_CODES } from "../lib/cards.js";
import { checkCode, issueCode, normEmail } from "../lib/email.js";
import { auth, cleanName, createPlayer, getPlayer, openPack, readBody, rid, savePlayer, send, stateFor } from "../lib/game.js";
import { checkPw, hashPw, pwProblem } from "../lib/password.js";
import { store } from "../lib/store.js";

// ---- /api/code ----
async function route_code(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const body = await readBody(req);
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  const out = await issueCode(body.email, ip);
  if (out.error) return send(res, out.status, { error: out.error });
  send(res, 200, out);
}

// ---- /api/feed ----
async function route_feed(req, res) {
  const raw = await store.lrange("feed", 0, 59);
  const items = raw.map(v => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; } }).filter(Boolean);
  send(res, 200, { items });
}

// ---- /api/health ----
async function route_health(req, res) { send(res, 200, { ok: true, db: store.kind }); }

// ---- /api/invite ----
async function route_invite(req, res) {
  const code = String(new URL(req.url, "http://x").searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const id = code ? await store.get(`code:${code}`) : null;
  const p = id && id !== "pending" ? await getPlayer(id) : null;
  send(res, 200, { name: p ? p.name : null });
}

// ---- /api/join ----
// Sign-up now goes through /api/code and /api/verify (email required).
async function route_join(req, res) {
  send(res, 410, { error: "Reload the page to sign up with your email" });
}

// ---- /api/leaderboard ----
async function route_leaderboard(req, res) {
  const me = await auth(req);
  const top = await store.ztop("board", 50);
  const recs = await store.mget(top.map(t => `player:${t.member}`));
  const rows = top.map((t, i) => {
    let p = recs[i]; try { p = typeof p === "string" ? JSON.parse(p) : p; } catch { p = null; }
    return p ? { name: p.name, score: t.score, cards: p.cards || 0, packs: p.opened || 0, you: !!me && me.id === p.id } : null;
  }).filter(Boolean);
  send(res, 200, { rows });
}

// ---- /api/login ----
const MAX_FAILS = 8, LOCK_SECS = 900;
async function route_login(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const body = await readBody(req);
  const email = normEmail(body.email);
  if (!email) return send(res, 400, { error: "Enter a real email address" });
  const failKey = `loginfail:${email}`;
  if ((Number(await store.get(failKey)) || 0) >= MAX_FAILS)
    return send(res, 429, { error: "Too many wrong passwords. Wait 15 minutes or tap Forgot password." });
  const id = await store.get(`email:${email}`);
  const p = id ? await getPlayer(id) : null;
  if (!p || !p.pw || !checkPw(body.password, p.pw)) {
    const n = await store.incr(failKey);
    if (n === 1) await store.expire(failKey, LOCK_SECS);
    return send(res, 401, { error: "Wrong email or password" });
  }
  await store.del(failKey);
  const token = rid(24);
  await store.set(`tok:${token}`, p.id);
  send(res, 200, { token, state: await stateFor(p) });
}

// ---- /api/lookup ----
// Tells the sign-in screen whether to ask for a password or send a code.
async function route_lookup(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const body = await readBody(req);
  const email = normEmail(body.email);
  if (!email) return send(res, 400, { error: "Enter a real email address" });
  const id = await store.get(`email:${email}`);
  const p = id ? await getPlayer(id) : null;
  send(res, 200, { exists: !!p, hasPassword: !!(p && p.pw) });
}

// ---- /api/me ----
async function route_me(req, res) {
  const p = await auth(req);
  if (!p) return send(res, 401, { error: "Not signed in" });
  send(res, 200, { state: await stateFor(p) });
}

// ---- /api/open ----
async function route_open(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const p = await auth(req);
  if (!p) return send(res, 401, { error: "Not signed in" });
  const body = await readBody(req);
  const out = await openPack(p, ["hobby", "darryl"].includes(body.kind) ? body.kind : "daily");
  if (out.error) return send(res, out.status, { error: out.error, state: await stateFor(p) });
  send(res, 200, { pulls: out.pulls, reward: out.reward, state: await stateFor(p) });
}

// ---- /api/password ----
// A signed-in player creating a password (accounts made before passwords existed).
async function route_password(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const p = await auth(req);
  if (!p) return send(res, 401, { error: "Not signed in" });
  if (!p.email) return send(res, 400, { error: "Confirm your email first" });
  if (p.pw) return send(res, 400, { error: "You already have a password. Use Forgot password to change it." });
  const body = await readBody(req);
  const bad = pwProblem(body.password);
  if (bad) return send(res, 400, { error: bad });
  p.pw = hashPw(body.password); await savePlayer(p);
  send(res, 200, { state: await stateFor(p) });
}

// ---- /api/redeem ----
// Redeem a pack code (each code works once per account).
async function route_redeem(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const p = await auth(req);
  if (!p) return send(res, 401, { error: "Not signed in" });
  if (!p.email) return send(res, 403, { error: "Confirm your email first" });
  const body = await readBody(req);
  const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code) return send(res, 400, { error: "Enter a pack code" });
  const failKey = `redeemfail:${p.id}`;
  if ((Number(await store.get(failKey)) || 0) >= 15) return send(res, 429, { error: "Too many wrong codes. Try again in an hour." });
  const def = PACK_CODES[code];
  if (!def) {
    if ((await store.incr(failKey)) === 1) await store.expire(failKey, 3600);
    return send(res, 404, { error: "That code doesn't exist" });
  }
  const uses = def.uses || 1, usedKey = `redeemed:${code}:${p.id}`;
  const n = await store.incr(usedKey);
  if (n > uses) { await store.decr(usedKey); return send(res, 409, { error: uses === 1 ? "You already used this code" : `You've already used this code ${uses} times` }); }
  for (let i = 0; i < (def.hobby || 0); i++) await store.incr(`hobby:${p.id}`);
  for (let i = 0; i < (def.packs || 0); i++) await store.incr(`bonus:${p.id}`);
  for (let i = 0; i < (def.darryl || 0); i++) await store.incr(`dpack:${p.id}`);
  const left = uses - n;
  send(res, 200, { message: `${code} redeemed: you got ${def.label}` + (left > 0 ? ` (${left} more use${left === 1 ? "" : "s"} left)` : ""), state: await stateFor(p) });
}

// ---- /api/verify ----
async function route_verify(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const body = await readBody(req);
  const email = normEmail(body.email);
  if (!email) return send(res, 400, { error: "Enter a real email address" });
  const existingId = await store.get(`email:${email}`);
  const me = await auth(req);
  const name = cleanName(body.name);
  // every code sign-in sets a password (new account, older account, or forgot password)
  const bad = pwProblem(body.password);
  if (bad) return send(res, 400, { error: bad });
  // a brand-new account needs a name; check before using up the code
  if (!existingId && !(me && !me.email) && !name) return send(res, 400, { error: "Pick a name for the leaderboard" });
  const ok = await checkCode(body.email, body.code);
  if (ok.error) return send(res, ok.status, { error: ok.error });

  if (existingId) { // sign in to the account that owns this email
    const p = await getPlayer(existingId);
    if (!p) return send(res, 500, { error: "Account not found" });
    p.pw = hashPw(body.password); await savePlayer(p);
    await store.del(`loginfail:${email}`);
    const token = rid(24);
    await store.set(`tok:${token}`, p.id);
    return send(res, 200, { token, state: await stateFor(p) });
  }
  if (me && !me.email) { // existing player adding an email to their binder
    if (!(await store.set(`email:${email}`, me.id, { nx: true }))) return send(res, 409, { error: "That email is already on another account" });
    me.email = email; me.pw = hashPw(body.password); await savePlayer(me);
    return send(res, 200, { state: await stateFor(me) });
  }
  const out = await createPlayer(name, body.ref, email, hashPw(body.password));
  if (out.error) return send(res, 409, { error: out.error });
  send(res, 200, { token: out.token, invitedBy: out.invitedBy, state: await stateFor(out.p) });
}

const routes = { code: route_code, feed: route_feed, health: route_health, invite: route_invite, join: route_join, leaderboard: route_leaderboard, login: route_login, lookup: route_lookup, me: route_me, open: route_open, password: route_password, redeem: route_redeem, verify: route_verify };
export default async function handler(req, res) {
  const u = new URL(req.url, "http://x");
  const name = (req.query && req.query.route) || u.searchParams.get("route") || u.pathname.split("/").pop();
  const h = routes[name];
  if (!h) { res.statusCode = 404; res.setHeader("content-type", "application/json"); return res.end('{"error":"Not found"}'); }
  return h(req, res);
}
