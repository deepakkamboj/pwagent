# Accessibility Skills

> **Skill pack index.** The coordinator injects the relevant individual skills automatically based on your prompt. Individual files in this directory handle scan, review, fix, test-gen, report-gen, and interactive testing.

---

## Skills in this pack

| Skill file | What it does |
|---|---|
| [scan.md](scan.md) | Run axe-cli against a URL — quick automated WCAG 2.1 AA scan |
| [scan-repo.md](scan-repo.md) | Batch-scan all pages/routes in a repo or dev server |
| [review-contrast.md](review-contrast.md) | WCAG 1.4.3 / 1.4.11 — extract colors, check ratios (4.5:1 normal, 3:1 large/UI), fix |
| [review-color.md](review-color.md) | WCAG 1.4.1 — detect color-only indicators (errors, links, required fields) |
| [review-links.md](review-links.md) | WCAG 2.4.4 — generic/ambiguous link text ("click here", "read more") |
| [review-modes.md](review-modes.md) | MAS 8 modes — High Contrast, Forced Colors, Reduced Motion, 200% Zoom, Text Spacing, Dark Mode |
| [review-viewports.md](review-viewports.md) | 7 standard viewports (320px–2560px) — overflow, breakpoints, touch targets |
| [review-interactive.md](review-interactive.md) | 9 interactive element types — Playwright test template with axe-core per element |
| [fix.md](fix.md) | Auto-fix violations — adds ARIA attributes, label associations, live regions, semantic HTML |
| [verify-fix.md](verify-fix.md) | Post-fix axe scan — confirms violation gone, checks for regressions, updates ADO bug |
| [test-gen.md](test-gen.md) | Generate Playwright accessibility test files (forms, modals, navigation, full page) |
| [report-gen.md](report-gen.md) | Generate self-contained HTML report with 8 themes, severity counts, ADO bug templates |
| [dev.md](dev.md) | Developer-loop guidance — integrate axe-core into tests, CI setup, ARIA patterns |

## Knowledge files

| File | Contents |
|---|---|
| [MAS.md](MAS.md) | Microsoft Accessibility Standards — MAS vs WCAG table, Narrator/UIA requirements, High Contrast, Fluent 2, touch targets |
| [narrator-patterns.md](narrator-patterns.md) | 10 Windows Narrator fix patterns — field labels, required fields, validation errors, button states, expand/collapse, live regions, spinners, tabs, comboboxes, icon buttons |

---

## Quick scan reference

```typescript
// Install: npm install -D @axe-core/playwright
import AxeBuilder from '@axe-core/playwright';

// Full page scan
const results = await new AxeBuilder({ page }).analyze();
expect(results.violations).toEqual([]);

// Scoped scan — only the main content area
const results = await new AxeBuilder({ page }).include('#main-content').analyze();

// WCAG AA only
const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

// Exclude known issues during migration
const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();

// Playwright 1.59+: capture the accessibility tree for the whole page
const pageTree = await page.ariaSnapshot();

// Or scope it to one region
const dialogTree = await page.getByRole('dialog', { name: 'Checkout' }).ariaSnapshot();
```

---

## Patterns

### ARIA Snapshots For Structure Checks

**Use when**: You want to verify the accessibility tree shape of a page, region, dialog, or widget in addition to running axe.
**Avoid when**: You only need rule-based WCAG checks. Start with axe for broad coverage, then use ARIA snapshots for high-value structure assertions.

Playwright 1.59 adds `page.ariaSnapshot()` as a shortcut for capturing the page-level accessibility tree, and expands `locator.ariaSnapshot()` with more control over depth and snapshot mode. This is useful for menus, dialogs, composite widgets, and other components where semantic structure matters as much as raw DOM shape.

**TypeScript**
```typescript
import { test, expect } from '@playwright/test';

test('checkout dialog exposes the expected accessibility structure', async ({ page }) => {
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Open checkout' }).click();

  const dialogTree = await page
    .getByRole('dialog', { name: 'Checkout' })
    .ariaSnapshot();

  expect(dialogTree).toContain('heading "Checkout"');
  expect(dialogTree).toContain('button "Apply coupon"');
});
```

