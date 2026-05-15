---
name: skill-s360
description: Project-specific S360 fix patterns for pwagent. Read by pwagent-s360 --fix before writing any code. Contains Kusto query patterns, portal URL templates, ADO field mappings, and per-subtype remediation notes specific to this workspace.
---

# S360 Fix Skill

Reference patterns for the `pwagent-s360 --fix` workflow. Always read this before writing code for a violation.

## Kusto cluster

| Property | Value |
|---|---|
| Cluster | `https://s360prodro.kusto.windows.net` |
| Database | `service360db` |
| MCP tool | `mcp__kusto__kusto_query` |

## Key tables

| Table / Function | Purpose |
|---|---|
| `GetActiveActionItems()` | All open action items (scan target) |
| `KpiMetadata()` | KPI metadata — join on `ActionItemId == KpiId` |
| `GetAliasToOwnedServiceHierarchyMapping(alias)` | Services owned by alias hierarchy |
| `PeopleHierarchySnapshot_datalake` | Org hierarchy — use `Managers has toupper(alias)` |
| `GetResolvedActionItems()` | Resolved items — report/trend only, never scan |

## Org-level query pattern (MANDATORY for alias targets)

Always query both services AND people reporting to the alias. Never query only one.

```kql
let alias = '<alias>';
let services = GetAliasToOwnedServiceHierarchyMapping(alias)
  | where Type == 'Service'
  | project ServiceTreeId;
let people = PeopleHierarchySnapshot_datalake
  | where Managers has toupper(alias)      // UPPERCASE
  | project alias = tolower(EmailName);   // lowercase
GetActiveActionItems()
| where TargetId in (services) or AssignedTo in (people)
| join kind=leftouter KpiMetadata() on $left.ActionItemId == $right.KpiId
| where KpiState != 'Retired'
| where DisplayName has_any ('accessibility','a11y','wcag','aria','screen reader',
                             'keyboard','contrast','focus','color contrast')
| project ActionItemId, DisplayName, AssignedTo, SLAState, CurrentDueDate,
          CurrentETA, CurrentStatus, TsgLinks, DomainName, TargetId, CustomDimensions
| sort by SLAState asc, CurrentDueDate asc
```

## Portal URL template

```
DOMAIN_PATH = tolower(replace(DomainName, " ", ""))
DOMAIN_LOC  = replace(DomainName, " ", "")
SLA_VALUE   = InSla→0  |  ApproachingSla→1  |  OutOfSla→2

https://vnext.s360.msftcloudes.com/blades/${DOMAIN_PATH}
  ?global=4:${TargetId}
  &blade=KPI:${ActionItemId}~SLA:${SLA_VALUE}~AssignedTo:All~waves:All~Tab:Summary~_loc:${DOMAIN_LOC}
```

## ADO priority mapping

| SLAState | ADO Priority | Label |
|---|---|---|
| `OutOfSla` | 1 | Critical |
| `ApproachingSla` | 2 | High |
| `InSla` | 3 | Medium |

## WCAG subtype → fix patterns

### `color-contrast`
- Audit computed foreground/background with browser DevTools → Accessibility panel.
- Target ratio: ≥ 4.5:1 for normal text, ≥ 3:1 for large text (≥ 18pt or 14pt bold).
- Fix: update the CSS color token (design-token first, direct CSS second).
- Never adjust opacity to fix contrast — it can break other things.
- Verify with: `npx axe <url> --rules color-contrast`.

### `image-alt`
- Decorative images: `alt=""` + `role="presentation"` (or `aria-hidden="true"`).
- Informative images: concise alt text describing the meaning, not the appearance.
- Icon fonts / SVG icons that convey meaning: add `aria-label` to the parent button/link.

### `label`
- Prefer visible `<label for="id">` over `aria-label`.
- For inputs in a form group with a shared visible heading, use `aria-labelledby`.
- Never use `placeholder` as the only label — it disappears on input.

### `aria-required-attr`
- Run axe to see the exact missing attribute in `nodes[].failureSummary`.
- Common: `aria-expanded` on disclosure buttons, `aria-controls` on tab triggers, `aria-selected` on tab panels.

### `aria-hidden-focus`
- Find elements with both `aria-hidden="true"` and a focusable descendant.
- Fix options: remove `aria-hidden`, or move focus out (tabindex="-1"), or use `inert` attribute.

### `keyboard`
- Map the full tab/arrow-key flow before touching code.
- Custom widgets (dropdown, combobox, date picker) must implement WAI-ARIA keyboard pattern.
- Fix tab order via DOM order or `tabindex` (positive tabindex is an antipattern — reorder DOM instead).
- Add `keydown` handlers for `Enter`/`Space` on non-native interactive elements.

### `focus-visible`
- Add `:focus-visible` CSS rule matching the browser's default focus ring or brand equivalent.
- Never `outline: none` without a replacement focus indicator.
- If the existing stylesheet already suppresses outlines globally, scope the fix to the specific component.

### `link-name` / `button-name`
- Prefer visible text. If the control is icon-only, add `aria-label` describing the action (not the icon).
- Icon buttons wrapping `<svg>`: add `aria-label` to the `<button>`, add `aria-hidden="true"` to the `<svg>`.

### `landmark-*`
- Add `<main>`, `<nav>`, `<header>`, `<footer>` or equivalent `role=` attributes.
- Multiple `<nav>` landmarks: add `aria-label` to distinguish them (e.g., `aria-label="Primary navigation"`).

### `heading-order`
- Headings must not skip levels (h1→h3 without h2 is a violation).
- Fix by adjusting heading level in the DOM; if visual size must stay the same, use CSS to style a lower-level heading to look like a higher one.

## axe command reference

```bash
# Scan a URL
npx axe <url> --tags wcag2a,wcag2aa,wcag21aa

# Scope to a CSS selector
npx axe <url> --tags wcag2a,wcag2aa --include "#main-content"

# Save report to file
npx axe <url> --tags wcag2a,wcag2aa --save axe-report.json
```

## a11y-fixes.json schema (append-only, never commit)

```json
{
  "actionItemId": "<uuid>",
  "displayName": "<string>",
  "subtype": "<ActionItemSubtype>",
  "adoBug": 12345,
  "branch": "a11y/s360-<8-char-prefix>",
  "prUrl": "https://...",
  "fixedAt": "2026-05-15",
  "confidence": "High|Medium|Low"
}
```

Confidence:
- **High** — axe reproduced the violation, fix applied, axe verified clean.
- **Medium** — violation inferred from `CustomDimensions`; axe inconclusive (SSRF, auth wall, etc.).
- **Low** — URL unreachable or violation could not be reproduced.
