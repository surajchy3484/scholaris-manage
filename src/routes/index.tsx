import { createFileRoute } from "@tanstack/react-router";
import { MainDashboard } from "@/components/main-dashboard";
import { RequireModule } from "@/components/require-module";
export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Main Dashboard — SchoolRise" }] }),
  component: () => (
    <RequireModule module="dashboard">
      <div className="mx-auto max-w-7xl px-4 py-5">
        <MainDashboard />
      </div>
    </RequireModule>
  ),
});
