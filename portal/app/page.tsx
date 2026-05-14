import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Calendar, ShieldCheck, Users } from "lucide-react";

const STATS = [
  { label: "Enabled jobs", value: "4", icon: Calendar, hint: "monitor · coverage · report · learner" },
  { label: "Charters", value: "18", icon: Users, hint: "embedded + workspace overrides" },
  { label: "Pending HITL stamps", value: "0", icon: ShieldCheck, hint: "queue is clear" },
  { label: "Runs in last 24h", value: "—", icon: Activity, hint: "scheduler not running" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Local pwagent state. The runtime + scheduler land in subsequent rolls; today this view reads embedded charters
          and the config file.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>{s.label}</CardDescription>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{s.value}</div>
                <p className="text-xs text-muted-foreground">{s.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Lifecycle events from the scheduler (stub).</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No activity yet. Run <code className="rounded bg-muted px-1.5 py-0.5">pwagent scheduler start</code> to
              begin recording events.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quick links</CardTitle>
            <CardDescription>Where to go next.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>
                <a className="hover:underline" href="/jobs">
                  Configure scheduler jobs →
                </a>
              </li>
              <li>
                <a className="hover:underline" href="/agents">
                  Browse the 18 embedded agents →
                </a>
              </li>
              <li>
                <a className="hover:underline" href="/playwright">
                  Playwright CLI cheat-sheet →
                </a>
              </li>
              <li>
                <a className="hover:underline" href="/config">
                  Review config →
                </a>
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
