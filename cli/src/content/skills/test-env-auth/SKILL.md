---
name: test-env-auth
description: 'Cert-backed AAD auth + storage state for Playwright tests. Determinism + freshness checks are in hooks/storage-state-guard.ps1 — this skill documents how agents consume the resolved env vars from the .test-env.json sidecar.'
allowed-tools: Bash(npx:*) Bash(node:*) Read
---

# Test Environment Auth — hook-resolved

Used by `/pwagent-fix` (baseline + validate phases), `/pwagent-validator`, `/pwagent-author` (run-and-repair), `/pwagent-a11y-verify` — every agent that runs Playwright against a real browser + real test org.

Per N2 ([SPEC.md §16.2](../../../../SPEC.md)), the deterministic steps (validate inputs, generate storage state if stale) live in [hooks/storage-state-guard.ps1](../../hooks/storage-state-guard.ps1). This skill is the **agent-side contract** for reading what the hook published.

## What the hook publishes

When a Playwright `Bash` tool call enters `preToolUse`, `hooks/storage-state-guard.ps1` reads the bound `.repo-context.json`, inspects the storage state file's age, and writes `~/.copilot/state/runs/<runId>/.test-env.json`:

```json
{
  "storagePath": "state-storage-auth-file.json",
  "appUrl": "https://contoso.crm.dynamics.com",
  "authEmail": "svc-test@contoso.com",
  "certPath": "C:\\certs\\svc-test.pfx",
  "testCommand": "npx playwright test",
  "needsRefresh": false,
  "ageHours": 3.2,
  "ttlHours": 8
}
```

## Agent usage

```bash
ENV_JSON="$HOME/.copilot/state/runs/$RUN_ID/.test-env.json"

# 1. Halt if the hook couldn't resolve (no test env in repo-context, or it failed)
[ -f "$ENV_JSON" ] || {
    echo "test-env hook did not publish — check .repo-context.json.testEnv block"
    exit 1
}

# 2. Bind env vars
APP_URL=$(jq -r .appUrl "$ENV_JSON")
AUTH_EMAIL=$(jq -r .authEmail "$ENV_JSON")
CERT_PATH=$(jq -r .certPath "$ENV_JSON")
STORAGE_STATE=$(jq -r .storagePath "$ENV_JSON")
TEST_COMMAND=$(jq -r .testCommand "$ENV_JSON")
NEEDS_REFRESH=$(jq -r .needsRefresh "$ENV_JSON")

# 3. If hook said the storage state is stale, regenerate ONCE before invoking npx playwright.
#    The hook detects + publishes but does NOT regenerate (regeneration may need an interactive
#    cert handshake or a repo-side helper, which exceeds the hook's 5s timeout budget).
if [ "$NEEDS_REFRESH" = "true" ]; then
    # Prefer the repo's auth helper if it exists:
    if [ -f auth/generate-storage-state.ts ]; then
        npx tsx auth/generate-storage-state.ts \
            --url "$APP_URL" --email "$AUTH_EMAIL" --cert "$CERT_PATH" --output "$STORAGE_STATE"
    else
        # Fallback inline (clientCertificates option):
        node -e "
const { chromium } = require('playwright');
(async () => {
  const ctx = await chromium.launchPersistentContext('', {
    clientCertificates: [{ origin: process.env.APP_URL, pfxPath: process.env.CERT_PATH }],
  });
  const page = await ctx.newPage();
  await page.goto(process.env.APP_URL);
  await page.getByRole('main').waitFor({ timeout: 60000 });
  await ctx.storageState({ path: process.env.STORAGE_STATE });
  await ctx.close();
})();
"
    fi
fi

# 4. Run the test (env vars match OneCRM-style convention; override by adding a
#    testEnv.envVarNames object to .repositories[] in config.json).
TESTORG="$APP_URL" TESTEMAIL="$AUTH_EMAIL" STORAGE_STATE="$STORAGE_STATE" \
    $TEST_COMMAND <files-and-flags> --reporter=json
```

## What changed vs the earlier draft

The previous SKILL.md required the agent to:
1. Validate `appUrl` / `authEmail` / `certPath` aren't placeholders
2. Check storage state mtime
3. Generate storage state if stale

Steps 1+2 are now in `hooks/storage-state-guard.ps1` (deterministic; runs in milliseconds; the resulting sidecar is the contract).

Step 3 stays in the agent because regeneration may take 30-60s of cert handshaking, which exceeds the hook's 5s `timeoutSec`. The agent reads `needsRefresh` from the sidecar and runs the regen inline.

## When to skip this skill

- `/pwagent-runner local` against a fully-mocked test that doesn't hit the live env — `playwright.config.ts` declares no `baseURL`/`storageState`; the agent can skip.
- Diagnostic runs invoked with `--no-auth`.

## Failure halt

If `hooks/storage-state-guard.ps1` fails or the resolved `appUrl` / `authEmail` / `certPath` are still placeholder values (`<...>`), the agent receives an unresolved sidecar OR no sidecar at all. In either case, halt and emit a clarification asking the operator to fix `config.json` `.repositories[].testEnv`.
