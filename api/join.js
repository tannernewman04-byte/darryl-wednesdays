import { createPlayer, cleanName, readBody, send, stateFor } from "../lib/game.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const body = await readBody(req);
  const name = cleanName(body.name);
  if (!name) return send(res, 400, { error: "Pick a name for the leaderboard" });
  const { p, token, invitedBy } = await createPlayer(name, body.ref);
  send(res, 200, { token, invitedBy, state: await stateFor(p) });
}
