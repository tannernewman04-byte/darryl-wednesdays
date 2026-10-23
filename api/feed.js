import { store } from "../lib/store.js";
import { send } from "../lib/game.js";
export default async function handler(req, res) {
  const raw = await store.lrange("feed", 0, 59);
  const items = raw.map(v => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; } }).filter(Boolean);
  send(res, 200, { items });
}
