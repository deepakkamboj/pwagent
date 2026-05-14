# @pwagent/portal

Local Next.js dashboard for pwagent. Built with **shadcn/ui** components on Tailwind CSS.

## Run

```powershell
cd D:\gith\pwagent\portal
npm install
npm run dev          # http://127.0.0.1:7337 (defined in package.json scripts)
```

## What works in v0.1

| Page | Status |
|---|---|
| `/` Dashboard | Static cards + quick links |
| `/jobs` | Sample scheduler jobs table (no live data yet) |
| `/agents` | Live read of embedded charters from sibling pwagent CLI |
| `/skills` | Pack-level cards |
| `/playwright` | CLI cheat-sheet with 10 command cards |
| `/reports` | Placeholder |
| `/audit` | Placeholder |
| `/runs` | Placeholder |
| `/config` | Snapshot of default config (read-only) |

## Layout

- **Sidebar** (collapsible, state persisted in localStorage) — see `components/sidebar.tsx`
- **Header** with breadcrumb + actions — `components/header.tsx`
- **Footer** with version + scheduler status + links — `components/footer.tsx`

All shadcn/ui primitives are hand-written under `components/ui/`:

- `button.tsx`, `card.tsx`, `separator.tsx`, `tooltip.tsx`

## Roadmap

Follow PT1–PT5 in [PORTAL-DESIGN.md](https://github.com/dekamb/playwright-agent/blob/main/PORTAL-DESIGN.md):

- **PT1 (current)** — Read-only shell with nav, layout, page placeholders.
- **PT2** — Live tail via SSE on `/jobs/[id]` and `/runs/[id]`.
- **PT3** — Server actions: enable/disable jobs, edit schedules, trigger one-off runs.
- **PT4** — Live config editor, audit search/export.
- **PT5** — Per-install secret + CSRF + `--read-only` mode + platform service installers.

## Path resolution

The agents page reads embedded charters from the sibling pwagent CLI's `dist/content/agents/` (or falls back to source). Make sure the CLI is built:

```powershell
cd D:\gith\pwagent
npm run build
```

Then portal can resolve charters via `../dist/content/agents/`.
