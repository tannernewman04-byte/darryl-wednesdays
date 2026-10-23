import { auth, send, stateFor } from "../lib/game.js";
export default async function handler(req, res) {
  const p = await auth(req);
  if (!p) return send(res, 401, { error: "Not signed in" });
  send(res, 200, { state: await stateFor(p) });
}
