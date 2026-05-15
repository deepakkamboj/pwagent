# Narrator / UIA Fix Patterns

> **Pre-flight resource for Narrator bugs.** Read this when a bug description mentions "Narrator", "screen reader", "announces", "UIA", or "doesn't read". Apply the correct ARIA pattern and document the announcement in the PR.

---

## How to Identify a Narrator Bug

A bug is a Narrator/UIA bug if the description or repro steps contain any of:
- "Narrator doesn't announce"
- "Screen reader doesn't read"
- "Not accessible to screen reader"
- "Missing announcement"
- "[field/button/state] not announced"
- "UIA"
- "AT not detecting"

---

## Pattern Library

### Pattern 1 — Field Label Not Announced

**Symptom:** Narrator announces "edit text" or "blank" instead of the field name.

**Root cause:** Label is visual-only (div/span), or input has no label association, or only `placeholder` is used.

**Fix:**
```tsx
// WRONG
<div className="label">Email</div>
<input type="email" placeholder="Enter email" />

// CORRECT — option A: explicit label
<label htmlFor="email-input">Email</label>
<input type="email" id="email-input" placeholder="Enter email" />

// CORRECT — option B: aria-label (when label cannot be visible)
<input type="email" aria-label="Email address" placeholder="Enter email" />

// CORRECT — option C: aria-labelledby (label exists elsewhere in DOM)
<span id="email-label">Email</span>
<input type="email" aria-labelledby="email-label" />
```

**Narrator will announce:** `"Email, edit text"`

---

### Pattern 2 — Required Field Not Announced

**Symptom:** Narrator does not announce that the field is required.

**Root cause:** Only using the HTML `required` attribute — UIA does not always surface this.

**Fix:**
```tsx
// WRONG
<input type="text" required />

// CORRECT
<input type="text" required aria-required="true" />
```

**Narrator will announce:** `"Name, required, edit text"`

---

### Pattern 3 — Validation Error Not Announced

**Symptom:** Error appears visually (red border, error text) but Narrator does not announce it.

**Root cause:** Error message is not programmatically associated with the input, and/or no live region.

**Fix:**
```tsx
// WRONG
<input type="text" className="has-error" />
<span className="error">This field is required</span>

// CORRECT
<input
  type="text"
  id="name"
  aria-required="true"
  aria-invalid={hasError}
  aria-describedby={hasError ? "name-error" : undefined}
/>
{hasError && (
  <span id="name-error" role="alert">
    This field is required
  </span>
)}
```

**Narrator will announce (on error):** `"Name, required, invalid entry, This field is required"`

---

### Pattern 4 — Button State Not Announced (toggle/press)

**Symptom:** Narrator announces "button" but not whether it is pressed/active/selected.

**Root cause:** State conveyed only by CSS class or visual change.

**Fix:**
```tsx
// WRONG
<button className={isBold ? 'active' : ''}>Bold</button>

// CORRECT
<button aria-pressed={isBold} onClick={toggleBold}>Bold</button>
```

**Narrator will announce:** `"Bold, toggle button, pressed"` / `"Bold, toggle button, not pressed"`

---

### Pattern 5 — Expand/Collapse State Not Announced

**Symptom:** Narrator does not announce that a section is expanded or collapsed.

**Root cause:** No `aria-expanded` on the trigger button.

**Fix:**
```tsx
// WRONG
<button onClick={toggle}>Details</button>
{isOpen && <div>{content}</div>}

// CORRECT
<button aria-expanded={isOpen} aria-controls="details-content" onClick={toggle}>
  Details
</button>
<div id="details-content" hidden={!isOpen}>
  {content}
</div>
```

**Narrator will announce:** `"Details, collapsed, button"` / `"Details, expanded, button"`

---

### Pattern 6 — Dynamic Content / Status Messages Not Announced

**Symptom:** Page updates (success message, toast, loading complete) are not announced.

**Root cause:** No `aria-live` region or `role="status"` / `role="alert"`.

**Fix:**

For **non-urgent** updates (loading complete, save successful):
```tsx
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {statusMessage}
</div>
```

