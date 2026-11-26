// Acceptance contract for server.js (local dev server). Operator-owned.
// Phase 2 adds an equivalent check for the CloudFront response headers policy in Terraform.
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

async function withServer(fn) {
  const { createServer } = await import("../server.js");
  const server = createServer({
    chatHandler: (req, res) => { res.writeHead(200, { "content-type": "text/plain" }); res.end("chat-stub"); },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try { await fn(`http://127.0.0.1:${port}`, port); } finally { server.close(); }
}

// fetch() normalises "../" away, so send raw request lines for traversal cases.
function rawGet(port, path) {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, "127.0.0.1", () => s.write(`GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
    let data = ""; s.on("data", (d) => (data += d)); s.on("end", () => resolve(data)); s.on("error", reject);
  });
}

function assertSecurityHeaders(h) {
  const csp = h.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/, "script-src must be exactly 'self'");
  assert.equal(h.get("x-content-type-options"), "nosniff");
  assert.equal(h.get("x-frame-options"), "DENY");
  assert.ok(h.get("referrer-policy"));
  assert.ok(h.get("permissions-policy"));
}

test("serves index with strict security headers", async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /^text\/html/);
    assertSecurityHeaders(r.headers);
  });
});

test("serves css and js with correct types", async () => {
  await withServer(async (base) => {
    assert.match((await fetch(`${base}/styles.css`)).headers.get("content-type"), /^text\/css/);
    assert.match((await fetch(`${base}/app.js`)).headers.get("content-type"), /javascript/);
  });
});

test("never serves files outside public/", async () => {
  await withServer(async (base, port) => {
    for (const p of ["/../package.json", "/%2e%2e/package.json", "/..%2fpackage.json", "/%2e%2e%2fknowledge%2fprofile.md", "/.env", "/../.env", "/api/../server.js"]) {
      const raw = await rawGet(port, p);
      assert.match(raw, /^HTTP\/1\.1 (400|403|404)/, `${p} must be refused`);
      assert.ok(!raw.includes('"dependencies"') && !raw.includes("OPERATOR-OWNED"), `${p} leaked a file`);
    }
    assert.equal((await fetch(`${base}/does-not-exist.html`)).status, 404);
  });
});

test("routes /api/chat to the chat handler", async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/api/chat`, { method: "POST", body: "{}" });
    assert.equal(await r.text(), "chat-stub");
  });
});
