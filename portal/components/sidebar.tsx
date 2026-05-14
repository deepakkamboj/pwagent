"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Clock,
  Users,
  BookOpen,
  FileText,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  Terminal,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/scheduler", label: "Scheduler", icon: Clock },
  { href: "/jobs", label: "Jobs", icon: Calendar },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/skills", label: "Skills", icon: BookOpen },
  { href: "/playwright", label: "Playwright CLI", icon: Terminal },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/audit", label: "Audit", icon: ShieldCheck },
  { href: "/runs", label: "Runs", icon: Activity },
  { href: "/config", label: "Config", icon: Settings },
];

const HELP: NavItem = { href: "help", label: "Help", icon: HelpCircle, external: true };

const DOCS_PORT = process.env.NEXT_PUBLIC_PWAGENT_DOCS_PORT ?? "7338";

function resolveDocsUrl(): string {
  if (typeof window === "undefined") return `http://127.0.0.1:${DOCS_PORT}`;
  const configured = (window as unknown as { __PWAGENT_DOCS_URL__?: string }).__PWAGENT_DOCS_URL__;
  if (configured) return configured;
  const host = window.location.hostname || "127.0.0.1";
  return `${window.location.protocol}//${host}:${DOCS_PORT}`;
}

const COLLAPSED_KEY = "pwagent-sidebar-collapsed";

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = React.createContext<SidebarContextValue | undefined>(undefined);

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used inside SidebarProvider");
  return ctx;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(COLLAPSED_KEY) : null;
    if (stored === "true") setCollapsed(true);
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") window.localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  const setCollapsedPersisted = React.useCallback((v: boolean) => {
    setCollapsed(v);
    if (typeof window !== "undefined") window.localStorage.setItem(COLLAPSED_KEY, String(v));
  }, []);

  const value = React.useMemo(
    () => ({ collapsed, toggle, setCollapsed: setCollapsedPersisted }),
    [collapsed, toggle, setCollapsedPersisted],
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </SidebarContext.Provider>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-14 items-center justify-between px-3 border-b border-sidebar-border">
        <Link
          href="/"
          className={cn("flex items-center gap-2 font-semibold tracking-tight", collapsed && "justify-center w-full")}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            pw
          </div>
          {!collapsed && <span>pwagent</span>}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const link = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "hover:bg-sidebar-accent/50",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
            return (
              <li key={item.href}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-2 space-y-1">
        <HelpNavItem collapsed={collapsed} />
        <Button
          variant="ghost"
          size="sm"
          className={cn("w-full justify-start gap-2", collapsed && "justify-center px-0")}
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && <span className="text-xs text-muted-foreground">Collapse</span>}
        </Button>
      </div>
    </aside>
  );
}

function HelpNavItem({ collapsed }: { collapsed: boolean }) {
  const [docsUrl, setDocsUrl] = React.useState<string>(`http://127.0.0.1:${DOCS_PORT}`);

  React.useEffect(() => {
    setDocsUrl(resolveDocsUrl());
  }, []);

  const Icon = HELP.icon;
  const anchor = (
    <a
      href={docsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent/50",
        collapsed && "justify-center px-0",
      )}
      aria-label="Open pwagent documentation in a new tab"
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <span className="flex items-center gap-1.5">
          {HELP.label}
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </span>
      )}
    </a>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{anchor}</TooltipTrigger>
        <TooltipContent side="right">Help — docs at port {DOCS_PORT}</TooltipContent>
      </Tooltip>
    );
  }

  return anchor;
}

/** Wraps the page content. Adjusts left margin to match the sidebar's current width. */
export function SidebarInset({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col transition-[margin] duration-200 ease-in-out",
        collapsed ? "ml-16" : "ml-60",
      )}
    >
      {children}
    </div>
  );
}

/** Compact mobile toggle to put inside the header. */
export function SidebarMobileToggle() {
  const { toggle, collapsed } = useSidebar();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle sidebar">
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </Button>
  );
}