For **urgent** updates (validation errors, destructive action confirmations):
```tsx
<div role="alert" aria-atomic="true">
  {errorMessage}
</div>
```

For **loading states:**
```tsx
<div role="status" aria-label={isLoading ? "Loading, please wait" : "Content loaded"}>
  {isLoading ? <Spinner /> : content}
</div>
```

**Narrator will announce:** the text content of the live region when it changes.

---

### Pattern 7 — Loading Spinner Not Announced

**Symptom:** Loading spinner is visible but Narrator announces nothing, or announces raw spinner text.

**Root cause:** Spinner has no accessible name or is `aria-hidden`.

**Fix:**
```tsx
// WRONG
<Spinner /> {/* aria-hidden or no label */}

// CORRECT — Fluent 2
<Spinner label="Loading results, please wait" />

// CORRECT — custom
<div role="progressbar" aria-label="Loading, please wait" aria-busy="true" />
```

**Narrator will announce:** `"Loading results, please wait, busy"`

---

### Pattern 8 — Tab Not Announced as Selected

**Symptom:** Narrator announces "button" instead of "tab, selected/not selected".

**Root cause:** Custom tab implementation using `<button>` without proper ARIA roles.

**Fix:**
```tsx
// WRONG
<div className="tabs">
  <button className="active">Overview</button>
  <button>Details</button>
</div>

// CORRECT
<div role="tablist" aria-label="Product sections">
  <button role="tab" aria-selected={activeTab === 'overview'} aria-controls="overview-panel" id="overview-tab">
    Overview
  </button>
  <button role="tab" aria-selected={activeTab === 'details'} aria-controls="details-panel" id="details-tab">
    Details
  </button>
</div>
<div role="tabpanel" id="overview-panel" aria-labelledby="overview-tab" hidden={activeTab !== 'overview'}>
  {overviewContent}
</div>
```

**Narrator will announce:** `"Overview, tab, 1 of 2, selected"`

---

### Pattern 9 — Combobox/Dropdown Selection Not Announced

**Symptom:** Narrator announces "combo box" but not the currently selected value.

**Root cause:** Custom dropdown not implementing full combobox ARIA pattern.

**Fix (Fluent 2 preferred):**
```tsx
import { Combobox, Option } from '@fluentui/react-components';

<Combobox placeholder="Select a country" aria-label="Country">
  <Option>United States</Option>
  <Option>Canada</Option>
</Combobox>
```

**Custom implementation:**
```tsx
<div
  role="combobox"
  aria-expanded={isOpen}
  aria-haspopup="listbox"
  aria-activedescendant={selectedId}
  aria-label="Country"
  tabIndex={0}
>
  {selectedValue}
</div>
<ul role="listbox" hidden={!isOpen}>
  {options.map(opt => (
    <li key={opt.id} id={opt.id} role="option" aria-selected={opt.id === selectedId}>
      {opt.label}
    </li>
  ))}
</ul>
```

---

### Pattern 10 — Icon-Only Button Not Announced

**Symptom:** Narrator announces "button" with no name, or reads out icon character codes.

**Root cause:** Button contains only an icon with no accessible name.

**Fix:**
```tsx
// WRONG — Narrator announces "button" only
<button onClick={onClose}>
  <CloseIcon />
</button>

// CORRECT — option A: aria-label
<button aria-label="Close dialog" onClick={onClose}>
  <CloseIcon aria-hidden="true" />
</button>

// CORRECT — option B: visually hidden text
<button onClick={onClose}>
  <CloseIcon aria-hidden="true" />
  <span className="sr-only">Close dialog</span>
</button>
```

**Narrator will announce:** `"Close dialog, button"`

---

## PR Description Template for Narrator Bugs

Every PR that fixes a Narrator bug must include this section:

```markdown
## Screen Reader Impact

**Before:** Narrator announced [describe what was announced, or "nothing"]
**After:** Narrator will now announce: "[exact announcement string]"

Tested with: Windows Narrator (Windows 11) / NVDA
```

---

## sr-only CSS Class

If not already in the project, add this utility class for visually hidden but screen-reader-accessible text:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

Tailwind: `className="sr-only"`  
Fluent 2: `className={mergeClasses(styles.srOnly)}`
