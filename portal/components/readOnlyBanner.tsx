import { Lock } from "lucide-react";

export function ReadOnlyBanner() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="flex items-center gap-2">
        <Lock className="h-3.5 w-3.5" />
        <span>
          read-only mode — all write actions disabled. Restart without{" "}
          <code className="rounded bg-amber-200/40 px-1 py-0.5">--read-only</code> to enable edits.
        </span>
      </div>
    </div>
  );
}
