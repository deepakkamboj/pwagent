import { z } from "zod";

const HHmm = /^([01]\d|2[0-3]):[0-5]\d$/;
const WeekdayEnum = z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);

export const ScheduleSchema = z
  .object({
    type: z.enum(["interval", "daily", "weekly", "cron"]),
    /** for interval: minutes between fires (>= 1) */
    minutes: z.number().int().positive().optional(),
    /** for daily/weekly: 24h HH:mm in local TZ */
    time: z.string().regex(HHmm).optional(),
    /** for weekly */
    weekday: WeekdayEnum.optional(),
    /** raw cron expression — overrides everything else when set */
    cron: z.string().optional(),
    /** IANA timezone; defaults to system TZ when omitted */
    timezone: z.string().optional(),
    /** if a tick was missed (laptop closed), fire once on next start */
    catchUp: z.boolean().default(true),
  })
  .refine(
    (s) => {
      if (s.cron) return true;
      if (s.type === "interval") return typeof s.minutes === "number" && s.minutes > 0;
      if (s.type === "daily") return typeof s.time === "string";
      if (s.type === "weekly") return typeof s.time === "string" && typeof s.weekday === "string";
      return true;
    },
    {
      message:
        "schedule shape mismatch: interval needs minutes; daily needs time; weekly needs time + weekday; cron overrides all",
    },
  );

export type Schedule = z.infer<typeof ScheduleSchema>;

export const RetrySchema = z
  .object({
    onExitCodes: z.array(z.number().int()).default([1, 124]),
    maxAttempts: z.number().int().min(1).max(10).default(2),
    backoffSeconds: z.number().int().min(0).default(30),
  })
  .default({});

export type Retry = z.infer<typeof RetrySchema>;

export const HooksSchema = z
  .object({
    preDispatch: z.string().optional(),
    postDispatch: z.string().optional(),
  })
  .optional();

export const JobSpecSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9-]*$/, "id must be lowercase-kebab"),
  description: z.string().default(""),
  enabled: z.boolean().default(true),
  schedule: ScheduleSchema,

  /** "self" runs `pwagent <args>` against this binary; "external" runs `command` verbatim */
  surface: z.enum(["self", "external", "noop"]).default("self"),
  /** for surface=self: arg vector. for external: full argv. Empty array allowed for noop. */
  argv: z.array(z.string()).default([]),

  maxRunSeconds: z.number().int().positive().default(600),
  retry: RetrySchema,
  disableAfterConsecutiveFailures: z.number().int().min(1).default(5),

  hooks: HooksSchema,
});

export type JobSpec = z.infer<typeof JobSpecSchema>;

export function parseJobSpec(raw: unknown): JobSpec {
  return JobSpecSchema.parse(raw);
}
