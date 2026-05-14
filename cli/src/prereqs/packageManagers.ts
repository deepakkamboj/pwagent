import { execa } from "execa";
import type { Installer } from "./matrix.js";

export type PMKind = "winget" | "brew" | "apt" | "dnf" | "pacman";

const PMS: { kind: PMKind; check: () => Promise<boolean> }[] = [
  {
    kind: "winget",
    check: async () => (await execa("winget", ["--version"], { reject: false })).exitCode === 0,
  },
  {
    kind: "brew",
    check: async () => (await execa("brew", ["--version"], { reject: false })).exitCode === 0,
  },
  {
    kind: "apt",
    check: async () => (await execa("apt", ["-v"], { reject: false })).exitCode === 0,
  },
  {
    kind: "dnf",
    check: async () => (await execa("dnf", ["--version"], { reject: false })).exitCode === 0,
  },
  {
    kind: "pacman",
    check: async () => (await execa("pacman", ["--version"], { reject: false })).exitCode === 0,
  },
];

let detectedCache: PMKind[] | undefined;

export async function detectPackageManagers(): Promise<PMKind[]> {
  if (detectedCache) return detectedCache;
  const out: PMKind[] = [];
  for (const pm of PMS) {
    try {
      if (await pm.check()) out.push(pm.kind);
    } catch {
      // ignore
    }
  }
  detectedCache = out;
  return out;
}

/**
 * Given a prereq's installer list and the set of installed package managers,
 * return the first viable installer (or undefined if only manual remains).
 */
export function pickInstaller(installers: Installer[], available: PMKind[]): Installer | undefined {
  for (const i of installers) {
    if (i.kind === "manual") continue;
    if (
      i.kind === "npm-global" ||
      i.kind === "gh-extension" ||
      i.kind === "gh-login" ||
      i.kind === "az-extension" ||
      i.kind === "playwright-browsers"
    ) {
      return i;
    }
    const k = i.kind;
    if ((k === "winget" || k === "brew" || k === "apt" || k === "dnf" || k === "pacman") && available.includes(k)) {
      return i;
    }
  }
  return installers.find((i) => i.kind === "manual");
}

export interface InstallCommand {
  cmd: string;
  args: string[];
  sudo: boolean;
}

/**
 * Build the command line that will install the prereq.
 * Returns undefined for `manual` installers — caller should print the URL.
 */
export function buildInstallCommand(i: Installer): InstallCommand | undefined {
  switch (i.kind) {
    case "winget":
      return {
        cmd: "winget",
        args: ["install", "--id", i.id, "-e", "--accept-package-agreements", "--accept-source-agreements"],
        sudo: false,
      };
    case "brew":
      return {
        cmd: "brew",
        args: i.cask ? ["install", "--cask", i.id] : ["install", i.id],
        sudo: false,
      };
    case "apt":
      return { cmd: "apt", args: ["install", "-y", i.pkg], sudo: i.sudo ?? true };
    case "dnf":
      return { cmd: "dnf", args: ["install", "-y", i.pkg], sudo: i.sudo ?? true };
    case "pacman":
      return { cmd: "pacman", args: ["-S", "--noconfirm", i.pkg], sudo: i.sudo ?? true };
    case "npm-global":
      return { cmd: "npm", args: ["install", "-g", i.pkg], sudo: false };
    case "gh-extension":
      return { cmd: "gh", args: ["extension", "install", i.pkg], sudo: false };
    case "gh-login":
      return { cmd: "gh", args: ["auth", "login", "--web", "--scopes", "read:user"], sudo: false };
    case "az-extension":
      return { cmd: "az", args: ["extension", "add", "--name", i.name], sudo: false };
    case "playwright-browsers":
      return { cmd: "npx", args: ["playwright", "install"], sudo: false };
    case "manual":
      return undefined;
  }
}
