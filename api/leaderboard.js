import { store } from "../lib/store.js";
import { send, auth } from "../lib/game.js";
export default async function handler(req, res) {
  const me = await auth(req);
  const top = await store.ztop("board", 50);
  const recs = await store.mget(top.map(t => `player:${t.member}`));
  const rows = top.map((t, i) => {
    let p = recs[i]; try { p = typeof p === "string" ? JSON.parse(p) : p; } catch { p = null; }
    return p ? { name: p.name, score: t.score, cards: p.cards || 0, packs: p.opened || 0, you: !!me && me.id === p.id } : null;
  }).filter(Boolean);
  send(res, 200, { rows });
}
