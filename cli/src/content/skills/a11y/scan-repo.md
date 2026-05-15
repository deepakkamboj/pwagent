---
name: a11y-scan-repo
description: Static accessibility scan of a local repository path — no live URL or running server required. Detects 11+ WCAG criteria via regex patterns across TypeScript, React, HTML, CSS, and Markdown files. Complements scan.md (which needs a live URL). Use for CI gates, pre-commit checks, or scanning codebases that cannot run locally.
---

Static WCAG scan of a local repository. Finds accessibility violations via pattern matching — no running server needed.

## Usage

```
Invoke with a local directory or file path to scan (defaults to `.` if omitted).
```

Argument: `$ARGUMENTS` — local directory or file path to scan

---

## Step 1: Inventory Files

Count files in scope by type:

```bash
find $ARGUMENTS -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" -o -name "*.html" -o -name "*.md" -o -name "*.css" -o -name "*.scss" -o -name "*.svg" \) 2>/dev/null | sort
```

Report file counts by type before scanning.

---

## Step 2: Run Pattern Searches

Run all checks in parallel. For each criterion, record: **file path**, **line number**, **offending code snippet**.

---

### Check A — WCAG 1.1.1 Non-text Content: Missing or empty alt text

**Images with empty alt in HTML/JSX:**
```bash
grep -rn "alt=\"\"" $ARGUMENTS --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null
```

**Images with generic alt text:**
```bash
grep -rn -E 'alt="(image|img|photo|picture|icon|logo|banner|graphic|figure)["\s]' $ARGUMENTS --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null
```

**`<img>` tags missing `alt` entirely:**
```bash
grep -rn -P '<img(?![^>]*\balt=)[^>]*/>' $ARGUMENTS --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null
```

**Markdown images with empty alt:**
```bash
grep -rn "!\[\](" $ARGUMENTS --include="*.md" 2>/dev/null
```

---

### Check B — WCAG 1.2.2 Captions (Prerecorded): Video without track element

```bash
grep -rn "<video" $ARGUMENTS --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null | grep -v "<track"
```

Confirm each `<video>` match has a nearby `<track kind="captions"` or `<track kind="subtitles"` — flag those that do not.

---

### Check C — WCAG 1.3.1 Info and Relationships: Heading hierarchy jumps

Extract all heading usages and check for skipped levels (e.g., H2 → H4):

```bash
grep -rn -E "<h[1-6]|<H[1-6]" $ARGUMENTS --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null
```

```bash
grep -rn -E "^#{1,6} " $ARGUMENTS --include="*.md" 2>/dev/null
```

Flag sequences where the heading level jumps by more than 1 (e.g., H1 → H3, H2 → H5).

---

### Check D — WCAG 1.3.1 Info and Relationships: Tables without headers

**HTML tables missing `<th>` or `scope`:**
```bash
grep -rn -A5 "<table" $ARGUMENTS --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null | grep -v "<th"
```

---

### Check E — WCAG 1.4.1 Use of Color: Color-only status/error indicators

```bash
grep -rn -E "(color|colour)-(red|green|yellow|error|success|warning|danger)" $ARGUMENTS --include="*.tsx" --include="*.jsx" --include="*.ts" 2>/dev/null
```

Flag where color is the only distinguishing property — check for absence of `role="alert"`, icon, or text label nearby.

---

### Check F — WCAG 2.1.1 Keyboard: Clickable divs/spans not keyboard accessible

```bash
grep -rn "onClick" $ARGUMENTS --include="*.tsx" --include="*.jsx" 2>/dev/null | grep -E "<div|<span" | grep -v -E "role=|onKeyDown|onKeyPress|onKeyUp|tabIndex"
```

```bash
grep -rn 'href="#"' $ARGUMENTS --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null
```

---

### Check G — WCAG 2.4.4 Link Purpose: Generic link text

```bash
grep -rn -iE '>(click here|read more|here|more|learn more|this link|continue|details|info)<' $ARGUMENTS --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.md" 2>/dev/null
```

---

### Check H — WCAG 3.1.1 Language of Page: Missing lang attribute

```bash
grep -rn "<html" $ARGUMENTS --include="*.html" --include="*.tsx" --include="*.jsx" 2>/dev/null | grep -v "lang="
```

---

### Check I — WCAG 4.1.2 Name, Role, Value: Icon-only buttons without accessible name

```bash
grep -rn "<button" $ARGUMENTS --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null | grep -v -E "aria-label=|aria-labelledby=|title="
```

---

### Check J — WCAG 4.1.3 Status Messages: Dynamic content without aria-live

Flag files that have `useState`/`setState` for error/success/loading states but **no** `aria-live` region in the same file.

```bash
grep -rn -E "useState|setState|setError|setSuccess|setLoading" $ARGUMENTS --include="*.tsx" --include="*.ts" 2>/dev/null
grep -rn -E "aria-live|role=\"status\"|role=\"alert\"|role=\"log\"" $ARGUMENTS --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null
```

---

### Check K — WCAG 1.3.1 / 4.1.2: Form inputs without label association

```bash
grep -rn "<input\|<textarea\|<select" $ARGUMENTS --include="*.tsx" --include="*.jsx" --include="*.html" 2>/dev/null | grep -v -E "type=\"hidden\"|aria-label=|aria-labelledby=|id="
```

Cross-check: for every `<input id="X">`, verify a `<label for="X">` or `htmlFor="X"` exists in the same file.

---

## Step 3: Analyse Results and Build Report

**Severity mapping:**

| Check | WCAG | Severity |
|-------|------|----------|
| Missing alt | 1.1.1 | Critical |
| Video without captions | 1.2.2 | Critical |
| Icon button no name | 4.1.2 | Critical |
| Input without label | 1.3.1 / 4.1.2 | Critical |
| Generic link text | 2.4.4 | Serious |
| Clickable div no keyboard | 2.1.1 | Serious |
| Missing lang attribute | 3.1.1 | Serious |
| Dynamic content no aria-live | 4.1.3 | Serious |
| Heading hierarchy jump | 1.3.1 | Moderate |
| Table without header | 1.3.1 | Moderate |
| Color-only indicator | 1.4.1 | Moderate |

---

## Step 4: Output Report

```markdown
## Static Accessibility Scan — <$ARGUMENTS>

**Scanned:** <N> files  (.tsx: N, .html: N, .css: N, .md: N)
**Total violations:** <N>  |  🔴 Critical: N  |  🟠 Serious: N  |  🟡 Moderate: N

---

### 🔴 Critical Issues

#### WCAG 1.1.1 — Missing alt text (<N> instances)
| File | Line | Code |
|------|------|------|
| src/components/Avatar.tsx | 12 | `<img src={url} />` |

**Fix:** Add descriptive `alt` attribute. Use `alt=""` only for decorative images.

---

### Next Steps
- Fix critical issues: `skills/a11y/fix.md <file>`
- Verify color contrast: `skills/a11y/review-contrast.md <path>`
- Check color-only indicators: `skills/a11y/review-color.md <path>`
- Review link text: `skills/a11y/review-links.md <path>`
- Generate regression tests: `skills/a11y/test-gen.md <path>`
- Full runtime scan (requires running server): `skills/a11y/scan.md <url>`
```

If no violations are found:

```markdown
✅ No violations detected in static scan of <$ARGUMENTS>

Automated static scanning catches ~40% of WCAG issues. Run `skills/a11y/scan.md <url>` with a live server for runtime violations.
```
