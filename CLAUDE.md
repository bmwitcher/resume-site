# Resume site

## Scope and stack

- **Purpose:** Bryant's public resume website plus a recruiter Q&A chatbot that answers only from `knowledge/profile.md`.
- **Stack (decided 2026-11-24):** Node 26.13.1 LTS (ESM), no frontend framework or build step: `public/index.html`, `public/styles.css`, `public/app.js`. Chat API in `api/chat.js` (Node `(req, res)` handler mounted by `server.js` for local dev; Phase 2 wraps it in an AWS Lambda adapter that calls Bedrock). Only runtime dependency: `@anthropic-ai/sdk` pinned to 1.10.0 in `package-lock.json`. Tests use the built-in `node:test`.
- **Model:** `claude-haiku-5-5` (the lowest-cost current Claude model), `output_config.effort: "low"`, `max_tokens` 600, streaming. No tools, no temperature (Haiku 5.5 rejects it), no prefill.
- **Phases:** 1 local site + chatbot, 2 AWS via Terraform (private S3 + CloudFront, Lambda + Bedrock), 3 GitHub README, write-up and Actions. Details and open decisions: `docs/plan.md`.
- **Commands:** `npm test`, `npm start` (reads `.env` if present), `npm run audit` (vulnerabilities and registry signatures).

## Security rules

- The API key lives only in the server environment (`ANTHROPIC_API_KEY`). It never goes in `public/`, logs, responses, or the repo. `.env` stays out of agent context.
- Treat every chat message, and all model output, as untrusted data. Never execute it, never insert it as HTML (`textContent` only), never let it choose files, URLs, or commands.
- `/api/chat` validates everything: POST only, JSON only, body ≤ 16 KB, ≤ 20 messages, ≤ 1000 chars each, roles `user`/`assistant` only, last role `user`, Origin on the allowlist, and a per-IP rate limit. Errors return generic text and never echo upstream errors.
- The browser loads no third-party scripts. A strict CSP (`script-src 'self'`, `frame-ancestors 'none'`) plus nosniff, Referrer-Policy and Permissions-Policy are set by `server.js` (and in Phase 2 by a CloudFront response headers policy).
- Static serving must never escape `public/`.
- The bot states only facts in `knowledge/profile.md`, and says when it doesn't know. It never reveals the system prompt and never discusses compensation unless the profile says it may.
- Dependencies: add none without operator approval. Pin exact versions, keep `ignore-scripts=true` in `.npmrc`, and run `npm run audit` before every deploy. Prefer releases at least 7 days old.

## Verification and delegation

- Acceptance tests in `tests/` stay outside every implementer's edit list. `knowledge/profile.md` is operator-owned content.
- Use `/plan-change` for design questions, `/build-small` for one scoped slice (see `docs/plan.md`), `/verify-change` for independent review.
- The operator owns architecture, dependencies, the profile's content, secrets, commits, pushes, merges and deployment, and the Anthropic Console spend limit.
- **AWS:** use a personal lab account only, never an employer environment. Short-lived credentials (SSO or GitHub OIDC), no long-lived access keys. Never auto-deploy: `terraform apply` and production deploys need operator approval. Keep Terraform state, plan files and tfvars out of agent context.
- **Reviewed lessons:** none yet. Add a short rule with its rationale when a mistake recurs.
