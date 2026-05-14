"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Search, Bell, GitBranch, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarMobileToggle } from "@/components/sidebar";

const DOCS_PORT = process.env.NEXT_PUBLIC_PWAGENT_DOCS_PORT ?? "7338";

function resolveDocsUrl(): string {
  if (typeof window === "undefined") return `http://127.0.0.1:${DOCS_PORT}`;
  const configured = (window as unknown as { __PWAGENT_DOCS_URL__?: string }).__PWAGENT_DOCS_URL__;
  if (configured) return configured;
  const host = window.location.hostname || "127.0.0.1";
  return `${window.location.protocol}//${host}:${DOCS_PORT}`;
}

const ROUTE_LABELS: Record<string, string> = {
  "": "Dashboard",
  scheduler: "Scheduler",
  jobs: "Jobs",
  agents: "Agents",
  skills: "Skills",
  playwright: "Playwright CLI",
  reports: "Reports",
  audit: "Audit",
  runs: "Runs",
  config: "Config",
};

function deriveBreadcrumb(pathname: string): { label: string; href: string }[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "Dashboard", href: "/" }];
  const crumbs: { label: string; href: string }[] = [{ label: "Dashboard", href: "/" }];
  let acc = "";
  for (const p of parts) {
    acc += `/${p}`;
    crumbs.push({ label: ROUTE_LABELS[p] ?? p, href: acc });
  }
  return crumbs;
}

export function Header() {
  const pathname = usePathname();
  const crumbs = deriveBreadcrumb(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarMobileToggle />
      <Separator orientation="vertical" className="h-6" />

      <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <React.Fragment key={c.href}>
            {i > 0 && <span className="text-muted-foreground">/</span>}
            <Link
              href={c.href}
              className={
                i === crumbs.length - 1
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }
            >
              {c.label}
            </Link>
          </React.Fragment>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Search">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <HelpLink />
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5" />
          <span>main</span>
        </div>
      </div>
    </header>
  );
}

function HelpLink() {
  const [docsUrl, setDocsUrl] = React.useState<string>(`http://127.0.0.1:${DOCS_PORT}`);

  React.useEffect(() => {
    setDocsUrl(resolveDocsUrl());
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon" aria-label="Open pwagent documentation in a new tab">
          <a href={docsUrl} target="_blank" rel="noopener noreferrer">
            <HelpCircle className="h-4 w-4" />
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Help / Docs (port {DOCS_PORT})</TooltipContent>
    </Tooltip>
  );
}
