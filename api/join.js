import { send } from "../lib/game.js";
// Sign-up now goes through /api/code and /api/verify (email required).
export default async function handler(req, res) {
  send(res, 410, { error: "Reload the page to sign up with your email" });
}
