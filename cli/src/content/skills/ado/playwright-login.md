---
name: playwright-login
description: Authenticate to a Power Platform / Dynamics 365 environment using Playwright and save the session as a reusable auth state file. Reads credentials from .env. Run once per environment before any a11y scan or interactive test skill.
argument-hint: "<app-url>"
---

Navigate to a Power Platform or Dynamics 365 app URL, complete the Microsoft
SSO login flow using credentials from `.env`, and save the Playwright auth
state to `.auth/<env-slug>.json` for reuse by other skills.

## Usage

```
pwagent run ado/playwright-login https://make.powerapps.com
pwagent run ado/playwright-login https://make.powerapps.com/environments/abc-123/home
pwagent run ado/playwright-login https://<org>.crm.dynamics.com
```

Arguments:
- `$ARGUMENTS` — full URL of the app to authenticate against

---

## Step 1: Read Credentials

```
Read(file_path: ".env")
```

Extract the following variables:

| Variable | Purpose |
|----------|---------|
| `LOGIN_EMAIL` | Microsoft account email (e.g. `test@microsoft.com`) |
| `LOGIN_PASSWORD` | Password — used only if `LOGIN_CERT_PATH` is absent |
| `LOGIN_CERT_PATH` | Path to PFX/PEM certificate for cert-based auth |
| `LOGIN_CERT_PASSWORD` | Certificate password (if PFX) |
| `LOGIN_TENANT` | AAD tenant (default: `microsoft.onmicrosoft.com`) |
| `PLAYWRIGHT_BROWSER` | `chromium` (default) \| `firefox` \| `webkit` \| `msedge` |

If `.env` is missing or `LOGIN_EMAIL` is not set, stop and output:

> `.env` file not found or `LOGIN_EMAIL` is not set.
> Copy `.env.example` to `.env` and fill in your credentials.

---

## Step 2: Derive Auth State Path

From `$ARGUMENTS`, build a safe filename:

```
slug = $ARGUMENTS
  .replace(/https?:\/\//, '')
  .replace(/[^a-z0-9]/gi, '-')
  .replace(/-+/g, '-')
  .substring(0, 60)

AUTH_STATE_PATH = .auth/<slug>.json
```

Examples:
- `https://make.powerapps.com` → `.auth/make-powerapps-com.json`
- `https://org.crm.dynamics.com` → `.auth/org-crm-dynamics-com.json`

Create the `.auth/` directory if it does not exist.

---

## Step 3: Launch Playwright and Navigate

```bash
npx playwright open --browser ${PLAYWRIGHT_BROWSER:-chromium} "$ARGUMENTS"
```

Navigate to `$ARGUMENTS` and wait for the Microsoft login redirect (URL contains `login.microsoftonline.com` or `login.windows.net`).

---

## Step 4: Perform Login

### 4a — Enter Email

```
selector: input[type="email"], input[name="loginfmt"]
action: fill with LOGIN_EMAIL
then: click "Next" button
```

### 4b — Certificate-Based Auth (preferred)

If `LOGIN_CERT_PATH` is set:

```bash
npx playwright test --config=playwright.config.ts \
  --project=chromium \
  -- --cert="${LOGIN_CERT_PATH}" \
     --cert-password="${LOGIN_CERT_PASSWORD}"
```

### 4b (fallback) — Password Auth

If no certificate:
```
selector: input[type="password"], input[name="passwd"]
action: fill with LOGIN_PASSWORD
then: click "Sign in" button
```

### 4c — Handle "Stay signed in?" prompt

```
selector: input[id="idBtn_Back"], button[id="idSIButton9"]
action: click "Yes" to extend session
```

### 4d — Wait for App to Load

```
wait for URL to NOT contain: login.microsoftonline.com, login.windows.net
wait for networkidle or domcontentloaded
timeout: 30000ms
```

---

## Step 5: Save Auth State

```bash
npx playwright open \
  --save-storage="${AUTH_STATE_PATH}" \
  --browser="${PLAYWRIGHT_BROWSER:-chromium}" \
  "$ARGUMENTS"
```

This saves cookies, localStorage, and sessionStorage to `AUTH_STATE_PATH`.

---

## Step 6: Verify State File

```bash
ls -lh "${AUTH_STATE_PATH}"
```

If file size is 0 or file does not exist → login likely failed. Output error and stop.

---

## Step 7: Output

**Success:**

```markdown
## Playwright Login — Authenticated

| Field | Value |
|-------|-------|
| URL | $ARGUMENTS |
| Account | <LOGIN_EMAIL> |
| Auth method | Certificate / Password |
| State file | .auth/<slug>.json |
| Expires | ~8 hours (re-run to refresh) |

**Auth state saved.** Other skills will reuse this session automatically.

Next steps:
- `pwagent run a11y/scan $ARGUMENTS` — run axe-core scan with saved auth
- `pwagent run a11y/review-interactive $ARGUMENTS` — keyboard + screen reader tests
```

**Failure:**

```markdown
## Playwright Login — Failed

Login did not complete. Possible causes:
- Wrong `LOGIN_EMAIL` or `LOGIN_PASSWORD` in `.env`
- Certificate expired or wrong path in `LOGIN_CERT_PATH`
- MFA required (use certificate auth to bypass)
- App URL redirected unexpectedly

Check `.env` values and re-run `pwagent run ado/playwright-login $ARGUMENTS`.
```
