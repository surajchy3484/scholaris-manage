import { SchoolDriveSync } from "@/components/school-drive-sync";
import { useRef } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Moon, Sun, Download, Upload, Info, LogOut, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTheme, type ThemeColor } from "@/hooks/use-theme";
import { backupDatabase, restoreDatabase } from "@/lib/backup";
import { logoutLocal, useAuth } from "@/lib/auth";
import { RequireModule } from "@/components/require-module";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [{ title: "Settings — SchoolRise" }],
  }),
  component: () => (
    <RequireModule module="settings">
      <SettingsPage />
    </RequireModule>
  ),
});

const COLOR_OPTIONS: { value: ThemeColor; label: string; swatch: string }[] = [
  { value: "indigo", label: "Indigo", swatch: "oklch(0.55 0.22 265)" },
  { value: "emerald", label: "Emerald", swatch: "oklch(0.55 0.17 160)" },
  { value: "rose", label: "Rose", swatch: "oklch(0.58 0.2 350)" },
  { value: "amber", label: "Amber", swatch: "oklch(0.62 0.17 75)" },
  { value: "cyan", label: "Cyan", swatch: "oklch(0.58 0.16 205)" },
  { value: "violet", label: "Violet", swatch: "oklch(0.55 0.22 305)" },
];

function SettingsPage() {
  const { theme, setTheme, color, setColor } = useTheme();
  const { session } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onBackup() {
    try {
      await backupDatabase();
      toast.success("Backup downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onRestore(file: File) {
    try {
      await restoreDatabase(file);
      toast.success("Restore complete. Reloading...");
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </Button>
      <h1 className="mb-6 font-display text-3xl font-bold">Settings</h1>

      <div className="space-y-4">
        <SchoolDriveSync />
        <Card className="p-5">
          <div className="mb-3">
            <h2 className="font-display text-lg font-semibold">Appearance</h2>
            <p className="text-sm text-muted-foreground">Choose light or dark mode.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={theme === "light" ? "default" : "outline"}
              onClick={() => setTheme("light")}
            >
              <Sun className="h-4 w-4" /> Light
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              onClick={() => setTheme("dark")}
            >
              <Moon className="h-4 w-4" /> Dark
            </Button>
          </div>
          <div className="mt-5 border-t border-border/60 pt-4">
            <p className="mb-3 text-sm font-medium">Theme color</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={color === option.value}
                  onClick={() => setColor(option.value)}
                  className={`group relative flex items-center gap-2 overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-muted hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                    color === option.value
                      ? "border-primary bg-primary/10 font-semibold text-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full shadow-sm transition-transform duration-200 group-hover:scale-125"
                    style={{ backgroundColor: option.swatch }}
                  />
                  {option.label}
                  {color === option.value && (
                    <Check className="ml-auto h-4 w-4 animate-in zoom-in-50 duration-200" />
                  )}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Changes apply across the dashboard and are saved on this device.
            </p>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3">
            <h2 className="font-display text-lg font-semibold">Backup &amp; Restore</h2>
            <p className="text-sm text-muted-foreground">
              Export all schools, students, and attendance as a JSON file — or add missing records
              from a previous backup.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onBackup}>
              <Download className="h-4 w-4" />
              Backup Database
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Restore Database
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (
                    confirm("Restore adds missing records and preserves existing data. Continue?")
                  )
                    onRestore(f);
                }
              }}
            />
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-warm/40 p-3 text-xs text-warm-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Existing records are preserved. This export covers schools, students, and attendance;
            use provider backups for full database recovery.
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3">
            <h2 className="font-display text-lg font-semibold">Account</h2>
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-mono text-foreground">{session?.user ?? "—"}</span>
              .
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              logoutLocal();
              toast.success("Signed out");
              router.navigate({ to: "/login", replace: true });
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">About</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            SchoolRise — modern school management &amp; attendance workspace. Data is stored
            securely in your cloud backend.
          </p>
        </Card>
      </div>
    </div>
  );
}
