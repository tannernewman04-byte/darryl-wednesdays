import { store } from "../lib/store.js";
import { send } from "../lib/game.js";
export default async function handler(req, res) { send(res, 200, { ok: true, db: store.kind }); }
