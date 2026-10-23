import { store } from "../lib/store.js";
import { PACK_CODES } from "../lib/cards.js";
import { auth, readBody, send, stateFor } from "../lib/game.js";
// Redeem a pack code (each code works once per account).
export default async function handler(req, res) {
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
  if (!(await store.set(`redeemed:${code}:${p.id}`, "1", { nx: true }))) return send(res, 409, { error: "You already used this code" });
  for (let i = 0; i < (def.hobby || 0); i++) await store.incr(`hobby:${p.id}`);
  for (let i = 0; i < (def.packs || 0); i++) await store.incr(`bonus:${p.id}`);
  send(res, 200, { message: `${code} redeemed: you got ${def.label}`, state: await stateFor(p) });
}
