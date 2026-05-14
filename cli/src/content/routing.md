# Routing

> Coordinator routing rules and reviewer gates. Edit at `~/.pwagent/routing.md` (user override) or `<workspace>/.pwagent/routing.md` (workspace override, preferred) or `<workspace>/.squad/routing.md` (Squad-compat fallback).

## Work routing

| Work Type | Route To | Examples |
|---|---|---|
| Test authoring | generate | "write a test for X", "author a spec for scenario Y", "I need coverage for the checkout flow" |
| Test patching | heal | "patch tests/foo.spec.ts", "fix the failing selector" |
| Product patching | heal | "fix src/api.ts", "the product bug needs a code change" |
| Plan building | plan | "plan a fix from failures.json", "what order should we tackle this in" |
| Coverage analysis | scenario | "find missing scenarios", "what's the test coverage for auth/" |
| Test validation | validate | "rerun test X twice", "verify fix" |
| Auth flows | auth | "write a test that needs logged-in state", "create storage state for the admin role" |
| Failure classification | triage | "classify run 12345", "what kind of bug is this" |
| HITL stamping | review | (auto, after triage emits a verdict) |
| Reporting | report | "weekly digest", "compose the retro", "render flake-rank table" |

## Reviewer gates

| Artifact | Reviewer | Gate |
|---|---|---|
| Triage verdict | review | Must stamp `[p]`/`[t]`/`[s]` before `heal` runs |
| Patch from heal | validate | Two green runs before PR is opened |
| Test from generate | review | Must approve before promotion (7-day probation window) |
