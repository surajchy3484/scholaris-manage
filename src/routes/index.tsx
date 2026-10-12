import { useAuth } from "@/lib/auth";
import { MODULES, MODULE_ROUTES } from "@/lib/access-control";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { MainDashboard } from "@/components/main-dashboard";
import { RequireModule } from "@/components/require-module";
export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Main Dashboard — SchoolRise" }] }),
  component: DashboardEntry,
});

function DashboardEntry() {
  const { ready, isAuthed, profile, can } = useAuth();
  if (!ready || !isAuthed) return null;
  if (profile?.role !== "admin") {
    if (can("dashboard")) return <Navigate to="/school-dashboard" replace />;
    const fallback = MODULES.find(m => !["dashboard", "schools", "students", "attendance"].includes(m) && can(m));
    if (fallback) return <Navigate to={MODULE_ROUTES[fallback]} replace />;
    return <p className="p-8 text-muted-foreground">No accessible page is assigned. Please contact your administrator.</p>;
  }
  return (
    <RequireModule module="dashboard">
      <div className="mx-auto max-w-7xl px-4 py-5">
        <MainDashboard />
      </div>
    </RequireModule>
  );
}
