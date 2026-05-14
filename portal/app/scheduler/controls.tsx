"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { startScheduler, stopScheduler } from "./actions";

interface Props {
  running: boolean;
}

export function SchedulerControls({ running }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const onStart = () => {
    setError(undefined);
    setMessage(undefined);
    startTransition(async () => {
      const r = await startScheduler();
      if (!r.ok) {
        setError(r.error ?? "failed to start");
      } else {
        setMessage(r.message ?? "scheduler started");
        router.refresh();
      }
    });
  };
  const onStop = () => {
    setError(undefined);
    setMessage(undefined);
    startTransition(async () => {
      const r = await stopScheduler();
      if (!r.ok) {
        setError(r.error ?? "failed to stop");
      } else {
        setMessage(r.message ?? "scheduler stopped");
        router.refresh();
      }
    });
  };
  const onRefresh = () => {
    router.refresh();
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2 p-4">
        {running ? (
          <Button onClick={onStop} disabled={pending} variant="outline" className="gap-1.5">
            <Square className="h-3.5 w-3.5" />
            Stop scheduler
          </Button>
        ) : (
          <Button onClick={onStart} disabled={pending} className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            Start scheduler
          </Button>
        )}
        <Button onClick={onRefresh} disabled={pending} variant="ghost" size="sm" className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
        {pending && <span className="text-xs text-muted-foreground">working…</span>}
        {message && <span className="text-xs text-green-600">{message}</span>}
        {error && (
          <span className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
