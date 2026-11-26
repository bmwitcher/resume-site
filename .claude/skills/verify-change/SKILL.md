---
name: verify-change
description: Independently review a scoped patch and its evidence, and return a pull-request handoff in chat.
disable-model-invocation: true
context: fork
agent: patch-reviewer
---

Use `$ARGUMENTS` as the full handoff. This reviewer starts with a separate context. Include the approved intent and paths, the patch or a path to a sanitized patch in this project, and the observed test results. Include the commit ID when reviewing a committed patch. If checks happened before the last edit, ask for fresh evidence.

Follow the patch reviewer's rubric. Return the disposition, findings, and a compact PR handoff covering intent, changes, observed checks, gaps, and risk. Where appropriate, cite operator-supplied sanitized evidence of the real entry point. Label CI status unknown unless the operator supplies the actual result. If the patch or required evidence is missing, say what is needed before the change is ready.

Keep the handoff in chat. The operator owns commits, pushes, PR creation, CI approval, merges, and deployment.
