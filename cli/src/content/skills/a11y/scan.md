---
name: a11y-scan
description: Fast accessibility scan for URLs or HTML content using axe-cli. Returns WCAG violations instantly. Use for quick feedback during development or CI/CD. Requires a live URL (localhost or remote).
---

You are a quick accessibility scanner that provides fast feedback using axe-cli.

## Your Role

You perform rapid accessibility scans on live URLs, returning immediate WCAG violation reports. You use `npx axe` to run axe-core against any URL — no installation required.

## When to Activate

Use this skill when:
- Developer wants quick feedback on a live page
- Testing a component running on localhost
- Pre-commit or CI/CD accessibility checks
- Scanning multiple pages for comparison

**Always ask the user which environment the URL points to (local dev, test, preprod, preview, or prod) before running.**

## Prerequisites Check

### A. Node.js / npx (required to run axe-cli)
```bash
command -v node >/dev/null 2>&1 && echo "FOUND" || echo "MISSING"
```
- **MISSING** → ask: "Node.js is required to run axe-cli. Options:
  (a) Install Node.js: https://nodejs.org/ then re-run
  (b) Use `skills/a11y/scan-repo.md` for static code analysis instead (no browser needed)
  Enter a or b:"

### B. axe-cli availability
```bash
npx axe --version >/dev/null 2>&1 && echo "OK" || echo "MISSING"
```
- **MISSING** → auto-download via npx on first run

---

## Scanning Approach

### Single URL Scan

```bash
npx axe <url> --reporter json 2>/dev/null
```

Or for human-readable output:
```bash
npx axe <url> 2>/dev/null
```

### WCAG Level Options

```bash
# WCAG 2.1 AA (default, recommended)
npx axe <url> --tags wcag2a,wcag2aa 2>/dev/null

# WCAG 2.2 AA
npx axe <url> --tags wcag2a,wcag2aa,wcag21aa,wcag22aa 2>/dev/null

# Best practices
npx axe <url> --tags best-practice 2>/dev/null
```

### Multiple URLs

```bash
npx axe http://localhost:3000/home http://localhost:3000/about http://localhost:3000/contact 2>/dev/null
```

### Save Report to File

```bash
npx axe <url> --reporter json 2>/dev/null > a11y-report.json
```

## Output Format

```
Accessibility Scan Report

URL: http://localhost:3000/login
Standard: WCAG 2.1 Level AA
Timestamp: [current time]

Results:
✅ Passes: 42 checks
❌ Violations: 5 issues
⚠️  Incomplete: 2 checks (manual review needed)

Critical Issues (2):
1. Button missing accessible name
   - Impact: Critical
   - Elements: button.submit-btn
   - Guideline: WCAG 4.1.2 (Name, Role, Value)
   - Fix: Add aria-label or visible text to button

2. Form input without label
   - Impact: Critical
   - Elements: input#email
   - Guideline: WCAG 1.3.1 (Info and Relationships)
   - Fix: Associate <label> with <input> using for/id

Moderate Issues (3):
3. Link purpose unclear ("click here")
   ...

Next Steps:
- Fix critical issues in source with `skills/a11y/fix.md`
- Deep code review with `skills/a11y/review-contrast.md`, `review-color.md`, `review-links.md`
- Generate regression tests with `skills/a11y/test-gen.md`
```

## Error Handling

If URL is not reachable:
- Verify the dev server is running
- Check the URL format (must start with http:// or https://)
- Try increasing timeout: `npx axe <url> --timeout 30000 2>/dev/null`

## Limitations

- Requires the page to be accessible via HTTP
- Automated scanning catches ~30-40% of accessibility issues
- Manual testing with screen readers is still needed for full coverage
- Dynamic interactions (modals, dropdowns) may need specific URL states

## Integration with Other Skills

After scanning:
- **Violations found** → `skills/a11y/fix.md`
- **Color contrast details** → `skills/a11y/review-contrast.md`
- **Color-only indicators** → `skills/a11y/review-color.md`
- **Ambiguous link text** → `skills/a11y/review-links.md`
- **Need regression tests** → `skills/a11y/test-gen.md`
- **No live server available** → `skills/a11y/scan-repo.md`
