import { store } from "../lib/store.js";
import { normEmail, checkCode } from "../lib/email.js";
import { auth, cleanName, createPlayer, getPlayer, readBody, rid, savePlayer, send, stateFor } from "../lib/game.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const body = await readBody(req);
  const email = normEmail(body.email);
  if (!email) return send(res, 400, { error: "Enter a real email address" });
  const existingId = await store.get(`email:${email}`);
  const me = await auth(req);
  const name = cleanName(body.name);
  // a brand-new account needs a name; check before using up the code
  if (!existingId && !(me && !me.email) && !name) return send(res, 400, { error: "Pick a name for the leaderboard" });
  const ok = await checkCode(body.email, body.code);
  if (ok.error) return send(res, ok.status, { error: ok.error });

  if (existingId) { // sign in to the account that owns this email
    const p = await getPlayer(existingId);
    if (!p) return send(res, 500, { error: "Account not found" });
    const token = rid(24);
    await store.set(`tok:${token}`, p.id);
    return send(res, 200, { token, state: await stateFor(p) });
  }
  if (me && !me.email) { // existing player adding an email to their binder
    if (!(await store.set(`email:${email}`, me.id, { nx: true }))) return send(res, 409, { error: "That email is already on another account" });
    me.email = email; await savePlayer(me);
    return send(res, 200, { state: await stateFor(me) });
  }
  const out = await createPlayer(name, body.ref, email);
  if (out.error) return send(res, 409, { error: out.error });
  send(res, 200, { token: out.token, invitedBy: out.invitedBy, state: await stateFor(out.p) });
}
