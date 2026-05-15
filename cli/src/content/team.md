# Team

> Roster of pwagent members. The `## Members` heading is load-bearing — Squad-compatible GitHub workflows parse it literally.

## Members

| Member | Role | Charter |
|---|---|---|
| pwagent-supervisor | Coordinator / router | agents/supervisor/charter.md |
| pwagent-discover | Failure collector + CI watcher (`--watch` daemon) | agents/discover/charter.md |
| pwagent-triage | Failure classifier (ProductBug / TestCodeBug / Environment / Inconclusive) | agents/triage/charter.md |
| pwagent-analyze | Read-only analyzer (`--scenarios` / `--flakes` / `--test-quality`) | agents/analyze/charter.md |
| pwagent-review | HITL stamp gate | agents/review/charter.md |
| pwagent-plan | Fix-plan builder | agents/plan/charter.md |
| pwagent-fix | Patcher (`--scope test\|product\|auto`) + orchestrator (`--orchestrate`) | agents/fix/charter.md |
| pwagent-validate | Twice-runner (`--test` Playwright, `--a11y` axe-core) | agents/validate/charter.md |
| pwagent-publish | PR opener (ADO REST, GitHub gh) | agents/publish/charter.md |
| pwagent-author | New-test writer (probation window) | agents/author/charter.md |
| pwagent-auth | Auth-flow specialist (storage state, roles, MFA) | agents/auth/charter.md |
| pwagent-record | Canonical-state writer (`--kind matrix\|patterns`) | agents/record/charter.md |
| pwagent-report | Weekly + ad-hoc reporter | agents/report/charter.md |
| pwagent-s360 | S360 accessibility specialist (scan / triage / fix / close S360 WCAG action items) | agents/s360/charter.md |
| pwagent-a11y | Full-stack accessibility agent (WCAG scan, MAS review, auto-fix, verify, test-gen, HTML report, interactive testing) | agents/accessibility/charter.md |
| pwagent-ado-a11y | ADO accessibility bug manager (list, read, create, fix, create PR, resolve — reads config.json for repo routing) | agents/ado-a11y/charter.md |
