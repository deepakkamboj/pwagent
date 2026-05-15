# Microsoft Accessibility Standards (MAS) — Quick Reference

> **Pre-flight resource.** Read this file before performing any accessibility fix on Microsoft Power Platform or Dynamics 365 code. MAS is the authoritative standard — it overrides WCAG 2.1 AA where stricter.
>
> Full MAS document: https://microsoft.sharepoint.com/sites/accessibility/SitePages/Microsoft-Accessibility-Standards-(MAS).aspx

---

## MAS vs WCAG

MAS adopts all WCAG 2.1 Level AA requirements as the baseline and adds Microsoft-specific requirements on top. When MAS and WCAG differ, MAS takes precedence.

| Area | WCAG | MAS |
|------|------|-----|
| Contrast (normal text) | 4.5:1 | 4.5:1 |
| Contrast (large text) | 3:1 | 4.5:1 (**stricter**) |
| Contrast (UI components) | 3:1 | 3:1 |
| Focus indicator | Any visible change | Minimum 3:1 contrast ratio against adjacent color |
| Touch targets | Not specified | Minimum 44×44 px |
| Screen reader | WCAG 4.1.2 | Windows Narrator + NVDA tested |

---

## Windows Narrator / UIA Compatibility

Narrator uses **UI Automation (UIA)** — not the accessibility tree that browser screen readers use. Some WCAG-compliant patterns are still announced incorrectly by Narrator.

### What Narrator Requires Beyond WCAG

**1. Proper UIA control types via ARIA roles**

| UI Element | HTML Element | Required ARIA |
|-----------|--------------|---------------|
| Text field | `<input type="text">` | `<label>` or `aria-label` (not placeholder) |
| Required field | `<input required>` | `aria-required="true"` (explicit, not just `required`) |
| Error state | Red border only | `aria-invalid="true"` + `aria-describedby` → error message |
| Validation error | Inline text | `role="alert"` or `aria-live="assertive"` |
| Loading state | Spinner icon | `role="status"` with text, or `aria-live="polite"` |
| Toggle button | `<button>` | `aria-pressed="true/false"` |
| Disclosure | `<button>` expand/collapse | `aria-expanded="true/false"` |
| Tab | Custom div | `role="tab"` + `aria-selected` |
| Combobox | Custom select | `role="combobox"` + `aria-expanded` + `aria-activedescendant` |

**2. Placeholder text is NOT announced as a label**

❌ Narrator does not announce `placeholder` as the field's accessible name.

```tsx
// WRONG — Narrator announces no label
<input type="email" placeholder="Enter your email" />

// CORRECT — Narrator announces "Email, edit text"
<label htmlFor="email">Email</label>
<input type="email" id="email" placeholder="Enter your email" />
```

**3. Validation errors must be programmatically associated**

```tsx
// WRONG — Narrator sees red border but announces nothing
<input type="text" className="error" />
<span className="error-text">This field is required</span>

// CORRECT — Narrator announces "Name, required, invalid entry, This field is required"
<input
  type="text"
  id="name"
  aria-required="true"
  aria-invalid="true"
  aria-describedby="name-error"
/>
<span id="name-error" role="alert">This field is required</span>
```

**4. Button states must be announced**

```tsx
// WRONG — Narrator announces "Save, button" regardless of state
<button className={isSaving ? 'saving' : ''}>Save</button>

// CORRECT — Narrator announces "Save, button, pressed" when active
<button aria-pressed={isSaving}>Save</button>
```

---

## Windows High Contrast Mode

Power Platform must render correctly in Windows High Contrast Mode (black and white themes). High Contrast overrides CSS colors — only `currentColor`, `ButtonText`, `ButtonFace`, `WindowText`, `Window`, `Highlight`, `HighlightText`, `GrayText` system colors are available.

### Rules

1. **Never rely on background color alone** to convey state (active, selected, disabled)
2. **Never use `box-shadow` as the only focus indicator** — it disappears in High Contrast
3. **Always provide a border or outline** for interactive elements:

```css
/* WRONG — invisible in High Contrast */
.button:focus {
  box-shadow: 0 0 0 2px #0078d4;
}

/* CORRECT — visible in all contrast modes */
.button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
```

4. **Use `forced-colors` media query** for High Contrast-specific overrides:

```css
@media (forced-colors: active) {
  .custom-checkbox::before {
    border-color: ButtonText;
    background-color: ButtonFace;
  }
  .custom-checkbox:checked::before {
    background-color: Highlight;
  }
}
```

5. **SVG icons** must use `currentColor` or `forced-colors`-aware fills:

```tsx
// WRONG — invisible in High Contrast
<svg><path fill="#0078d4" .../></svg>

// CORRECT
<svg><path fill="currentColor" .../></svg>
```

---

## Text Scaling (100%–225%)

MAS requires the UI to remain functional when Windows text size is set to 100%–225%.

### Rules

1. **Never use fixed `px` for font sizes** in interactive or content areas — use `rem` or `em`
2. **Never clip or overlap text** when font size increases
3. **Never hide overflow** on containers that contain text:

```css
/* WRONG */
.label { white-space: nowrap; overflow: hidden; }

/* CORRECT */
.label { white-space: normal; overflow: visible; }
```

4. **Touch targets must remain ≥44×44 px** at all scaling levels

---

## Fluent 2 / Fluent UI Component Patterns

When working in Dynamics 365 or Power Platform, prefer Fluent 2 components — they are pre-built with MAS compliance.

| Component | Import | Notes |
|-----------|--------|-------|
| Button | `@fluentui/react-components` `<Button>` | Use `appearance="primary/secondary"`, never custom div |
| Text input | `<Input>` + `<Label>` | Always pair with `<Label>` |
| Combobox | `<Combobox>` | Handles UIA correctly |
| Checkbox | `<Checkbox>` | Do NOT use custom checkbox |
| Dialog/Modal | `<Dialog>` | Focus trap and Escape built in |
| Tooltip | `<Tooltip>` | Accessible via keyboard and Narrator |
| Tabs | `<TabList>` + `<Tab>` | Correct `role="tablist"` / `role="tab"` |
| Spinner | `<Spinner>` | Includes `role="progressbar"` and `aria-label` |

**Do not wrap Fluent components with `aria-hidden`** — this suppresses Narrator completely.

---

## Touch Accessibility (Power Apps / Power Pages)

- Touch targets: minimum **44×44 px** (MAS) — prefer 48×48 px
- Provide alternatives for swipe gestures (button equivalent)
- Do not rely on hover-only interactions for mobile

---

## PR Documentation Requirement

When fixing a Narrator/screen reader bug, the PR description **must include**:

```
## Screen Reader Impact
**Before:** [describe what Narrator announced, or did not announce]
**After:** Narrator will now announce: "[exact announcement text]"
Tested with: Windows Narrator / NVDA
```

---

## Resources

- MAS full document: https://microsoft.sharepoint.com/sites/accessibility/SitePages/Microsoft-Accessibility-Standards-(MAS).aspx
- Fluent 2: https://fluent2.microsoft.design/
- Windows Narrator: https://support.microsoft.com/windows/narrator
- UIA patterns: https://learn.microsoft.com/windows/win32/winauto/uiauto-uiautomationoverview
- High Contrast: https://learn.microsoft.com/windows/apps/design/accessibility/high-contrast-themes
