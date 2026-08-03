import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Sticky Home / Back bar shown on every page except the main dashboard.
 * `history.back()` restores the previous URL (search params = filters) and the
 * browser's scroll position.
 */
export function PageNav() {
  const router = useRouter();
  const canGoBack = router.history.canGoBack?.() ?? true;

  return (
    <div className="sticky top-16 z-20 border-b border-border/50 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:px-6">
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
        <Button variant="ghost" size="sm" className="gap-1.5" asChild>
          <Link to="/">
            <Home className="h-4 w-4" />
            Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
