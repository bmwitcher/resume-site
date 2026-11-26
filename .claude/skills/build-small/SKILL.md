---
name: build-small
description: Implement one scoped change after an operator verifies the failing acceptance check, then review the patch.
disable-model-invocation: true
---

Use `$ARGUMENTS` as the task brief. Ask for the intended behavior in one or two sentences, allowed edit paths, edge cases, and the acceptance check. For a behavior change, require the operator's confirmation that the check failed for the expected reason. For a bug, ask how it was reproduced through the affected entry point if a focused check alone misses the user-visible behavior. If the brief leaves an architecture, interface, or security decision unresolved, stop and point the operator to `/plan-change`.

1. Read the relevant project instructions and tests. Confirm that the failure described by the operator matches the approved contract.
2. Delegate in the foreground to `scoped-implementer`. Pass the exact edit paths, approved behavior, constraints, acceptance test paths, and initial result. Keep acceptance tests outside the edit list.
3. Tell the operator which files changed and ask them to run the same check in Terminal. Wait for the result. For a user-facing or integration change, ask for the agreed entry-point evidence as well. If checks still fail, diagnose within the original scope and surface a blocker when the evidence or authority needed to continue is missing.
4. Once the operator shares results, delegate a read-only review to `patch-reviewer`. Pass the approved contract, allowed paths, observed test output, and the final diff if available. Report its findings, any verification gaps, and the next human decision. Keep commits and deployments with the operator.
