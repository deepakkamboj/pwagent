// Rainbow ASCII banner for pwagent. Mirrors the pattern used by D:/gith/Unify/scripts/banner.ps1
// so the CLI feels at home next to its sibling tools.
//
// True-color ANSI escapes (38;2;R;G;B). Modern Windows Terminal, VS Code terminal,
// and most POSIX terminals render these correctly. Falls back to plain text when:
//   - stdout isn't a TTY (piped output, CI)
//   - NO_COLOR is set
//   - PWAGENT_NO_BANNER is set
//
// Generated with ANSI Shadow figlet style for "pwagent" (7 letters, 6 lines tall).

const RESET = "\x1b[0m";
const BOLD_WHITE = "\x1b[1;97m";
const DIM = "\x1b[90m";

// Red → orange → yellow → green → blue → purple — one per banner row.
const RAINBOW = [
  "\x1b[38;2;255;64;64m",
  "\x1b[38;2;255;140;0m",
  "\x1b[38;2;255;215;0m",
  "\x1b[38;2;64;200;96m",
  "\x1b[38;2;64;156;255m",
  "\x1b[38;2;170;96;255m",
];

const BANNER: readonly string[] = [
  "██████╗  ██╗    ██╗  █████╗   ██████╗ ███████╗███╗   ██╗████████╗",
  "██╔══██╗ ██║    ██║ ██╔══██╗ ██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝",
  "██████╔╝ ██║ █╗ ██║ ███████║ ██║  ███╗█████╗  ██╔██╗ ██║   ██║   ",
  "██╔═══╝  ██║███╗██║ ██╔══██║ ██║   ██║██╔══╝  ██║╚██╗██║   ██║   ",
  "██║      ╚███╔███╔╝ ██║  ██║ ╚██████╔╝███████╗██║ ╚████║   ██║   ",
  "╚═╝       ╚══╝╚══╝  ╚═╝  ╚═╝  ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ",
];

export interface BannerOptions {
  indent?: number;
  noTagline?: boolean;
  /** Force plain (no color) output regardless of TTY/NO_COLOR. */
  plain?: boolean;
}

function colorsDisabled(): boolean {
  if (process.env["NO_COLOR"]) return true;
  if (process.env["PWAGENT_NO_BANNER"]) return true;
  if (!process.stdout.isTTY) return true;
  return false;
}

export function shouldShowBanner(): boolean {
  if (process.env["PWAGENT_NO_BANNER"]) return false;
  return process.stdout.isTTY === true;
}

export function showBanner(opts: BannerOptions = {}): void {
  const plain = opts.plain || colorsDisabled();
  const indent = " ".repeat(opts.indent ?? 2);

  console.log();
  for (let i = 0; i < BANNER.length; i++) {
    const line = BANNER[i] ?? "";
    if (plain) {
      console.log(indent + line);
    } else {
      console.log(indent + RAINBOW[i % RAINBOW.length] + line + RESET);
    }
  }
  if (!opts.noTagline) {
    console.log();
    const tag1 = "Multi-agent Playwright testing — Squad design, GitHub Copilot SDK runtime.";
    const tag2 = "cli (engine) · portal (dashboard) · scheduler (in-process)";
    if (plain) {
      console.log(indent + tag1);
      console.log(indent + tag2);
    } else {
      console.log(indent + BOLD_WHITE + tag1 + RESET);
      console.log(indent + DIM + tag2 + RESET);
    }
  }
  console.log();
}

/** Returns the banner as a string instead of writing to stdout. Useful for tests. */
export function bannerString(opts: BannerOptions = {}): string {
  const plain = opts.plain || colorsDisabled();
  const indent = " ".repeat(opts.indent ?? 2);
  const out: string[] = [];
  for (let i = 0; i < BANNER.length; i++) {
    const line = BANNER[i] ?? "";
    if (plain) {
      out.push(indent + line);
    } else {
      out.push(indent + RAINBOW[i % RAINBOW.length] + line + RESET);
    }
  }
  return out.join("\n");
}
