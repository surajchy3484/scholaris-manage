import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { MODULES, MODULE_LABELS, MODULE_ROUTES, type AppAction, type AppModule } from "@/lib/access-control";

/**
 * Page-level access guard. Hiding a sidebar link is not enough: someone can
 * type the URL, so every page wraps its content in this guard. Server
 * functions re-check the same permissions, so this is purely the friendly
 * front door.
 */
export function RequireModule({
  module,
  action = "view",
  children,
}: {
  module: AppModule;
  action?: AppAction;
  children: ReactNode;
}) {
  const { ready, can, isAuthed } = useAuth();
  const allowed = can(module, action);

  // Somewhere they *can* go, so the "Access denied" screen is never a dead end.
  const fallback = MODULES.find((m) => m !== module && can(m)) ?? null;
  const fallbackTo = fallback ? MODULE_ROUTES[fallback] : "/";


  if (!ready || !isAuthed) return null;

  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <Card className="p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold">Access denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You do not have permission to open {MODULE_LABELS[module]}. Ask your administrator if
            you need it.
          </p>
          <Button asChild className="mt-6">
            <Link to={fallbackTo} replace>
              {fallback ? `Go to ${MODULE_LABELS[fallback]}` : "Go back"}
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
