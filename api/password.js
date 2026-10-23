import { hashPw, pwProblem } from "../lib/password.js";
import { auth, readBody, savePlayer, send, stateFor } from "../lib/game.js";
// A signed-in player creating a password (accounts made before passwords existed).
export default async function handler(req, res) {
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
