"use client";

import * as React from "react";
import { Circle } from "lucide-react";

interface FooterProps {
  version?: string;
  schedulerRunning?: boolean;
}

const DOCS_PORT = process.env.NEXT_PUBLIC_PWAGENT_DOCS_PORT ?? "7338";

function resolveDocsUrl(): string {
  if (typeof window === "undefined") return `http://127.0.0.1:${DOCS_PORT}`;
  const configured = (window as unknown as { __PWAGENT_DOCS_URL__?: string }).__PWAGENT_DOCS_URL__;
  if (configured) return configured;
  const host = window.location.hostname || "127.0.0.1";
  return `${window.location.protocol}//${host}:${DOCS_PORT}`;
}

export function Footer({ version = "0.1.0", schedulerRunning = false }: FooterProps) {
  const [docsUrl, setDocsUrl] = React.useState<string>(`http://127.0.0.1:${DOCS_PORT}`);
  React.useEffect(() => setDocsUrl(resolveDocsUrl()), []);

  return (
    <footer className="border-t bg-background px-4 py-2.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span>pwagent v{version}</span>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1.5">
            <Circle
              className={
                schedulerRunning
                  ? "h-2 w-2 fill-green-500 text-green-500"
                  : "h-2 w-2 fill-zinc-400 text-zinc-400"
              }
            />
            scheduler {schedulerRunning ? "running" : "stopped"}
          </span>
          <span className="text-border">·</span>
          <span>127.0.0.1:7337</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
            title={`pwagent docs at ${docsUrl}`}
          >
            docs
          </a>
          <span className="text-border">·</span>
          <a
            href="https://github.com/dekamb/playwright-agent/issues"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            issues
          </a>
          <span className="text-border">·</span>
          <span>MIT</span>
        </div>
      </div>
    </footer>
  );
}
