import { issueCode } from "../lib/email.js";
import { readBody, send } from "../lib/game.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  const body = await readBody(req);
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  const out = await issueCode(body.email, ip);
  if (out.error) return send(res, out.status, { error: out.error });
  send(res, 200, out);
}
