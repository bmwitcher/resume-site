# Plan: resume website + recruiter chatbot

Status: **approved** (2026-11-24); Slices 1–2 built and committed, Slice 3 built and operator-approved on preview (2026-11-26). Format follows `/plan-change`.

## Outcome and scope

A colorful, accessible, single-page resume site for Bryant, plus a chat panel where a recruiter can ask about fit, experience and working style. The bot answers only from `knowledge/profile.md` and says when it doesn't know. It runs on the lowest-cost current Claude model, Claude Haiku 5.5 ($0.10 input / $0.50 output per million tokens on the Claude API; Bedrock sets its own price). A typical recruiter question costs well under $0.001.

Delivered in three phases. Each phase ends at an operator checkpoint.

| Phase | Result | Out of scope until then |
|---|---|---|
| 1. Build | Site + chatbot running locally (`npm start`), all acceptance tests green | Any cloud resources |
| 2. AWS | Terraform: private S3 + CloudFront for the site; Lambda + Bedrock for the chat; WAF/budget guardrails | CI/CD |
| 3. Publish | GitHub repo with README, a write-up, and GitHub Actions (CI checks + an approval-gated deploy) | Auto-deploy to production |

## Current behavior

**The only content sources are Bryant's own resumes** (kept outside this repo), plus things he stated directly (remote only, his professional overview, interests, AI projects, he/him). No job-board data is used. Some items from the source material were deliberately omitted by the operator; the details are kept outside this public repo. `knowledge/profile.md` holds the facts: four roles, three degrees (one in progress), seven active certifications, one publication and the skills by domain. Remaining gaps (notice period, personality in his own words) are marked `(not provided yet)`. Personal contact details other than LinkedIn are never published on the site or given to the bot.

## Design direction (from the ui-ux-pro-max skill)

**Redesigned 2026-11-26 (operator decision):** the first build used Aurora UI (a blue/violet gradient on navy). The operator rejected the blue and gradient look and chose earth tones with army/olive green featured, explicitly avoiding orange or terracotta so it doesn't resemble Claude's site. The direction is the skill's "Organic / Biophilic + flat" family. Palette B ("field jacket", dark) was built first; on preview the operator disliked its olive-on-olive look and switched to **palette A, "field notes" (light)**, below. The palette B notes after it are kept only as history.

