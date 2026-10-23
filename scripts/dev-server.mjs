// Local preview: node scripts/dev-server.mjs  → http://localhost:3000
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json" };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    const file = path.join(root, "api", u.pathname.slice(5).replace(/[^a-z-]/g, "") + ".js");
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end("{}"); }
    let data = ""; for await (const ch of req) data += ch;
    req.body = data ? (() => { try { return JSON.parse(data); } catch { return {}; } })() : {};
    try { (await import(pathToFileURL(file).href)).default(req, res); }
    catch (e) { console.error(e); res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
    return;
  }
  let f = path.join(root, u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, "index.html");
  res.setHeader("content-type", types[path.extname(f)] || "application/octet-stream");
  fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log("http://localhost:" + (process.env.PORT || 3000)));
