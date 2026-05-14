import { homedir } from "node:os";
import { join } from "node:path";

const HOME = process.env.PWAGENT_HOME ?? join(homedir(), ".pwagent");

export const portalPaths = {
  home: HOME,
  scheduler: join(HOME, "scheduler"),
  schedulerEvents: join(HOME, "scheduler", "events"),
  schedulerState: join(HOME, "scheduler", "state.json"),
  schedulerPid: join(HOME, "scheduler", "pwagent-scheduler.pid"),
  config: join(HOME, "config.json"),
  audit: join(HOME, "audit", "events.jsonl"),
  reports: join(HOME, "reports"),
};