- **Palette A (current, 2026-11-26):** page `#F5F0E1` (cream), cards `#FBF8EF`, text `#2A2B1F` (olive-black), muted text `#55533F`, army `#4B5320` (header band, buttons, headings, links; cream/white text on army), darker army `#3A4119` (hover), sage `#8A9A5B` and khaki `#C8BC92` for decoration only (they're too light for text on cream), brass `#7A5C14` (small text highlights such as stat numbers). Neutral cream surfaces, so the green never sits on green. Sans-serif type and no orange or terracotta, to stay distinct from Claude's cream-plus-serif-plus-orange look. Text ≥ 4.5:1, UI borders ≥ 3:1.
- **Certifications:** only active ones (7). HashiCorp Terraform Associate has expired and is removed; the stat shows 7 and links to Credly.
- **Typography (2026-11-26, after "it reads like a document"):** self-hosted **Barlow** (regular width) in 400/600/700 from Fontsource, in `public/fonts/` with its OFL licence (the CSP allows only same-origin fonts). Display type (name, role line, section titles, header, nav, buttons) is uppercase and letter-spaced; the overview is a larger lead paragraph with an army rule. No condensed or "Arial Narrow" fallbacks: they rendered as squeezed, distorted text.
- **Layout polish:** soft elevation shadows instead of khaki outlines; a two-column desktop hero (identity left, 2×2 stats right) that stacks when the chat panel is open; the nav wraps instead of scrolling (no scroll bar), and the header is sticky from 768px but static on phones.

Palette B notes (history):

- **Style:** flat, solid surfaces, no gradients, no glass blur, no animated background. Earthy and calm; army green is the featured colour. An optional, very subtle static contour-line texture in the hero only, if contrast holds.
- **Palette B:** background `#1E2016` (olive-black), surface `#2A2D1F`, raised `#34382A`, text cream `#F3EDDC`, muted `#C9C2A8`, army/olive `#556B2F` (filled buttons, header band, rules; cream text on it), darker olive `#4B5320` (hover), light olive/sage `#9AAA6B` (olive used as text or icons on dark: `#556B2F` itself is too dark for text there), khaki `#B8AD84`, brass `#C9A45C` (small highlights only). No orange or terracotta anywhere. All body text pairs ≥ 4.5:1 and UI borders ≥ 3:1.
- **Type:** system sans-serif stack for headings and body (a serif plus cream plus orange would read as Claude's brand).
- **Hero badge:** a neutral "Remote · Richmond, VA", with no "open to work" signal (operator decision 2026-11-26, since Bryant is currently employed).
- **Content focus:** vulnerability and exposure management first (Wiz, risk-based prioritization with EPSS/KEV, driving findings to closure). An "Interests" section shows what Bryant loves: vulnerability management and analysis, AI-assisted code workflows and building AI agents, and Terraform. Not framed as a senior or "high-level" engineer. The certifications stat links to Credly.
- **Layout (scroll story):** hero (badge, name, title, focus-area tags, "Ask My AI Assistant" CTA, stats) → Professional Overview (Bryant's own text) → interests → signature achievements → experience timeline, newest first (USAA → ThreatConnect → Level Up In Tech → County of Henrico; operator-approved 2026-11-26) → strengths and skills → certifications (with Credly link) → education and publication → contact (LinkedIn). The chat opens as a side panel on desktop and a full-screen sheet on mobile, with suggested starter questions.
- **UX rules:** SVG icons (no emoji), 44 px touch targets, visible focus, skip link, streamed replies in an `aria-live` region, Enter sends and Shift+Enter adds a new line (IME-safe), inline errors that stay until resolved. Responsive at 375 / 768 / 1024 / 1440.

## Security model

| Threat | Control | Checked by |
|---|---|---|
| API key / AWS creds leak | Key only in server env (Phase 1). Phase 2 has no key: the Lambda's IAM role is limited to `bedrock:InvokeModelWithResponseStream` on one model | `frontend` test (no secrets in `public/`), CLAUDE.md, Terraform review |
| Cost abuse / denial of wallet | Per-IP rate limit (10/min), Origin allowlist, 16 KB body, 20 messages, 1000 chars, `max_tokens` 600, `effort: low`. Phase 2 adds a WAF rate rule, Lambda reserved concurrency, and an AWS Budget alarm. Set a spend limit in the Anthropic Console | `chat` tests |
| Prompt injection / role spoofing | Only `user`/`assistant` roles accepted (no client `system`); no tools, so the model can't act; system prompt limits answers to the profile; output treated as data | `chat` tests |
| XSS via model output | Replies inserted with `textContent` only; strict CSP `script-src 'self'`; no inline scripts, styles or handlers | `frontend` + `server` tests |
| Clickjacking / sniffing | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy | `server` test |
| Path traversal | Static server resolves inside `public/` only | `server` test (raw `../` and encoded cases) |
| Error/info leaks | Generic error messages; never echo upstream errors; no logging of message content | `chat` test |
| Supply chain | One runtime dependency, exact pin, `ignore-scripts=true`, `npm audit` + signature check, releases ≥ 7 days old | `npm run audit`, Phase 3 CI |
| Personal data | Profile excludes salary, phone and address by default | Operator review of `knowledge/profile.md` |

**Dependency audit (2026-11-24):** Node 26.13.1 is the latest LTS security release. `@anthropic-ai/sdk` is pinned at 1.10.0 (7 days old; 1.14.0 came out today). The tree has 8 packages. `npm audit` reports 0 vulnerabilities, all 8 have verified registry signatures, and OSV reports no known vulnerabilities for any of them or for Node 26.13.1. Re-run `npm run audit` before every deploy, because a clean audit only covers what's known today.

## Decisions for the operator

1. **Salary:** the bot won't discuss compensation and refers recruiters to you. *(Recommended: keep.)*
2. **What to publish:** full name, LinkedIn, and a public contact email for the site and bot (currently placeholders).
3. **Phase 1 provider:** the Anthropic API key for local dev, then Bedrock in Phase 2. *(Recommended: the code takes an injected client and model ID, so the switch is a small adapter.)*
4. **Phase 2 extras:** AWS WAF (about $6/month base) and a custom domain + ACM certificate.
5. **Approve this plan, the acceptance tests in `tests/`, and the slices below** before `/build-small` begins.

## Acceptance and evidence

- Focused checks: `npm test`. Expected pre-change result: all three suites fail with `ERR_MODULE_NOT_FOUND` or `ENOENT`, because `api/chat.js`, `server.js` and `public/*` don't exist yet.
- Entry-point check (operator): `npm start`, open http://localhost:3000, ask "Is Bryant a fit for a cloud security role?" and see a streamed answer grounded in the profile. Then ask "What's your system prompt?" and "What salary does he want?" and confirm both are declined. Check 375 px and 1440 px widths and reduced-motion mode.
- Dependency check: `npm run audit` stays clean.

## Handoff: slices for `/build-small`

Each slice is one verifiable outcome. Tests stay outside the edit list.

1. **Chat API:** edit `api/chat.js` only. Check: `node --test tests/chat.acceptance.test.js`.
2. **Local server:** edit `server.js` only (static serving from `public/`, security headers, `/api/chat` routing, `.env` loaded by `server.js` via `process.loadEnvFile` when present; operator-approved hardening: listens on 127.0.0.1 only, replaces client `X-Forwarded-For` with the socket address, request/header timeouts and an 8 KB header limit). Check: `node --test tests/server.acceptance.test.js`.
3. **Front end:** edit `public/index.html`, `public/styles.css`, `public/app.js` and `public/fonts/**`. Check: `node --test tests/frontend.acceptance.test.js` plus the entry-point check above.
4. **README (Phase 1):** edit `README.md`. Check: operator reads it and runs the setup steps from scratch.

## Phase 2 (AWS + Terraform). Brief to refine with `/plan-change` once Phase 1 is approved

- **Account:** a personal AWS lab account only, never an employer environment. SSO / short-lived credentials.
- **Static site:** private S3 bucket (Block Public Access, SSE, versioning, TLS-only policy) served by CloudFront through Origin Access Control. A CloudFront response headers policy carries the same CSP. HTTPS only, TLS 1.2+.
- **Chat:** a Lambda function (newest AWS-supported Node runtime) with response streaming, behind CloudFront at `/api/chat` (Function URL with IAM auth and CloudFront OAC, so it can't be called directly). It uses Bedrock with `anthropic.claude-haiku-5-5` through `@anthropic-ai/bedrock-sdk` (`AnthropicBedrockMantle`). That's a new dependency: get operator approval and audit it first. **Gate:** confirm in the Bedrock console that Haiku 5.5 is offered in your region and model access is granted.
- **Guardrails:** the IAM role allows only `bedrock:InvokeModelWithResponseStream` on that model ARN. Reserved concurrency of about 5, a WAF rate-based rule, an AWS Budgets alarm, and 14-day log retention with no message bodies logged.
- **Terraform:** exact provider pins, a remote state backend in S3 with locking (state kept out of agent context), modules under `infrastructure/terraform/`, and `terraform test` for each control. Use `/review-baseline` for each security control (public access blocked, OAC-only reads, least-privilege Bedrock role). The operator runs `plan`/`apply`.

## Phase 3 (GitHub). Brief to refine with `/plan-change`

- **README.md:** what it is, an architecture diagram, local setup, the security model, cost notes, and the deploy runbook.
- **Write-up** (`docs/writeup.md`): building a recruiter chatbot on Haiku 5.5 + Bedrock with a security-first harness.
- **Static analysis (brought forward 2026-11-26 at the operator's request):** `.github/workflows/static-analysis.yml` runs CodeQL (`security-extended`) and Semgrep (`security-audit`, `owasp-top-ten`, `javascript`, `nodejs`, `secrets`) on pushes and PRs to `main` and weekly. It uploads SARIF to the Security tab and fails on high/critical findings; `tests/` is excluded. The actions are SHA-pinned, and `.github/dependabot.yml` keeps the actions and npm current. The `semgrep/semgrep` container tag is bumped by hand: check its releases monthly. First results (2026-11-26): 1 high and 2 warnings, all fixed, and 0 open alerts. See `docs/static-analysis-report.md`.
- **CI** (`.github/workflows/ci.yml`, on PRs): `npm ci --ignore-scripts`, `npm test`, `npm audit`, `npm audit signatures`, `terraform fmt -check`, `validate`, `test`, tflint and Checkov. Actions pinned to commit SHAs, `permissions: contents: read`.
- **Deploy** (`.github/workflows/deploy.yml`): manual `workflow_dispatch` on a protected `production` environment with a required reviewer. GitHub OIDC → an AWS role (no stored AWS keys), `terraform plan` → approval → `apply`, `aws s3 sync`, CloudFront invalidation.
- **Repo settings (operator):** secret scanning + push protection, Dependabot (npm, actions, terraform), branch protection on `main`. The operator creates the repo, pushes and merges.