**Snapshot options**

When the full accessibility tree is too noisy, use the newer options to limit the result to the level of detail you actually care about.

```typescript
const menuTree = await page.getByRole('menu', { name: 'Account' }).ariaSnapshot({
  depth: 2,
});

const summaryTree = await page.getByRole('dialog', { name: 'Checkout' }).ariaSnapshot({
  mode: 'summary',
});
```

Use smaller snapshots for stable assertions. Deep full-tree snapshots are powerful, but they can become brittle if the component structure changes often.

**JavaScript**
```javascript
const { test, expect } = require('@playwright/test');

test('checkout dialog exposes the expected accessibility structure', async ({ page }) => {
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Open checkout' }).click();

  const dialogTree = await page
    .getByRole('dialog', { name: 'Checkout' })
    .ariaSnapshot();

  expect(dialogTree).toContain('heading "Checkout"');
  expect(dialogTree).toContain('button "Apply coupon"');
});
```

### axe-core/playwright Integration

**Use when**: You want automated WCAG violation detection on any page or component. This is your first line of defense and should run in every test suite.
**Avoid when**: You need to verify subjective UX quality (reading order, cognitive load, plain language). axe-core catches structural violations, not usability problems.

axe-core detects roughly 30–40% of WCAG issues automatically. That includes the most common and egregious violations: missing alt text, broken label associations, invalid ARIA, and contrast failures. Catching these automatically frees you to spend manual effort on the harder problems.

**TypeScript**
```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('accessibility', () => {
  test('home page has no accessibility violations', async ({ page }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test('dashboard has no accessibility violations after login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('/dashboard');

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test('report violations with helpful details on failure', async ({ page }) => {
    await page.goto('/products');

    const results = await new AxeBuilder({ page }).analyze();

    const violationSummary = results.violations.map((v) => ({
      rule: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
      help: v.helpUrl,
    }));

    expect(results.violations, JSON.stringify(violationSummary, null, 2)).toEqual([]);
  });
});
```

**JavaScript**
```javascript
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.describe('accessibility', () => {
  test('home page has no accessibility violations', async ({ page }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
});
```

### Keyboard Navigation Testing

**Use when**: You need to verify keyboard operability of interactive elements — navigation, forms, modals, and custom widgets.

```typescript
test('form is keyboard navigable', async ({ page }) => {
  await page.goto('/contact');

  // Tab through form fields
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Name')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Message')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Send' })).toBeFocused();
});

test('modal traps focus', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open dialog' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Tab through all focusable elements — every one should stay inside the modal
  const focusable = dialog.locator('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const count = await focusable.count();

  for (let i = 0; i < count + 2; i++) {
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    const inside = await focused.evaluate(
      (el, modal) => modal.contains(el),
      await dialog.elementHandle()
    );
    expect(inside).toBe(true);
  }
});
```

### Screen Reader Semantics

**Use when**: You need to verify that ARIA roles, labels, and live regions are implemented correctly for screen reader compatibility.

```typescript
test('error message is announced to screen readers', async ({ page }) => {
  await page.goto('/signup');

  // Submit with empty required field
  await page.getByRole('button', { name: 'Create account' }).click();

  // Error must be in a live region or role="alert"
  const error = page.locator('[role="alert"], [aria-live]');
  await expect(error).toBeVisible();

  // Input must reference error via aria-describedby
  const emailInput = page.getByLabel('Email');
  await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await emailInput.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
});

test('loading state is announced', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Refresh' }).click();

  // Loading indicator must have a role and text
  const spinner = page.locator('[role="status"], [role="progressbar"]');
  await expect(spinner).toBeVisible();
  const label = await spinner.getAttribute('aria-label');
  expect(label).toBeTruthy();
});
```

### CI Setup

Add to `playwright.config.ts` to run accessibility tests in a separate project:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'accessibility',
      testDir: './tests/accessibility',
      use: {
        workers: 1,
        screenshot: 'only-on-failure',
      },
    },
  ],
});
```

Run in CI:

```bash
npx playwright test --project=accessibility
```
