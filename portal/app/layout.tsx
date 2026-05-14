import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Sidebar, SidebarInset, SidebarProvider } from "@/components/sidebar";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ReadOnlyBanner } from "@/components/readOnlyBanner";
import { getOrCreateSecret, isReadOnly } from "@/lib/auth";

export const metadata: Metadata = {
  title: "pwagent portal",
  description: "Local dashboard for the pwagent multi-agent Playwright system.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // PT5: on every request, ensure the session cookie matches the on-disk secret.
  // This is safe because middleware.ts already rejected non-loopback requests.
  const readOnly = isReadOnly();
  if (!readOnly) {
    const store = await cookies();
    const existing = store.get("pwagent_session")?.value;
    const expected = getOrCreateSecret();
    if (existing !== expected) {
      // Set on the next response. Next.js layouts can't directly set cookies on a
      // GET in App Router until route handlers/Server Actions touch them, so we
      // rely on the API route below (/api/session) being called on first paint.
      // To keep this purely SSR we instead expose a small bootstrap fetch that
      // the layout renders inline.
    }
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <SessionBootstrap />
        <SidebarProvider>
          <Sidebar />
          <SidebarInset>
            <Header />
            {readOnly && <ReadOnlyBanner />}
            <main className="flex-1 px-6 py-6">{children}</main>
            <Footer />
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}

/**
 * Tiny inline script that calls /api/session once on first paint to set the
 * HttpOnly cookie. After that, subsequent requests already carry it.
 */
function SessionBootstrap() {
  const script = `fetch('/api/session', { method: 'POST', credentials: 'same-origin' }).catch(()=>{});`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
