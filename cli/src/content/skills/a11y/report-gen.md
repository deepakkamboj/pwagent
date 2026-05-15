---
name: a11y-report-gen
description: Generates a self-contained accessibility-report.html from violations collected by any skill — color, contrast, links, modes, viewports, interactive, static scan, or code review. Produces a filterable HTML report with ADO bug templates, color swatches, MAS compliance table, and 8 selectable themes using Tailwind CSS and Font Awesome. Saves to a specified folder or a11y-reports by default.
---

You are an accessibility report generator. You collect violation data from prior skill runs in the current conversation and produce a single, self-contained `accessibility-report.html` file with full filtering, ADO bug templates, and 8 visual themes.

## Your Role

Turn ephemeral terminal output from any skill run into a persistent, shareable HTML report. The report is fully self-contained — no external files, no build step — using CDN links for Tailwind CSS and Font Awesome 6.

## When to Activate

Use this skill when:
- User asks to "generate a report", "save findings", or "create an HTML report"
- User has just run one or more skills and wants results saved
- User wants ADO-ready bug descriptions for filing
- User wants to share findings with a team member or link to a bug

## Sources — What to Collect from Context

Scan the current conversation for findings from any of these skills:

| Skill | Violation Types |
|---|---|
| `skills/a11y/scan.md` / `skills/a11y/scan-repo.md` | axe-core violations (WCAG violations, elements, impacts) |
| `skills/a11y/review-color.md` | Color-only indicator violations (WCAG 1.4.1) |
| `skills/a11y/review-contrast.md` | Contrast ratio failures (WCAG 1.4.3, 1.4.11) |
| `skills/a11y/review-links.md` | Generic/ambiguous link text (WCAG 2.4.4) |
| `skills/a11y/review-modes.md` | MAS mode violations (HC, Forced Colors, Reduced Motion, Zoom, Text Spacing, Dark Mode) |
| `skills/a11y/review-viewports.md` | Responsive/reflow failures by viewport size |
| `skills/a11y/review-interactive.md` | Playwright interactive test failures (ARIA state, keyboard, focus) |
| `skills/a11y/fix.md` + `skills/a11y/verify-fix.md` | Post-fix verification results |

If no violations are present in context, ask the user to run a scan first or describe the violations to include.

---

## Step 1 — Ask for Output Folder

If the user has not specified an output folder, ask:

> "Where should I save `accessibility-report.html`? (Press Enter for default: `a11y-reports`)"

Use the Bash tool to create the folder if it does not exist:

```bash
mkdir -p "OUTPUT_FOLDER"
```

The output file path is always: `OUTPUT_FOLDER/accessibility-report.html`

---

## Step 2 — Collect and Structure Violations

For each finding, determine:

```
id          — sequential: "v1", "v2", ...
severity    — "sev1" | "sev2" | "sev3" | "usable"
type        — "contrast" | "color" | "aria" | "keyboard" | "interactive" | "links" | "modes" | "viewports" | "visual"
mode        — "Normal" | "HC Black" | "HC White" | "Forced Colors" | "Reduced Motion" | "200% Zoom" | "Text Spacing" | "Dark Mode" | "All Modes"
viewport    — "1920x1080" | "1366x768" | "2560x1440" | "768x1024" | "1024x768" | "320x568" | "414x896" | "All" | ""
criterion   — e.g. "WCAG 1.4.3" or "MAS 4.3.1"
title       — short violation title
location    — "file:line" or "URL" or "selector"
description — full description
currentCode — code snippet (optional)
recommendation — fix text
contrast    — { fg, bg, ratio, required } — only for type="contrast"
```

### Severity Mapping

| axe-core | ADO/CELA |
|---|---|
| critical | sev1 |
| serious | sev2 |
| moderate | sev3 |
| minor | usable |

### MAS Mode Compliance Summary

For each of the 8 modes, determine status from conversation context. Status is `"pass"` if no violations found, `"fail"` if any found, `"not-tested"` if mode was not scanned.

---

## Step 3 — Generate the HTML

