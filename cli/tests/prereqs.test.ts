import { describe, expect, it } from "vitest";
import { PREREQS, type Detector } from "../src/prereqs/matrix.js";
import { buildInstallCommand, pickInstaller } from "../src/prereqs/packageManagers.js";

describe("prereqs matrix", () => {
  it("includes the well-known prereqs", () => {
    const ids = PREREQS.map((p) => p.id);
    expect(ids).toContain("node");
    expect(ids).toContain("git");
    expect(ids).toContain("gh");
    expect(ids).toContain("gh-auth");
    expect(ids).toContain("playwright");
    expect(ids).toContain("az");
    expect(ids).toContain("axe");
    expect(ids).toContain("kusto");
  });

  it("gh and gh-auth are both tier=required", () => {
    expect(PREREQS.find((p) => p.id === "gh")?.tier).toBe("required");
    expect(PREREQS.find((p) => p.id === "gh-auth")?.tier).toBe("required");
  });

  it("does not advertise a separate gh-copilot extension — the SDK doesn't need it", () => {
    expect(PREREQS.find((p) => p.id === "gh-copilot")).toBeUndefined();
  });

  it("every prereq has at least one installer", () => {
    for (const p of PREREQS) {
      expect(p.installers.length, `${p.id} has no installers`).toBeGreaterThan(0);
    }
  });

  it("every detector either has a kind=cmd with cmd/args or kind=gh-ext with name", () => {
    for (const p of PREREQS) {
      const d: Detector = p.detect;
      if (d.kind === "cmd") {
        expect(d.cmd.length, `${p.id} cmd is empty`).toBeGreaterThan(0);
        expect(Array.isArray(d.args), `${p.id} args is not array`).toBe(true);
      } else {
        expect(d.name.length, `${p.id} name is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("required prereqs never auto-install — node and git only direct user to manual download", () => {
    const node = PREREQS.find((p) => p.id === "node")!;
    expect(node.installers[0]?.kind).toBe("manual");
  });
});

describe("pickInstaller", () => {
  it("picks the first viable package-manager installer when one is available", () => {
    const gh = PREREQS.find((p) => p.id === "gh")!;
    const picked = pickInstaller(gh.installers, ["winget"]);
    expect(picked?.kind).toBe("winget");
  });

  it("returns the npm-global installer for axe regardless of which OS pm exists", () => {
    const axe = PREREQS.find((p) => p.id === "axe")!;
    const picked = pickInstaller(axe.installers, []);
    expect(picked?.kind).toBe("npm-global");
  });

  it("falls back to manual when no PM is available and no platform-free installer matches", () => {
    const node = PREREQS.find((p) => p.id === "node")!;
    const picked = pickInstaller(node.installers, []);
    expect(picked?.kind).toBe("manual");
  });

  it("returns gh-login for the gh-auth prereq regardless of PM", () => {
    const ghAuth = PREREQS.find((p) => p.id === "gh-auth")!;
    const picked = pickInstaller(ghAuth.installers, ["brew"]);
    expect(picked?.kind).toBe("gh-login");
  });
});

describe("buildInstallCommand", () => {
  it("builds a winget install line with --id and acceptance flags", () => {
    const cmd = buildInstallCommand({ kind: "winget", id: "GitHub.cli" });
    expect(cmd?.cmd).toBe("winget");
    expect(cmd?.args).toContain("--id");
    expect(cmd?.args).toContain("GitHub.cli");
    expect(cmd?.args).toContain("--accept-package-agreements");
    expect(cmd?.sudo).toBe(false);
  });

  it("brew install with --cask when cask:true", () => {
    const cmd = buildInstallCommand({ kind: "brew", id: "visual-studio-code", cask: true });
    expect(cmd?.cmd).toBe("brew");
    expect(cmd?.args).toEqual(["install", "--cask", "visual-studio-code"]);
  });

  it("apt requires sudo by default", () => {
    const cmd = buildInstallCommand({ kind: "apt", pkg: "gh" });
    expect(cmd?.sudo).toBe(true);
    expect(cmd?.args).toEqual(["install", "-y", "gh"]);
  });

  it("npm-global never uses sudo", () => {
    const cmd = buildInstallCommand({ kind: "npm-global", pkg: "@axe-core/cli" });
    expect(cmd?.cmd).toBe("npm");
    expect(cmd?.args).toEqual(["install", "-g", "@axe-core/cli"]);
    expect(cmd?.sudo).toBe(false);
  });

  it("gh-extension uses gh extension install", () => {
    const cmd = buildInstallCommand({ kind: "gh-extension", pkg: "github/gh-copilot" });
    expect(cmd?.cmd).toBe("gh");
    expect(cmd?.args).toEqual(["extension", "install", "github/gh-copilot"]);
  });

  it("gh-login uses gh auth login --web", () => {
    const cmd = buildInstallCommand({ kind: "gh-login" });
    expect(cmd?.cmd).toBe("gh");
    expect(cmd?.args).toContain("auth");
    expect(cmd?.args).toContain("login");
    expect(cmd?.args).toContain("--web");
    expect(cmd?.sudo).toBe(false);
  });

  it("playwright-browsers maps to npx playwright install", () => {
    const cmd = buildInstallCommand({ kind: "playwright-browsers" });
    expect(cmd?.cmd).toBe("npx");
    expect(cmd?.args).toEqual(["playwright", "install"]);
  });

  it("returns undefined for manual installers", () => {
    const cmd = buildInstallCommand({ kind: "manual", url: "https://nodejs.org" });
    expect(cmd).toBeUndefined();
  });
});
