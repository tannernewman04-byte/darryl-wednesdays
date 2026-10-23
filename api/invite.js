import { store } from "../lib/store.js";
import { getPlayer, send } from "../lib/game.js";
export default async function handler(req, res) {
  const code = String(new URL(req.url, "http://x").searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const id = code ? await store.get(`code:${code}`) : null;
  const p = id && id !== "pending" ? await getPlayer(id) : null;
  send(res, 200, { name: p ? p.name : null });
}
