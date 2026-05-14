# Ceremonies

> Auto-run structured agendas. Triggered by the conditions in the table.

| Ceremony | Trigger | When | Condition |
|---|---|---|---|
| Pre-fix design review | auto | before | Multi-file fix touching both src/ and tests/ |
| Triage retrospective | auto | after | Fix attempt failed twice (red after retry) |
| Weekly report | manual | scheduled | Friday 17:00 local — driven by scheduler |
| Author probation review | auto | after | A `*.generated.spec.ts` reaches 5 green runs |
