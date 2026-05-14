import { z } from "zod";

/**
 * Provider config — pwagent runs exclusively on GitHub Copilot via
 * `@github/copilot-sdk`. Authentication is handled by `gh auth login`
 * (Copilot subscription required); no API keys live in this file.
 */
export const ProviderSchema = z.object({
  /** Client identifier sent to the Copilot service for telemetry / audit. */
  clientName: z.string().default("pwagent"),
  /** Default model. Overridable per-agent via `## Model` in charter, or per-call via --model. */
  model: z.string().default("claude-sonnet-4.5"),
  /** Copilot SDK log level. */
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("error"),
  /** Per-agent model overrides; charter's `## Model` block wins if present. */
  perAgent: z.record(z.object({ model: z.string().optional() })).optional(),
});

export const AdoSchema = z.object({
  org: z.string().optional(),
  project: z.string().optional(),
  defaultRepo: z.string().optional(),
});

export const RepoSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["ado", "github"]).default("github"),
  defaultBranch: z.string().default("main"),
});

export const SchedulerSchema = z.object({
  stateDir: z.string().default("~/.pwagent/scheduler"),
  logDir: z.string().default("~/.pwagent/logs/scheduler"),
});

const HHmm = /^([01]\d|2[0-3]):[0-5]\d$/;
const KEBAB = /^[a-z][a-z0-9-]*$/;

/**
 * A scheduled job declared inline in pwagent.config.json. Five `kind` values are
 * supported. The runtime translates each entry into the lower-level JobSpec used
 * by the scheduler tick loop.
 *
 *   - `startup`  → fires once when the scheduler starts, then never again
 *   - `interval` → every N minutes (use `interval: <minutes>`)
 *   - `daily`    → every day at HH:mm (use `time`)
 *   - `weekly`   → once per week at HH:mm on `weekday`
 *   - `cron`     → free-form cron expression (use `cron`)
 *
 * `command` may be a single string (run via the platform shell — pwsh on Windows,
 * sh on POSIX) or an explicit argv array.
 */
export const ScheduleEntrySchema = z
  .object({
    name: z.string().regex(KEBAB, "schedule name must be lowercase-kebab"),
    kind: z.enum(["startup", "interval", "daily", "weekly", "cron"]),

    interval: z.number().int().positive().optional(),
    time: z.string().regex(HHmm).optional(),
    weekday: z
      .enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])
      .optional(),
    cron: z.string().optional(),

    command: z.union([z.string(), z.array(z.string())]),
    logFile: z.string().optional(),

    enabled: z.boolean().default(true),
    description: z.string().default(""),
    maxRunSeconds: z.number().int().positive().default(600),
    catchUp: z.boolean().default(true),
    _comment: z.string().optional(),
  })
  .refine(
    (s) => {
      if (s.kind === "interval") return typeof s.interval === "number";
      if (s.kind === "daily") return typeof s.time === "string";
      if (s.kind === "weekly") return typeof s.time === "string" && typeof s.weekday === "string";
      if (s.kind === "cron") return typeof s.cron === "string" && s.cron.length > 0;
      return true; // startup needs no extra fields
    },
    {
      message:
        "schedule shape mismatch: interval needs `interval`; daily needs `time`; weekly needs `time` + `weekday`; cron needs `cron`",
    },
  );

export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>;

export const ToolsSchema = z.object({
  allowlist: z.array(z.string()).default(["read", "write", "edit", "bash", "grep", "gh", "az", "npx"]),
});

export const AuditSchema = z.object({
  enabled: z.boolean().default(true),
  path: z.string().default("~/.pwagent/audit/events.jsonl"),
});

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  provider: ProviderSchema.default({}),
  ado: AdoSchema.default({}),
  repos: z.array(RepoSchema).default([]),
  scheduler: SchedulerSchema.default({}),
  schedules: z.array(ScheduleEntrySchema).default([]),
  tools: ToolsSchema.default({}),
  audit: AuditSchema.default({}),
  defaultSurface: z.enum(["cli", "chat", "either", "noop"]).default("cli"),
});

export type Config = z.infer<typeof ConfigSchema>;
export type Provider = z.infer<typeof ProviderSchema>;
export type Repo = z.infer<typeof RepoSchema>;

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});
