import crypto from "node:crypto";
import { store } from "./store.js";

// One account per email. Gmail ignores dots and "+anything", and most providers ignore "+anything",
// so those all count as the same address.
export function normEmail(raw) {
  const e = String(raw || "").trim().toLowerCase();
  if (e.length > 120) return null;
  const m = e.match(/^([^@\s]+)@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m) return null;
  let [, local, domain] = m;
  local = local.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local ? `${local}@${domain}` : null;
}

export const mailReady = () => !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
const hash = (email, code) => crypto.createHash("sha256").update(`${email}:${code}`).digest("hex");
const CODE_TTL = 600, MAX_TRIES = 5;

async function deliver(to, code) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Darryl Wednesdays", email: process.env.MAIL_FROM },
      to: [{ email: to }],
      subject: `${code} is your Darryl Wednesdays code`,
      textContent: `Your Darryl Wednesdays code is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, ignore this email.`,
      htmlContent: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;text-align:center">
        <h2 style="margin:0 0 8px">Darryl Wednesdays</h2><p style="color:#555;margin:0 0 18px">Your sign-in code</p>
        <div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#f4efe7;border-radius:10px;padding:14px">${code}</div>
        <p style="color:#777;font-size:13px;margin-top:18px">It works for 10 minutes. If you didn't ask for it, ignore this email.</p></div>`,
    }),
  });
  if (!r.ok) { console.error("Brevo", r.status, await r.text().catch(() => "")); throw new Error("send failed"); }
}

export async function issueCode(rawEmail, ip) {
  const email = normEmail(rawEmail);
  if (!email) return { status: 400, error: "Enter a real email address" };
  if (!mailReady() && store.kind !== "memory") return { status: 503, error: "Email sign-up isn't set up yet. Ask Tanner to finish the Brevo step." };
  const ipKey = `otpip:${ip || "unknown"}`;
  const n = await store.incr(ipKey);
  if (n === 1) await store.expire(ipKey, 3600);
  if (n > 15) return { status: 429, error: "Too many codes from this network. Try again in an hour." };
  if (!(await store.set(`otpwait:${email}`, "1", { nx: true, ex: 45 }))) return { status: 429, error: "A code was just sent. Wait a minute before asking for another." };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await store.set(`otp:${email}`, JSON.stringify({ h: hash(email, code), tries: 0 }), { ex: CODE_TTL });
  const exists = !!(await store.get(`email:${email}`));
  if (!mailReady()) return { exists, devCode: code }; // local preview only, never in production
  try { await deliver(String(rawEmail).trim(), code); }
  catch {
    await store.del(`otp:${email}`); await store.del(`otpwait:${email}`);
    return { status: 502, error: "Couldn't send the email. Check the address and try again." };
  }
  return { exists };
}

export async function checkCode(rawEmail, code) {
  const email = normEmail(rawEmail);
  if (!email) return { status: 400, error: "Enter a real email address" };
  const raw = await store.get(`otp:${email}`);
  const o = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
  if (!o) return { status: 400, error: "That code expired. Tap Resend code." };
  const given = hash(email, String(code || "").replace(/\D/g, ""));
  if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(o.h))) {
    o.tries++;
    if (o.tries >= MAX_TRIES) { await store.del(`otp:${email}`); return { status: 400, error: "Too many wrong tries. Tap Resend code for a new one." }; }
    await store.set(`otp:${email}`, JSON.stringify(o), { ex: CODE_TTL });
    return { status: 400, error: `Wrong code. ${MAX_TRIES - o.tries} tries left.` };
  }
  await store.del(`otp:${email}`);
  return { email };
}
