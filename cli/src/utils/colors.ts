import pc from "picocolors";

export const c = {
  ok: (s: string) => pc.green(s),
  warn: (s: string) => pc.yellow(s),
  err: (s: string) => pc.red(s),
  dim: (s: string) => pc.dim(s),
  bold: (s: string) => pc.bold(s),
  cyan: (s: string) => pc.cyan(s),
  blue: (s: string) => pc.blue(s),
  magenta: (s: string) => pc.magenta(s),
};

export const glyph = {
  ok: c.ok("✓"),
  err: c.err("✗"),
  skip: c.dim("—"),
  pending: c.warn("…"),
  arrow: c.dim("→"),
};

export function statusLine(label: string, value: string, status: "ok" | "err" | "skip" | "pending" = "ok"): string {
  const g = status === "ok" ? glyph.ok : status === "err" ? glyph.err : status === "skip" ? glyph.skip : glyph.pending;
  return `  [${g}] ${label.padEnd(20)} ${value}`;
}

export const HR = c.dim("─".repeat(65));
