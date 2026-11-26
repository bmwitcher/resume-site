// Acceptance contract for public/ (content, accessibility, XSS/CSP hygiene). Operator-owned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const read = (p) => readFile(new URL(`../public/${p}`, import.meta.url), "utf8");

// Source of truth: Bryant's resume, as captured in knowledge/profile.md.
test("index.html shows every role, employer, school and certification from the resume", async () => {
  const html = await read("index.html");
  for (const s of [
    "Cloud Security Engineer", "USAA", "Cloud Threat Response",
    "DevOps Engineer", "ThreatConnect",
    "Director of Cloud Operations", "Level Up In Tech",
    "Law Enforcement", "Henrico",
    "Western Governors University", "South College", "Virginia Commonwealth University",
    "Certified Kubernetes Administrator", "AWS Certified Security",
    "Wiz CNAPP", "92%", "Terraform", "OpenShift", "Splunk SOAR",
    "Cloud Security Operations Center",
  ]) assert.ok(html.includes(s), `missing: ${s}`);
});

test("index.html contains no contact details that were deliberately kept private", async () => {
  const html = await read("index.html");
  assert.doesNotMatch(html, /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, "no phone number");
  assert.doesNotMatch(html, /@gmail\.com/i, "no personal email");
  assert.doesNotMatch(html, /relocat/i, "no relocation claim");
});

test("index.html is accessible and responsive at the document level", async () => {
  const html = await read("index.html");
  assert.match(html, /<html[^>]*\slang="en"/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(html, /<main[\s>]/);
  assert.match(html, /aria-live="polite"/, "chat log announces replies");
  assert.match(html, /<label[^>]*for="chat-input"/, "chat input has a visible label");
  assert.match(html, /<textarea[^>]*id="chat-input"[^>]*maxlength="1000"/);
  assert.match(html, /class="skip-link"/);
});

test("no inline or third-party scripts and no inline event handlers (CSP-safe)", async () => {
  const html = await read("index.html");
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    assert.match(tag, /\ssrc="\/?[\w./-]+\.js"/, `script must be a local file: ${tag}`);
  }
  assert.doesNotMatch(html, /<script\b[^>]*>\s*[^<\s]/i, "no inline script bodies");
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, "no inline event handlers");
  assert.doesNotMatch(html, /\sstyle\s*=/i, "no inline styles");
});

test("app.js never turns text into HTML or code", async () => {
  const js = await read("app.js");
  for (const bad of [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\s*\(/, /setTimeout\(\s*["'`]/]) {
    assert.doesNotMatch(js, bad, `forbidden: ${bad}`);
  }
  assert.match(js, /textContent/);
  assert.match(js, /fetch\(\s*["'`]\/api\/chat["'`]/, "calls only the same-origin API");
});

test("styles respect reduced motion and visible focus", async () => {
  const css = await read("styles.css");
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
});

test("nothing secret ships to the browser", async () => {
  for (const f of await readdir(new URL("../public/", import.meta.url), { recursive: true })) {
    if (!/\.(html|css|js|json|txt|svg)$/.test(f)) continue;
    const s = await read(f);
    assert.doesNotMatch(s, /sk-ant-|ANTHROPIC_API_KEY|AKIA[0-9A-Z]{16}/, `${f} contains a secret-like string`);
  }
});
