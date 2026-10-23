import { store } from "../lib/store.js";
import { normEmail } from "../lib/email.js";
import { getPlayer, readBody, send } from "../lib/game.js";
// Tells the sign-in screen whether to ask for a password or send a code.
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const body = await readBody(req);
  const email = normEmail(body.email);
  if (!email) return send(res, 400, { error: "Enter a real email address" });
  const id = await store.get(`email:${email}`);
  const p = id ? await getPlayer(id) : null;
  send(res, 200, { exists: !!p, hasPassword: !!(p && p.pw) });
}
