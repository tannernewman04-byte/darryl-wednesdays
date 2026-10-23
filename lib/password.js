import crypto from "node:crypto";

// Passwords are stored only as salted scrypt hashes, never as plain text.
export function pwProblem(pw) {
  const s = String(pw || "");
  if (s.length < 8) return "Use at least 8 characters for your password";
  if (s.length > 100) return "That password is too long";
  return null;
}

export function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pw), salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function checkPw(pw, stored) {
  const [kind, salt, hash] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const got = crypto.scryptSync(String(pw || ""), salt, 32);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
