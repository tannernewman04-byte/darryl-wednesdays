import { store } from "./store.js";
import { clock } from "./game.js";
import { normEmail } from "./email.js";

// "Darryl Sighting" cards: player-uploaded photos that join the card pool with every parallel
// once the site owner approves them.

// The owner is the account using ADMIN_EMAIL (or the MAIL_FROM sender address if that isn't set).
export function isAdmin(p) {
  const owner = normEmail(process.env.ADMIN_EMAIL || process.env.MAIL_FROM || "");
  return !!(p && p.email && owner && p.email === owner);
}
export const SIGHTING_START = 100;      // sighting cards are numbered #101, #102, ...
export const SIGHTINGS_PER_DAY = 5;     // per player, so packs can't be farmed
const MAX_IMAGE_CHARS = 450000;         // ~330 KB JPEG after the browser shrinks it

export async function sightingNumbers() {
  return (await store.lrange("sightings", 0, -1)).map(Number).filter(Boolean);
}

export async function listSightings() {
  const nums = await sightingNumbers();
  if (!nums.length) return [];
  const recs = await store.mget(nums.map(n => `sighting:${n}`));
  return recs.map(r => { try { return typeof r === "string" ? JSON.parse(r) : r; } catch { return null; } }).filter(Boolean);
}

export async function addSighting(p, body) {
  const image = String(body.image || "");
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)) return { status: 400, error: "Add a photo first" };
  if (image.length > MAX_IMAGE_CHARS) return { status: 413, error: "That photo is too big. Try another one." };
  const lat = Number(body.lat), lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return { status: 400, error: "Turn on location so the card can show where Darryl was spotted" };
  const place = String(body.place || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60)
    || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  const c = clock();
  const dayKey = `spotday:${p.id}:${c.day}`;
  const n = await store.incr(dayKey);
  if (n === 1) await store.expire(dayKey, 2 * 86400);
  if (n > SIGHTINGS_PER_DAY) { await store.decr(dayKey); return { status: 429, error: `You can add ${SIGHTINGS_PER_DAY} sightings a day. Try again tomorrow.` }; }
  const num = SIGHTING_START + (await store.incr("sightseq"));
  const rec = { n: num, by: p.name, byId: p.id, place, lat: +lat.toFixed(6), lon: +lon.toFixed(6), at: Date.now(), status: "pending" };
  await store.set(`sightimg:${num}`, image.slice(image.indexOf(",") + 1));
  await store.set(`sighting:${num}`, JSON.stringify(rec));
  await store.rpush("sightpending", [String(num)]); // waits for the owner's approval
  await store.incr(`spotwait:${p.id}`);
  return { card: rec };
}

// Only approved sightings are served publicly.
export async function photoBytes(num) {
  const rec = await getSighting(num);
  if (!rec || rec.status === "pending") return null;
  const b64 = await store.get(`sightimg:${Number(num)}`);
  return b64 ? Buffer.from(b64, "base64") : null;
}

async function getSighting(num) {
  const r = await store.get(`sighting:${Number(num)}`);
  try { return typeof r === "string" ? JSON.parse(r) : r; } catch { return null; }
}

export async function pendingCount() { return (await store.lrange("sightpending", 0, -1)).length; }

// The owner's review list, with the photos inline.
export async function listPending() {
  const nums = (await store.lrange("sightpending", 0, -1)).map(Number);
  const out = [];
  for (const n of nums) {
    const rec = await getSighting(n), b64 = await store.get(`sightimg:${n}`);
    if (rec && b64) out.push({ ...rec, image: "data:image/jpeg;base64," + b64 });
  }
  return out;
}

export async function reviewSighting(num, approve) {
  const rec = await getSighting(num);
  if (!rec || rec.status !== "pending") return { status: 404, error: "That sighting was already reviewed" };
  if (!(await store.lrem("sightpending", num))) return { status: 404, error: "That sighting was already reviewed" };
  await store.decr(`spotwait:${rec.byId}`);
  if (!approve) {
    await store.del(`sightimg:${num}`); await store.del(`sighting:${num}`);
    return { rejected: num };
  }
  rec.status = "approved"; rec.approvedAt = Date.now();
  await store.set(`sighting:${num}`, JSON.stringify(rec));
  await store.rpush("sightings", [String(num)]);
  await store.incr(`bonus:${rec.byId}`); // reward: one free pack (5 cards)
  return { approved: num };
}
