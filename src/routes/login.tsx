import { useEffect, useState } from "react";
import { createFileRoute, useRouter, useSearch } from "@tanstack/react-router";
import { GraduationCap, Eye, EyeOff, LogIn } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { loginLocal, useAuth, verifyCredentials } from "@/lib/auth";

type LoginSearch = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Scholaris" },
      { name: "description", content: "Sign in to Scholaris to manage your schools and attendance." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const search = useSearch({ from: "/login" }) as LoginSearch;
  const { isAuthed, ready } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (ready && isAuthed) {
      router.navigate({ to: (search.redirect as "/" | undefined) ?? "/", replace: true });
    }
  }, [ready, isAuthed, router, search.redirect]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!username.trim() || !password) {
      setErr("Username and password are required.");
      return;
    }
    setSubmitting(true);
    // Small delay for UX feedback
    setTimeout(() => {
      if (!verifyCredentials(username, password)) {
        setSubmitting(false);
        setErr("Invalid username or password.");
        return;
      }
      loginLocal(username.trim(), remember);
      toast.success("Welcome back");
      router.navigate({ to: (search.redirect as "/" | undefined) ?? "/", replace: true });
    }, 120);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-warm/40">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col items-center gap-3 text-center"
        >
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-elegant">
            <GraduationCap className="h-7 w-7" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Scholaris</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              School Management &amp; Attendance
            </p>
          </div>
        </motion.div>

        <Card className="p-6 shadow-elegant">
          <div className="mb-4">
            <h2 className="font-display text-xl font-semibold">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use your credentials to continue.</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="reapstem"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={remember}
                onCheckedChange={(v) => setRemember(v === true)}
                id="remember"
              />
              <span>Remember me on this device</span>
            </label>
            {err && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {err}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              <LogIn className="h-4 w-4" />
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Scholaris
        </p>
      </div>
    </div>
  );
}
