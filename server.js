// Local dev server: static files from public/, security headers on every
// response, and /api/chat routed to the chat handler.
import http from "node:http";
import path from "node:path";
import { constants as fsConstants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import defaultChatHandler from "./api/chat.js";

const PUBLIC_DIR = path.resolve(fileURLToPath(new URL("./public", import.meta.url)));

const SECURITY_HEADERS = [
  ["Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
    "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "no-referrer"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Cross-Origin-Resource-Policy", "same-origin"],
];

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// Generic bodies only: never paths, stack traces or error messages.
function sendText(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

const notFound = (res) => sendText(res, 404, "Not found");
const badRequest = (res) => sendText(res, 400, "Bad request");

const isInside = (child, root) => child.startsWith(root + path.sep);

async function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendText(res, 405, "Method not allowed", { Allow: "GET, HEAD" });
  }

  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return badRequest(res); }
  if (decoded.includes("\0") || decoded.includes("\\")) return badRequest(res);
  if (decoded === "/") decoded = "/index.html";
  if (decoded.endsWith("/")) return notFound(res); // "/index.html/" would break relative links

  // Decoding can reintroduce "..", so dot segments are refused after decoding.
  // This also keeps dotfiles such as .env unreachable.
  if (decoded.split("/").some((segment) => segment.startsWith("."))) return notFound(res);

  const type = CONTENT_TYPES[path.extname(decoded).toLowerCase()];
  if (!type) return notFound(res);

  const resolved = path.resolve(PUBLIC_DIR, "." + decoded);
  if (!isInside(resolved, PUBLIC_DIR)) return notFound(res);

  try {
    // Compare real paths too, so a symlink inside public/ can't point outside it.
    const [realRoot, realFile] = await Promise.all([realpath(PUBLIC_DIR), realpath(resolved)]);
    if (!isInside(realFile, realRoot)) return notFound(res);

    // Open once and stat/read through the same handle, so the file that was
    // checked is the file that is served (no check-then-use race, CWE-367).
    // O_NOFOLLOW refuses a symlink swapped in after the realpath check.
    const handle = await open(realFile, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    let info, body;
    try {
      info = await handle.stat();
      if (!info.isFile()) return notFound(res);
      body = req.method === "HEAD" ? null : await handle.readFile();
    } finally {
      await handle.close();
    }

    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": body ? body.length : info.size,
      "Cache-Control": "no-cache",
    });
    res.end(body ?? undefined);
  } catch (err) {
    // ELOOP: O_NOFOLLOW hit a symlink. EISDIR: a directory slipped past the checks.
    if (["ENOENT", "ENOTDIR", "ENAMETOOLONG", "ELOOP", "EISDIR"].includes(err?.code)) return notFound(res);
    console.error("static: error", err?.code ?? "unknown");
    if (!res.headersSent) sendText(res, 500, "Internal error");
  }
}

async function handle(req, res, chatHandler) {
  // Set before any hand-off so the chat handler's writeHead merges with these.
  for (const [name, value] of SECURITY_HEADERS) res.setHeader(name, value);

  let pathname;
  try { pathname = new URL(req.url ?? "/", "http://localhost").pathname; } catch { return badRequest(res); }

  if (pathname === "/api/chat") {
    // This local server is the edge, so any client-supplied X-Forwarded-For is
    // discarded and replaced with the real socket address. That is what makes
    // the chat rate limit apply per real client instead of per spoofed header.
    req.headers["x-forwarded-for"] = req.socket.remoteAddress ?? "";
    return await chatHandler(req, res);
  }
  return serveStatic(req, res, pathname);
}

export function createServer({ chatHandler = defaultChatHandler } = {}) {
  return http.createServer(
    {
      maxHeaderSize: 8192,
      // requestTimeout bounds receiving the request (e.g. slow uploads), not
      // the time spent streaming the chat response back to the client.
      requestTimeout: 10_000,
      headersTimeout: 5_000,
      keepAliveTimeout: 5_000,
      // Node only checks the two timeouts above on this interval (default 30 s).
      connectionsCheckingInterval: 1_000,
    },
    (req, res) => {
      // Any unexpected error becomes a generic 500 and never crashes the process.
      handle(req, res, chatHandler).catch((err) => {
        console.error("server: error", err?.code ?? "unknown");
        try {
          if (!res.headersSent) sendText(res, 500, "Internal error");
          else if (!res.writableEnded) res.destroy();
        } catch { /* nothing more to do */ }
      });
    },
  );
}

if (import.meta.main) {
  // Load .env before anything reads the environment. Values are never logged.
  try { process.loadEnvFile(new URL("./.env", import.meta.url)); } catch (e) { if (e.code !== "ENOENT") throw e; }

  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.on("error", (err) => {
    console.error("server: listen error", err?.code ?? "unknown");
    process.exitCode = 1;
  });
  // Hard-coded loopback: this is a local dev server and must not be exposed to the network.
  server.listen(port, "127.0.0.1", () => {
    // Print localhost, not 127.0.0.1: the chat's Origin allowlist defaults to http://localhost:<port>.
    console.log(`Resume site running at http://localhost:${port}`);
  });
}
