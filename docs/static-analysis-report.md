# Static analysis report

**Date:** 2026-11-26
**Tools:** CodeQL (github/codeql-action v4.39.5, `security-extended` JavaScript queries) and Semgrep OSS 1.187.0 (`p/security-audit`, `p/owasp-top-ten`, `p/javascript`, `p/nodejs`, `p/secrets`)
**Scope:** everything committed to `github.com/bmwitcher/resume-site` on `main`: `api/chat.js`, `package*.json`, `.npmrc`, `.github/`. `tests/` and `node_modules/` are excluded. `server.js` (Slice 2) wasn't committed yet; it gets scanned when it lands, and it was reviewed by reading against the same rule categories.
**Workflow:** `.github/workflows/static-analysis.yml`. It runs on pushes and PRs to `main`, weekly, and on demand, and uploads SARIF to the Security tab.

## Summary

| Severity | Found | Fixed | False positive | Remaining |
|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 |
| High | 2 | 2 | 0 | 0 |
| Medium (warning) | 2 | 2 | 0 | 0 |
| Low | 0 | 0 | 0 | 0 |

The first run, 45862716542 on commit `4c40e50`, raised the three alerts below. The second run, 45863226998 on commit `825c7fd`, passed both gates, and GitHub shows **0 open alerts**.

## Findings

1. **`js/incomplete-multi-character-sanitization` (CodeQL, high)**
   - **File:** `api/chat.js:130`
   - **Issue:** HTML comments were stripped from the profile in a single regex pass. Nested input such as `<!<!-- -->-- x -->` can reassemble a `<!--` after one pass.
   - **Real-world impact:** low. The input is the operator-owned `knowledge/profile.md`, and the output goes to the model's system prompt, not into HTML. It's still fixed, so that no high-severity alert stays open.
   - **Remediation:** repeat the replace until the string stops changing. The code comment cites the rule.

2. **`npm-missing-minimum-release-age` (Semgrep, warning)**
   - **File:** `.npmrc:1`
   - **Issue:** npm could install a version published minutes ago, the usual window for a compromised release.
   - **Remediation:** `min-release-age=7` in `.npmrc`, which enforces the CLAUDE.md rule "prefer releases at least 7 days old". Verified locally: `npm config get min-release-age` returns `7`, and the audit is still clean.

3. **`dependabot-missing-cooldown` (Semgrep, warning)**
   - **File:** `.github/dependabot.yml:4`
   - **Issue:** GitHub Actions updates had no cooldown; npm updates already did.
   - **Remediation:** `cooldown: default-days: 7` on the `github-actions` entry.

## Process finding: the gate missed a high alert

The first version of the CodeQL gate failed only on SARIF level `error`. CodeQL reports finding 1 at level `warning` with security-severity high, so that run **passed despite an open high alert**. The gate now fails on `level == "error"` **or** a rule security-severity of 7.0 or above (high or critical), and lists each blocking finding. Run 45863226998 passed under the corrected gate.

## Manual review of `server.js` (not yet scanned)

No issues found in these categories:
- **Path traversal (CWE-22):** the path is decoded, dot segments are refused, it's resolved inside `public/`, and its real path is checked again.
- **Information exposure:** generic error bodies, and logs show only error codes.
- **Resource exhaustion (CWE-400):** 8 KB header limit, request and header timeouts, and listening on 127.0.0.1 only.
- **Misconfiguration (A05):** strict CSP and the other security headers on every response.

CodeQL may flag `server.js:75` (`realpath` on a URL-derived path) as `js/path-injection`. If it does, triage it against those containment checks, and record the rationale in a code comment before dismissing it.

## Supply chain

- Every action is pinned to a full commit SHA: checkout v7.0.1 `3d3c42e5…`, codeql-action v4.39.5 `915412ff…`. The Semgrep container is pinned to `1.187.0`.
- Workflow permissions default to `{}`. Jobs get only `contents: read` and `security-events: write`. `persist-credentials: false`, and no secrets are used.
- Dependabot keeps the actions and npm current, with a 7-day cooldown on both. The Semgrep image tag is bumped by hand monthly.
- `npm audit`: 0 vulnerabilities. All 8 packages have verified registry signatures, and 4 have attestations.
- gitleaks pre-commit hook: no leaks in any commit so far. GitHub secret scanning and push protection are on.

## Second scan: `server.js` (Slice 2), 2026-11-26

Run 45864333729 on commit `a8e2a1b` **failed the CodeQL gate**, which is the intended behavior: the corrected gate blocked a high finding.

4. **`js/file-system-race` (CodeQL, high, CWE-367)**
   - **File:** `server.js:82`
   - **Issue:** the file was checked (`realpath`, then `stat`) and then read by path in a separate call. In between, a file in `public/` could be swapped, for example for a symlink to a file outside it.
   - **Real-world impact:** low. It needs local write access to `public/`, and the server only listens on 127.0.0.1. The Slice 2 reviewer had rated it low. It's fixed anyway, because the gate blocks high findings and the fix is small.
   - **Remediation:** open the file once with `O_RDONLY | O_NOFOLLOW`, then stat and read through the same handle, and always close it. A symlink swapped in after the realpath check now fails with `ELOOP`, which returns 404.

The `js/path-injection` false positive predicted for the `realpath` call didn't appear.

## Recommendations

1. Commit `server.js` once Slice 2 is verified, then confirm the next run stays at 0 open alerts. Triage any `js/path-injection` as described above.
2. In Phase 3, when PRs to `main` become required, add the static analysis checks as required status checks in the `protect-main` ruleset, so a failing gate blocks merges.
3. Optionally, add a small acceptance test for nested HTML comments in the profile, so the fix for finding 1 is protected from regression. Tests are operator-owned.
