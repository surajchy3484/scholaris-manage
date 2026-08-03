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
import { GraduationCap, Settings as SettingsIcon, Moon, Sun, LogOut } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { useAuth, logoutLocal } from "@/lib/auth";
import { toast } from "sonner";

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
      { title: "Dashboard — Scholaris" },
      {
        name: "description",
        content:
          "All your schools in one place.",
      },
      { property: "og:title", content: "Dashboard — Scholaris" },
      {
        property: "og:description",
        content:
          "All your schools in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Dashboard — Scholaris" },
      { name: "twitter:description", content: "All your schools in one place." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4abcf4b6-0d2b-4d20-98ae-c150d68028f3/id-preview-295903e0--cc90d495-f9b5-4bed-aad1-c4d52efaac77.lovable.app-1783762067691.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4abcf4b6-0d2b-4d20-98ae-c150d68028f3/id-preview-295903e0--cc90d495-f9b5-4bed-aad1-c4d52efaac77.lovable.app-1783762067691.png" },
    ],
    links: [
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

const SCHOLARS_KEY = "scholaris:scholars-menu-open";

function ScholarsMenu({
  onNavigate,
  variant = "desktop",
}: {
  onNavigate?: () => void;
  variant?: "desktop" | "mobile";
}) {
  const [open, setOpen] = useState(true);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const saved = localStorage.getItem(SCHOLARS_KEY);
    if (saved !== null) setOpen(saved === "1");
  }, []);

  const toggle = () => {
    setOpen((v) => {
      localStorage.setItem(SCHOLARS_KEY, v ? "0" : "1");
      return !v;
    });
  };

  const items = [
    { to: "/", label: "Student Management", icon: Users, active: pathname === "/" || pathname.startsWith("/schools") },
    {
      to: "/exam-report",
      label: "Exam Report",
      icon: BarChart3,
      active: pathname.startsWith("/exam-report"),
    },
  ] as const;

  return (
    <div className={variant === "mobile" ? "w-full" : "relative"}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
      >
        <Users className="h-4 w-4" />
        Scholars
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className={`grid transition-all duration-200 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"} ${
          variant === "desktop"
            ? "absolute left-0 top-full z-40 w-56 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-elegant"
            : "overflow-hidden"
        }`}
      >
        <div className="overflow-hidden p-1">
          {items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              onClick={onNavigate}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent ${
                it.active ? "bg-accent font-semibold text-accent-foreground" : ""
              }`}
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Header() {
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const signOut = () => {
    logoutLocal();
    toast.success("Signed out");
    router.navigate({ to: "/login", replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/" className="flex min-w-0 items-center gap-2.5 group">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-elegant">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="flex min-w-0 flex-col leading-none">
              <span className="truncate font-display text-lg font-bold tracking-tight">
                Scholaris
              </span>
              <span className="hidden text-[10px] uppercase tracking-widest text-muted-foreground sm:block">
                School Manager
              </span>
            </div>
          </Link>
          <nav className="hidden md:block">
            <ScholarsMenu />
          </nav>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" asChild className="hidden md:inline-flex">
            <Link to="/settings">
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            aria-label="Sign out"
            className="hidden md:inline-flex"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetHeader className="p-0 text-left">
                <SheetTitle className="font-display">Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-4 space-y-1">
                <ScholarsMenu variant="mobile" onNavigate={() => setMobileOpen(false)} />
                <Link
                  to="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <SettingsIcon className="h-4 w-4" />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    signOut();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}


function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthed, ready } = useAuth();
  const router = useRouter();
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onLogin = pathname === "/login";
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <div className="min-h-screen bg-background text-foreground">
          {!onLogin && <Header />}
          <main>
            <Outlet />
          </main>
        </div>
      </AuthGate>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