Use the **Write** tool to create `OUTPUT_FOLDER/accessibility-report.html` with the complete HTML below.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Report — {{SCAN_TITLE}}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA=="
        crossorigin="anonymous" referrerpolicy="no-referrer">
  <style>
    :root,[data-theme="default"]{--bg:#f9fafb;--bg-card:#ffffff;--bg-code:#f3f4f6;--text:#111827;--text-muted:#6b7280;--border:#e5e7eb;--accent:#2563eb;--accent-fg:#ffffff;--row-hover:#f9fafb}
    [data-theme="hc-black"]{--bg:#000000;--bg-card:#0d0d0d;--bg-code:#1a1a1a;--text:#ffffff;--text-muted:#d1d5db;--border:#ffffff;--accent:#ffff00;--accent-fg:#000000;--row-hover:#1a1a1a}
    [data-theme="hc-white"]{--bg:#ffffff;--bg-card:#ffffff;--bg-code:#f5f5f5;--text:#000000;--text-muted:#333333;--border:#000000;--accent:#00008b;--accent-fg:#ffffff;--row-hover:#f5f5f5}
    [data-theme="aquatic"]{--bg:#ecfeff;--bg-card:#ffffff;--bg-code:#cffafe;--text:#164e63;--text-muted:#0e7490;--border:#a5f3fc;--accent:#0284c7;--accent-fg:#ffffff;--row-hover:#f0fdff}
    [data-theme="forest"]{--bg:#f0fdf4;--bg-card:#ffffff;--bg-code:#dcfce7;--text:#14532d;--text-muted:#166534;--border:#bbf7d0;--accent:#16a34a;--accent-fg:#ffffff;--row-hover:#f7fef9}
    [data-theme="sunset"]{--bg:#fff7ed;--bg-card:#ffffff;--bg-code:#ffedd5;--text:#7c2d12;--text-muted:#9a3412;--border:#fed7aa;--accent:#ea580c;--accent-fg:#ffffff;--row-hover:#fffbf5}
    [data-theme="midnight"]{--bg:#030712;--bg-card:#111827;--bg-code:#1f2937;--text:#f9fafb;--text-muted:#9ca3af;--border:#374151;--accent:#818cf8;--accent-fg:#0f172a;--row-hover:#1f2937}
    [data-theme="corporate"]{--bg:#f8fafc;--bg-card:#ffffff;--bg-code:#f1f5f9;--text:#0f172a;--text-muted:#475569;--border:#cbd5e1;--accent:#334155;--accent-fg:#ffffff;--row-hover:#f8fafc}
    *{box-sizing:border-box}
    body{background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,sans-serif;margin:0}
    a{color:var(--accent)}
    .card{background:var(--bg-card);border:1px solid var(--border);border-radius:0.5rem}
    .muted{color:var(--text-muted)}
    .accent-text{color:var(--accent)}
    .accent-btn{background:var(--accent);color:var(--accent-fg);border:none;cursor:pointer;border-radius:0.375rem;padding:0.25rem 0.75rem;font-size:0.75rem;display:inline-flex;align-items:center;gap:0.375rem}
    .accent-btn:hover{opacity:0.88}
    .code-block{background:var(--bg-code);border:1px solid var(--border);border-radius:0.375rem;padding:0.75rem;font-family:ui-monospace,monospace;font-size:0.75rem;overflow-x:auto;white-space:pre-wrap;word-break:break-word;color:var(--text)}
    select,input{background:var(--bg-card);color:var(--text);border:1px solid var(--border);border-radius:0.375rem;padding:0.375rem 0.625rem;font-size:0.75rem}
    select:focus,input:focus{outline:2px solid var(--accent);outline-offset:1px}
    details>summary{cursor:pointer;list-style:none;font-size:0.75rem;color:var(--accent);display:inline-flex;align-items:center;gap:0.375rem;padding:0.125rem 0}
    details>summary::-webkit-details-marker{display:none}
    .badge{display:inline-flex;align-items:center;gap:0.3rem;border-radius:9999px;padding:0.15rem 0.6rem;font-size:0.7rem;font-weight:600;white-space:nowrap;border:1px solid}
    .badge-sev1{background:#fef2f2;color:#991b1b;border-color:#fca5a5}
    .badge-sev2{background:#fffbeb;color:#92400e;border-color:#fcd34d}
    .badge-sev3{background:#eff6ff;color:#1e40af;border-color:#93c5fd}
    .badge-usable{background:#f0fdf4;color:#166534;border-color:#86efac}
    .badge-pass{background:#f0fdf4;color:#166534;border-color:#86efac}
    .badge-fail{background:#fef2f2;color:#991b1b;border-color:#fca5a5}
    .badge-not-tested{background:#f9fafb;color:#6b7280;border-color:#d1d5db}
    .type-contrast{color:#7c3aed}.type-color{color:#db2777}.type-aria{color:#0284c7}
    .type-keyboard{color:#0d9488}.type-interactive{color:#d97706}.type-links{color:#dc2626}
    .type-modes{color:#7c3aed}.type-viewports{color:#0284c7}.type-visual{color:#475569}
    .v-card{margin-bottom:1rem;border-radius:0.5rem;border:1px solid var(--border);background:var(--bg-card);overflow:hidden}
    .v-card.hidden{display:none}
    .v-card-header{padding:0.75rem 1rem;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:0.75rem}
    .v-card-body{padding:0.75rem 1rem}
    .v-title{font-weight:600;font-size:0.875rem;line-height:1.4;color:var(--text)}
    .v-meta{font-size:0.7rem;color:var(--text-muted);margin-top:0.2rem;display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center}
    .v-desc{font-size:0.875rem;color:var(--text);margin-bottom:0.75rem}
    .v-rec{font-size:0.875rem;color:var(--text);margin-top:0.5rem}
    .v-rec strong{color:var(--accent)}
    .swatch{width:1.5rem;height:1.5rem;border-radius:0.25rem;border:1px solid var(--border);display:inline-block;vertical-align:middle;flex-shrink:0}
    .contrast-row{display:flex;align-items:center;gap:0.625rem;padding:0.625rem 0.75rem;background:var(--bg-code);border:1px solid var(--border);border-radius:0.375rem;flex-wrap:wrap;font-size:0.75rem}
    .ado-pre{font-family:ui-monospace,monospace;font-size:0.72rem;white-space:pre-wrap;word-break:break-word;background:var(--bg-code);border:1px solid var(--border);border-radius:0.375rem;padding:0.75rem;color:var(--text)}
    .mas-table{width:100%;border-collapse:collapse;font-size:0.875rem}
    .mas-table th{text-align:left;padding:0.625rem 1rem;font-size:0.75rem;font-weight:600;color:var(--text-muted);border-bottom:1px solid var(--border)}
    .mas-table td{padding:0.625rem 1rem;border-bottom:1px solid var(--border)}
    .mas-table tr:last-child td{border-bottom:none}
    .mas-table tr:hover td{background:var(--row-hover)}
    .stat-card{background:var(--bg-card);border:1px solid var(--border);border-radius:0.5rem;padding:1.25rem;text-align:center}
    .stat-num{font-size:2rem;font-weight:800;line-height:1}
    .stat-label{font-size:0.7rem;font-weight:600;color:var(--text-muted);margin-top:0.25rem}
    .stat-icon{font-size:1.25rem;margin-bottom:0.375rem}
  </style>
</head>
<body>
  <header style="background:var(--bg-card);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:50">
    <div style="max-width:1200px;margin:0 auto;padding:0.75rem 1.5rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:0.75rem;flex:1;min-width:0">
        <i class="fa-solid fa-shield-halved fa-lg accent-text"></i>
        <div>
          <h1 style="font-size:1rem;font-weight:700;margin:0;line-height:1.2">Accessibility Report</h1>
          <p class="muted" style="font-size:0.7rem;margin:0">
            <i class="fa-solid fa-globe" style="margin-right:0.25rem"></i>{{SCAN_URL}}
            &nbsp;&bull;&nbsp;
            <i class="fa-regular fa-clock" style="margin-right:0.25rem"></i>{{SCAN_DATE}}
            &nbsp;&bull;&nbsp;
            <i class="fa-solid fa-browser" style="margin-right:0.25rem"></i>{{SCAN_BROWSER}}
          </p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0">
        <label for="themePicker" class="muted" style="font-size:0.75rem">Theme</label>
        <select id="themePicker" onchange="setTheme(this.value)" style="min-width:7rem">
          <option value="default">Default</option>
          <option value="hc-black">HC Black</option>
          <option value="hc-white">HC White</option>
          <option value="aquatic">Aquatic</option>
          <option value="forest">Forest</option>
          <option value="sunset">Sunset</option>
          <option value="midnight">Midnight</option>
          <option value="corporate">Corporate</option>
        </select>
      </div>
    </div>
  </header>

  <main style="max-width:1200px;margin:0 auto;padding:1.5rem">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem">
      <div class="stat-card">
        <div class="stat-icon" style="color:#dc2626"><i class="fa-solid fa-circle-xmark"></i></div>
        <div class="stat-num" style="color:#dc2626">{{SEV1_COUNT}}</div>
        <div class="stat-label">Sev 1 &mdash; Block-ship</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="color:#d97706"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div class="stat-num" style="color:#d97706">{{SEV2_COUNT}}</div>
        <div class="stat-label">Sev 2 &mdash; Must-fix</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="color:#2563eb"><i class="fa-solid fa-circle-exclamation"></i></div>
        <div class="stat-num" style="color:#2563eb">{{SEV3_COUNT}}</div>
        <div class="stat-label">Sev 3 &mdash; Should-fix</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="color:#059669"><i class="fa-solid fa-circle-info"></i></div>
        <div class="stat-num" style="color:#059669">{{USABLE_COUNT}}</div>
        <div class="stat-label">Usable &mdash; Enhancement</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon muted"><i class="fa-solid fa-layer-group"></i></div>
        <div class="stat-num">{{TOTAL_COUNT}}</div>
        <div class="stat-label">Total Violations</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;overflow:hidden">
      <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0.5rem">
        <i class="fa-solid fa-table-list accent-text"></i>
        <h2 style="font-size:0.9rem;font-weight:700;margin:0">MAS Compliance by Mode</h2>
      </div>
      <div style="overflow-x:auto">
        <table class="mas-table">
          <thead>
            <tr>
              <th>Mode</th>
              <th>Standard</th>
              <th>Status</th>
              <th>Issues Found</th>
            </tr>
          </thead>
          <tbody>
            {{MAS_ROWS}}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="padding:0.75rem 1rem;margin-bottom:1rem;display:flex;flex-wrap:wrap;gap:0.625rem;align-items:center">
      <i class="fa-solid fa-filter muted"></i>
      <input id="searchInput" type="search" placeholder="Search violations..."
             oninput="applyFilters()" style="flex:1;min-width:160px"
             aria-label="Search violations">
      <select id="filterSeverity" onchange="applyFilters()" aria-label="Filter by severity">
        <option value="">All Severities</option>
        <option value="sev1">Sev 1 &mdash; Block-ship</option>
        <option value="sev2">Sev 2 &mdash; Must-fix</option>
        <option value="sev3">Sev 3 &mdash; Should-fix</option>
        <option value="usable">Usable</option>
      </select>
      <select id="filterType" onchange="applyFilters()" aria-label="Filter by type">
        <option value="">All Types</option>
        <option value="contrast">Contrast</option>
        <option value="color">Color Only</option>
        <option value="aria">ARIA</option>
        <option value="keyboard">Keyboard</option>
        <option value="interactive">Interactive</option>
        <option value="links">Links</option>
        <option value="modes">Modes</option>
        <option value="viewports">Viewports</option>
        <option value="visual">Visual</option>
      </select>
      <select id="filterMode" onchange="applyFilters()" aria-label="Filter by accessibility mode">
        <option value="">All Modes</option>
        <option value="Normal">Normal</option>
        <option value="HC Black">HC Black</option>
        <option value="HC White">HC White</option>
        <option value="Forced Colors">Forced Colors</option>
        <option value="Reduced Motion">Reduced Motion</option>
        <option value="200% Zoom">200% Zoom</option>
        <option value="Text Spacing">Text Spacing</option>
        <option value="Dark Mode">Dark Mode</option>
      </select>
      <select id="filterViewport" onchange="applyFilters()" aria-label="Filter by viewport">
        <option value="">All Viewports</option>
        <option value="1920x1080">1920x1080 Desktop</option>
        <option value="1366x768">1366x768 Desktop</option>
        <option value="2560x1440">2560x1440 Wide</option>
        <option value="768x1024">768x1024 Tablet</option>
        <option value="1024x768">1024x768 Tablet</option>
        <option value="320x568">320x568 Mobile</option>
        <option value="414x896">414x896 Mobile</option>
      </select>
      <span id="filterCount" class="muted" style="font-size:0.75rem;margin-left:auto" aria-live="polite"></span>
    </div>

    <section id="violationList" aria-label="Violation list">
      {{VIOLATION_CARDS}}
    </section>

    <p id="emptyState" class="hidden muted" style="text-align:center;padding:3rem 1rem">
      <i class="fa-solid fa-magnifying-glass" style="display:block;font-size:1.5rem;margin-bottom:0.5rem"></i>
      No violations match the current filters.
    </p>
  </main>

  <script>
    function setTheme(t) {
      document.documentElement.setAttribute('data-theme', t || 'default');
      try { localStorage.setItem('a11y-report-theme', t); } catch(e){}
    }
    (function() {
      try {
        var saved = localStorage.getItem('a11y-report-theme');
        if (saved) { document.getElementById('themePicker').value = saved; setTheme(saved); }
      } catch(e){}
    })();

    function applyFilters() {
      var q    = (document.getElementById('searchInput').value || '').toLowerCase();
      var sev  = document.getElementById('filterSeverity').value;
      var type = document.getElementById('filterType').value;
      var mode = document.getElementById('filterMode').value;
      var vp   = document.getElementById('filterViewport').value;
      var cards = document.querySelectorAll('.v-card');
      var visible = 0;
      cards.forEach(function(card) {
        var text = card.textContent.toLowerCase();
        var show =
          (!q    || text.includes(q)) &&
          (!sev  || card.dataset.severity  === sev)  &&
          (!type || card.dataset.type      === type) &&
          (!mode || card.dataset.mode      === mode) &&
          (!vp   || card.dataset.viewport  === vp);
        card.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      var count = document.getElementById('filterCount');
      count.textContent = visible + ' of ' + cards.length + ' violation' + (cards.length !== 1 ? 's' : '');
      document.getElementById('emptyState').classList.toggle('hidden', visible > 0 || cards.length === 0);
    }

    function copyAdo(id) {
      var text = document.getElementById('ado-text-' + id).textContent;
      var btn = document.getElementById('copy-btn-' + id);
      var orig = btn.innerHTML;
      navigator.clipboard.writeText(text).then(function() {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
        setTimeout(function() { btn.innerHTML = orig; }, 2000);
      }).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
        setTimeout(function() { btn.innerHTML = orig; }, 2000);
      });
    }

    function copyPrompt(id) {
      var text = document.getElementById('prompt-text-' + id).textContent.trim();
      var btn  = document.getElementById('prompt-btn-' + id);
      var orig = btn.innerHTML;
      function done() {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
        setTimeout(function() { btn.innerHTML = orig; }, 2000);
      }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(done).catch(function() {
          var ta = document.createElement('textarea');
          ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta); done();
        });
      }
    }

    applyFilters();
  </script>
</body>
</html>
```

---

## Token Reference

### `{{SCAN_TITLE}}`
Short page or product title. Example: `Dashboard — localhost:3000`

### `{{SCAN_URL}}`
Full URL or path scanned. Example: `http://localhost:3000/dashboard`

### `{{SCAN_DATE}}`
Formatted timestamp. Example: `2026-05-15 14:32`

### `{{SCAN_BROWSER}}`
Browser used, or `"Static analysis"` if no browser was used.

### Counts
Integer counts: `{{SEV1_COUNT}}`, `{{SEV2_COUNT}}`, `{{SEV3_COUNT}}`, `{{USABLE_COUNT}}`, `{{TOTAL_COUNT}}`

---

### `{{MAS_ROWS}}`

One `<tr>` per mode. Replace `STATUS_CLASS` with `badge-pass`, `badge-fail`, or `badge-not-tested`.

```html
<tr>
  <td style="font-weight:500">Normal</td>
  <td class="muted" style="font-size:0.75rem">Baseline</td>
  <td><span class="badge STATUS_CLASS">STATUS_LABEL</span></td>
  <td style="font-size:0.875rem">ISSUE_COUNT</td>
</tr>
<tr>
  <td style="font-weight:500">HC Black</td>
  <td class="muted" style="font-size:0.75rem">MAS 4.3.1</td>
  <td><span class="badge STATUS_CLASS">STATUS_LABEL</span></td>
  <td style="font-size:0.875rem">ISSUE_COUNT</td>
</tr>
<tr>
  <td style="font-weight:500">HC White</td>
  <td class="muted" style="font-size:0.75rem">MAS 4.3.1</td>
  <td><span class="badge STATUS_CLASS">STATUS_LABEL</span></td>
  <td style="font-size:0.875rem">ISSUE_COUNT</td>
</tr>
<tr>
  <td style="font-weight:500">Forced Colors</td>
  <td class="muted" style="font-size:0.75rem">MAS 1.4.1</td>
  <td><span class="badge STATUS_CLASS">STATUS_LABEL</span></td>
  <td style="font-size:0.875rem">ISSUE_COUNT</td>
</tr>
<tr>
  <td style="font-weight:500">Reduced Motion</td>
  <td class="muted" style="font-size:0.75rem">MAS 2.3.3</td>
  <td><span class="badge STATUS_CLASS">STATUS_LABEL</span></td>
  <td style="font-size:0.875rem">ISSUE_COUNT</td>
</tr>
<tr>
  <td style="font-weight:500">200% Zoom</td>
  <td class="muted" style="font-size:0.75rem">MAS 1.4.4</td>
  <td><span class="badge STATUS_CLASS">STATUS_LABEL</span></td>
  <td style="font-size:0.875rem">ISSUE_COUNT</td>
</tr>
<tr>
  <td style="font-weight:500">Text Spacing</td>
  <td class="muted" style="font-size:0.75rem">MAS 1.4.12</td>
  <td><span class="badge STATUS_CLASS">STATUS_LABEL</span></td>
  <td style="font-size:0.875rem">ISSUE_COUNT</td>
</tr>
<tr>
  <td style="font-weight:500">Dark Mode</td>
  <td class="muted" style="font-size:0.75rem">Recommended</td>
  <td><span class="badge STATUS_CLASS">STATUS_LABEL</span></td>
  <td style="font-size:0.875rem">ISSUE_COUNT</td>
</tr>
```

---

### `{{VIOLATION_CARDS}}`

One article per violation, sorted by severity (sev1 first). Use this template:

```html
<article class="v-card"
  data-severity="SEVERITY"
  data-type="TYPE"
  data-mode="MODE"
  data-viewport="VIEWPORT"
  aria-label="VIOLATION_TITLE">

  <div class="v-card-header">
    <span class="badge BADGE_CLASS">SEVERITY_LABEL</span>
    <div style="flex:1;min-width:0">
      <p class="v-title">VIOLATION_TITLE</p>
      <div class="v-meta">
        <span>LOCATION</span>
        <span>CRITERION</span>
        <span class="TYPE_CSS_CLASS">TYPE_LABEL</span>
      </div>
    </div>
  </div>

  <div class="v-card-body">
    <p class="v-desc">DESCRIPTION</p>

    <!-- CONTRAST SWATCH — only when type="contrast" -->
    <div class="contrast-row" style="margin-bottom:0.75rem">
      <span class="swatch" style="background:FG_COLOR" title="FG_COLOR" aria-hidden="true"></span>
      <span class="muted">FG_COLOR</span>
      <span class="muted">on</span>
      <span class="swatch" style="background:BG_COLOR" title="BG_COLOR" aria-hidden="true"></span>
      <span class="muted">BG_COLOR</span>
      <span style="font-family:ui-monospace,monospace;font-weight:700;color:#dc2626">RATIO:1</span>
      <span class="muted">required</span>
      <span style="font-family:ui-monospace,monospace;font-weight:700">REQUIRED_RATIO:1</span>
      <span class="badge badge-fail" style="margin-left:auto">FAIL</span>
    </div>

    <!-- Code snippet — only when currentCode is available -->
    <details style="margin-bottom:0.75rem">
      <summary>Current code</summary>
      <pre class="code-block" style="margin-top:0.5rem"><code>CURRENT_CODE</code></pre>
    </details>

    <p class="v-rec"><strong>Recommendation:</strong> RECOMMENDATION</p>

    <div style="border-top:1px solid var(--border);margin-top:0.875rem;padding-top:0.75rem">
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <button onclick="document.getElementById('ado-section-VID').classList.toggle('hidden')"
          class="accent-btn" id="ado-toggle-VID">
          ADO Bug Template
        </button>
        <button id="copy-btn-VID" onclick="copyAdo('VID')"
          style="background:none;border:1px solid var(--border);cursor:pointer;border-radius:0.375rem;padding:0.25rem 0.625rem;font-size:0.72rem;color:var(--text-muted);display:inline-flex;align-items:center;gap:0.3rem"
          aria-label="Copy ADO bug template to clipboard">
          Copy for ADO
        </button>
        <button id="prompt-btn-VID" onclick="copyPrompt('VID')"
          style="background:none;border:1px solid var(--border);cursor:pointer;border-radius:0.375rem;padding:0.25rem 0.625rem;font-size:0.72rem;color:var(--text-muted);display:inline-flex;align-items:center;gap:0.3rem"
          aria-label="Copy AI fix prompt to clipboard">
          Copy Fix Prompt
        </button>
      </div>
      <div id="ado-section-VID" class="hidden" style="margin-top:0.625rem">
        <pre id="ado-text-VID" class="ado-pre">ADO_TEMPLATE_TEXT</pre>
      </div>
      <pre id="prompt-text-VID" style="display:none" aria-hidden="true">AI_FIX_PROMPT</pre>
    </div>
  </div>
</article>
```

---

### ADO Template Text Format

```
Title: [Accessibility][SEVERITY_LABEL] VIOLATION_TITLE — CRITERION

Tags: Accessibility; SEVERITY_LABEL; CRITERION_TAG; TYPE_LABEL

Description:

## Summary
DESCRIPTION

## Location
LOCATION

## Steps to Reproduce
1. Navigate to: SCAN_URL
2. REPRODUCTION_STEPS

## Expected Result
EXPECTED_RESULT

## Actual Result
ACTUAL_RESULT

## Recommended Fix
RECOMMENDATION

## WCAG / MAS Reference
- CRITERION — CRITERION_FULL_NAME

## Additional Context
Report generated: SCAN_DATE
```

---

### AI Fix Prompt Format

```
Fix the following accessibility violation in my codebase.

File: FILE_PATH, line LINE_NUMBER
Issue: VIOLATION_TITLE
Standard: CRITERION_FULL_NAME
Severity: SEVERITY_LABEL

Current code:
  CURRENT_CODE_SNIPPET

Fix required:
RECOMMENDATION (written as a clear instruction)

Requirements:
- KEY_REQUIREMENT_1
- KEY_REQUIREMENT_2
- Apply the fix only to FILE_PATH

Apply the fix directly to the file. Do not add comments unless the logic is non-obvious.
```

---

## Step 4 — Confirm and Report

After writing the file, report:

```
Report saved: OUTPUT_FOLDER/accessibility-report.html

  Total violations  : TOTAL_COUNT
  Sev 1 (block-ship): SEV1_COUNT
  Sev 2 (must-fix)  : SEV2_COUNT
  Sev 3 (should-fix): SEV3_COUNT
  Usable            : USABLE_COUNT

Open the file in any browser to view filterable results with ADO templates.
```

## Handling No Violations

If no violations were found, generate the report with all counts as 0 and include:

```html
<div class="card" style="padding:2.5rem;text-align:center">
  <i class="fa-solid fa-circle-check" style="font-size:2rem;color:#059669;display:block;margin-bottom:0.75rem"></i>
  <p style="font-weight:600;font-size:1rem;margin:0 0 0.25rem">No violations found</p>
  <p class="muted" style="font-size:0.875rem;margin:0">All accessibility checks passed for the scanned scope.</p>
</div>
```

## Typical Workflow

```
skills/a11y/scan.md http://localhost:3000         → collects axe violations
skills/a11y/review-contrast.md src/               → collects contrast violations
skills/a11y/review-color.md src/                  → collects color-only violations
skills/a11y/review-modes.md src/                  → collects MAS mode violations
skills/a11y/review-viewports.md src/              → collects viewport violations
skills/a11y/review-interactive.md <url>           → collects interactive failures
skills/a11y/report-gen.md                         → generates accessibility-report.html
```
