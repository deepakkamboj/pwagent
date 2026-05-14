---
name: hitl
description: 'Human-in-the-loop stamp convention for triage decisions. Append-only with supersedes chain. Modes: always | low-confidence | off (per .triage.hitlMode in config.json).'
allowed-tools: Read Bash(python:*)
---

# HITL gate — convention + invocation

The triage classifier emits a `TriageDecision` row with an `agent_recommendation` (ProductBug / TestCodeBug / Environment / Inconclusive) + `agent_confidence`. A **human stamp** is the only thing that authorizes a fix to ship.

## Modes (set in `config.json` `.triage.hitlMode`)

| Mode | Behavior | When to use |
|---|---|---|
| `always` | Every decision pauses for a stamp | Production CI (default) |
| `low-confidence` | Only `agent_confidence < lowConfidenceThreshold` pauses; rest auto-stamp = agent recommendation | Nightly runs in a stable area |
| `off` | Fully autonomous; auto-stamp every recommendation | Dry runs only |

## Stamp values

| Stamp | Meaning | Routed to |
|---|---|---|
| `[p]` Product | Patch belongs in `src/` | `/pwagent-product-fixer` |
| `[t]` Test | Patch belongs in `tests/` | `/pwagent-fixer` |
| `[s]` Skip | Needs investigation; do not fix | (no-op; marks `needs-investigation` tag) |
| `[o]` Open-trace | Operator wants to inspect; no decision yet | (loop continues — re-prompt later) |

## Append-only contract

**Never overwrite a prior stamp.** Re-stamping creates a new `TriageDecision` row with `supersedes` pointing at the previous one. The full chain is the audit log.

Invoke via `scripts/matrix.py stamp`:

```bash
python plugins/pwagent/scripts/matrix.py stamp \
    --test "tests/contacts/save.spec.ts::Saves Lead" \
    --hash 9a3f1e \
    --stamp Test \
    --by alice@contoso.com
```

The script handles the supersedes chain automatically — it finds the latest decision row for `(test, hash)` and threads the new stamp through.

## When to halt

- `agent_confidence < lowConfidenceThreshold` AND mode is `low-confidence` → pause for stamp.
- Mode is `always` → always pause.
- Mode is `off` → skip stamping; auto-route by `agent_recommendation`.

## Audit reach

The chain of stamps for any `(test, hash)` is queryable via:

```bash
python plugins/pwagent/scripts/matrix.py query --test "<id>"
```

The query result includes every decision row that mentions the test, ordered by `decidedAt`. `supersedes` is a SHA1 prefix; the dashboard renders it as a visual chain.
