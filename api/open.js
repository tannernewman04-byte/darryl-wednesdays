import { auth, openPack, readBody, send, stateFor } from "../lib/game.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const p = await auth(req);
  if (!p) return send(res, 401, { error: "Not signed in" });
  const body = await readBody(req);
  const out = await openPack(p, body.kind === "hobby" ? "hobby" : "daily");
  if (out.error) return send(res, out.status, { error: out.error, state: await stateFor(p) });
  send(res, 200, { pulls: out.pulls, reward: out.reward, state: await stateFor(p) });
}
