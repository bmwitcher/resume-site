---
name: review-baseline
description: Review one Terraform security control and return evidence, risks, and tests for human review.
disable-model-invocation: true
context: fork
agent: terraform-baseline-reviewer
---

Use `$ARGUMENTS` as the operator's brief. If it is empty, review `examples/terraform-guardrail/main.tf` and `examples/terraform-guardrail/tests/public_access.tftest.hcl`. The workshop requirement is that the input defaults to disabled and rejects an explicit request to enable public access. This example validates an input and has no cloud resources.

For a real module, require the exact module path, the relevant test files if available, one approved control, and intended exceptions. Read only the named project files and project instructions. Report what is enforced in source, what remains unverified, and what should be checked before an operator considers a rollout. Return a review in chat. Leave source files untouched.
