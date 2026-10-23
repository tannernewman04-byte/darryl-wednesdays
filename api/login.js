import { store } from "../lib/store.js";
import { normEmail } from "../lib/email.js";
import { checkPw } from "../lib/password.js";
import { getPlayer, readBody, rid, send, stateFor } from "../lib/game.js";
const MAX_FAILS = 8, LOCK_SECS = 900;
export default async function handler(req, res) {
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
