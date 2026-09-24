import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { GraduationCap, ArrowLeft } from "lucide-react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { refreshProfileFromServer, useAuth } from "@/lib/auth";
import { setupOffline } from "@/lib/pwa";
import { BrandName } from "@/components/brand";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button variant="outline" asChild>
            <a href="/">Go home</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#4f46e5" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "SchoolRise" },
      { title: "Dashboard — SchoolRise" },
      {
        name: "description",
        content: "All your schools in one place.",
      },
      { property: "og:title", content: "Dashboard — SchoolRise" },
      {
        property: "og:description",
        content: "All your schools in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Dashboard — SchoolRise" },
      { name: "twitter:description", content: "All your schools in one place." },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4abcf4b6-0d2b-4d20-98ae-c150d68028f3/id-preview-295903e0--cc90d495-f9b5-4bed-aad1-c4d52efaac77.lovable.app-1783762067691.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4abcf4b6-0d2b-4d20-98ae-c150d68028f3/id-preview-295903e0--cc90d495-f9b5-4bed-aad1-c4d52efaac77.lovable.app-1783762067691.png",
      },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "stylesheet", href: appCss },

      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style>{`
          html, body { font-family: 'Inter', system-ui, sans-serif; }
          h1, h2, h3, h4, .font-display { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
        `}</style>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function Header() {
  const router = useRouter();
  const canGoBack = router.history.canGoBack?.() ?? false;
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur-xl sm:px-4">
      <SidebarTrigger aria-label="Toggle navigation" />
      {pathname !== "/" && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!canGoBack}
          onClick={() => router.history.back()}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      )}
      <Link to="/" className="ml-auto flex items-center gap-2 md:hidden">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
          <GraduationCap className="h-4 w-4" />
        </div>
        <BrandName className="font-display font-bold" />
      </Link>
    </header>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthed, ready } = useAuth();
  const router = useRouter();
  // Permission changes made by an administrator land on the next page focus,
  // so nobody has to sign out and back in.
  useEffect(() => {
    if (!ready || !isAuthed) return;
    void refreshProfileFromServer();
    const onFocus = () => void refreshProfileFromServer();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [ready, isAuthed]);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onLogin = pathname === "/login";

  useEffect(() => {
    if (!ready) return;
    if (!isAuthed && !onLogin) {
      router.navigate({
        to: "/login",
        search: { redirect: pathname },
        replace: true,
      });
    }
  }, [ready, isAuthed, onLogin, pathname, router]);

  // Once we've hydrated and know the user is not signed in on a protected
  // route, hide the content instantly (redirect is running). Before hydration
  // we render children so the initial paint matches SSR.
  if (ready && !isAuthed && !onLogin) return null;
  return <>{children}</>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => setupOffline(), []);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onLogin = pathname === "/login" || pathname.startsWith("/.lovable");
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        {onLogin ? (
          <div className="min-h-screen bg-background text-foreground">
            <Outlet />
          </div>
        ) : (
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="min-h-screen bg-background text-foreground">
              <Header />
              <main className="flex-1">
                <Outlet />
              </main>
            </SidebarInset>
          </SidebarProvider>
        )}
      </AuthGate>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
