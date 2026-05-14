"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Play, Power } from "lucide-react";
import { fireJob, toggleJob } from "./actions";

interface Props {
  id: string;
  scheduleLabel: string;
  surface: string;
  nextFireLabel: string;
  lastStatus: string;
  enabled: boolean;
  autoDisabled: boolean;
}

export function JobRow({ id, scheduleLabel, surface, nextFireLabel, lastStatus, enabled, autoDisabled }: Props) {
  const [pending, startTransition] = useTransition();

  const onToggle = () => {
    startTransition(async () => {
      await toggleJob(id, !enabled);
    });
  };
  const onFire = () => {
    startTransition(async () => {
      await fireJob(id);
    });
  };

  return (
    <tr className="border-b last:border-0">
      <td className="px-2 py-3 font-mono text-xs">
        <Link href={`/jobs/${id}`} className="hover:underline">
          {id}
        </Link>
      </td>
      <td className="px-2 py-3">{scheduleLabel}</td>
      <td className="px-2 py-3">
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{surface}</code>
      </td>
      <td className="px-2 py-3 text-muted-foreground">{nextFireLabel}</td>
      <td className="px-2 py-3 text-muted-foreground">{lastStatus}</td>
      <td className="px-2 py-3">
        {autoDisabled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
            auto-disabled
          </span>
        ) : enabled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
            enabled
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            disabled
          </span>
        )}
      </td>
      <td className="px-2 py-3 text-right">
        <Button size="sm" variant="ghost" onClick={onFire} disabled={pending} aria-label="fire now">
          <Play className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onToggle} disabled={pending} aria-label={enabled ? "disable" : "enable"}>
          <Power className={enabled ? "h-3.5 w-3.5 text-green-600" : "h-3.5 w-3.5 text-muted-foreground"} />
        </Button>
      </td>
    </tr>
  );
}
