import { describe, expect, it, vi } from "vitest";

/**
 * The probe imports `@github/copilot-sdk` dynamically. In the test environment
 * the package IS installed (it's a real dep), so the probe will attempt a live
 * connection. Without `gh auth login` that will fail — which is what we want
 * to test: the failure should be categorised, not crash.
 *
 * We do NOT mock the SDK here. We just verify the shape of the result.
 */
describe("provider — probeCopilotReachable", () => {
  it("returns a structured result without throwing", async () => {
    vi.resetModules();
    const { probeCopilotReachable } = await import("../src/runtime/provider.js");
    // Tight timeout so the test doesn't block CI for 5s when auth is missing.
    const result = await probeCopilotReachable(1_000);
    expect(result).toBeDefined();
    expect(typeof result.reachable).toBe("boolean");
    expect(["ok", "sdk-missing", "auth-missing", "unknown"]).toContain(result.status);
    expect(typeof result.durationMs).toBe("number");
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("durationMs is bounded by the timeout (within a slop window)", async () => {
    vi.resetModules();
    const { probeCopilotReachable } = await import("../src/runtime/provider.js");
    const TIMEOUT = 800;
    const result = await probeCopilotReachable(TIMEOUT);
    // Allow generous slop for slow CI machines + SDK init overhead.
    expect(result.durationMs).toBeLessThan(TIMEOUT + 4_000);
  });
});
