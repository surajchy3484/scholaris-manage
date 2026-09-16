import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { getAccessToken } from "@/lib/app-access";
import { useAuth } from "@/lib/auth";
import {
  ACTIONS,
  ACTION_LABELS,
  MODULES,
  MODULE_LABELS,
  TRAINER_PERMISSIONS,
  type AppAction,
  type AppModule,
  type AppRole,
  type Permissions,
} from "@/lib/access-control";
import {
  deleteUser,
  listUsers,
  resetUserPassword,
  saveUser,
  setUserActive,
  type AppUserRow,
} from "@/lib/users.functions";
import { RequireModule } from "@/components/require-module";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "User Access — SchoolRise" },
      {
        name: "description",
        content:
          "Create STEM Trainer logins, choose what each person can do, and assign the schools they work with.",
      },
      { property: "og:title", content: "User Access — SchoolRise" },
      {
        property: "og:description",
        content: "Create STEM Trainer logins and control access per module and school.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireModule module="users">
      <UsersPage />
    </RequireModule>
  ),
});

type FormState = {
  id?: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  role: AppRole;
  password: string;
  isActive: boolean;
  allSchools: boolean;
  schoolIds: string[];
  permissions: Permissions;
};

const emptyForm = (): FormState => ({
  username: "",
  fullName: "",
  email: "",
  phone: "",
  role: "trainer",
  password: "",
  isActive: true,
  allSchools: false,
  schoolIds: [],
  permissions: TRAINER_PERMISSIONS,
});

function UsersPage() {
  const qc = useQueryClient();
  const { ready, isAdmin, can } = useAuth();
  const canManage = isAdmin || can("users", "edit") || can("users", "add");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [pwTarget, setPwTarget] = useState<AppUserRow | null>(null);
  const [newPw, setNewPw] = useState("");

  const usersQ = useQuery({
    queryKey: ["app-users"],
    queryFn: () => listUsers({ data: { token: getAccessToken() } }),
    enabled: ready,
  });

  const schoolsQ = useQuery({
    queryKey: ["schools-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["app-users"] });

  const saveM = useMutation({
    mutationFn: () =>
      saveUser({
        data: {
          token: getAccessToken(),
          ...(form.id ? { id: form.id } : {}),
          username: form.username.trim(),
          fullName: form.fullName.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
          isActive: form.isActive,
          permissions: form.permissions as Record<string, string[]>,
          schoolIds: form.schoolIds,
          allSchools: form.allSchools,
        },
      }),
    onSuccess: () => {
      toast.success(form.id ? "Account updated" : "Account created");
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActiveM = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) =>
      setUserActive({ data: { token: getAccessToken(), ...v } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteUser({ data: { token: getAccessToken(), id } }),
    onSuccess: () => {
      toast.success("Account removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetM = useMutation({
    mutationFn: () =>
      resetUserPassword({
        data: { token: getAccessToken(), id: pwTarget!.id, password: newPw },
      }),
    onSuccess: () => {
      toast.success("Password updated");
      setPwTarget(null);
      setNewPw("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const schools = schoolsQ.data ?? [];
  const schoolName = useMemo(
    () => new Map(schools.map((s) => [s.id, s.name])),
    [schools],
  );

  const startAdd = () => {
    setForm(emptyForm());
    setOpen(true);
  };

  const startEdit = (u: AppUserRow) => {
    setForm({
      id: u.id,
      username: u.username,
      fullName: u.full_name ?? "",
      email: u.email ?? "",
      phone: u.phone ?? "",
      role: u.role === "admin" ? "admin" : "trainer",
      password: "",
      isActive: u.is_active,
      allSchools: u.all_schools,
      schoolIds: u.school_ids ?? [],
      permissions: u.permissions ?? {},
    });
    setOpen(true);
  };

  const togglePerm = (module: AppModule, action: AppAction) => {
    setForm((f) => {
      const current = f.permissions[module] ?? [];
      const next = current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action];
      return { ...f, permissions: { ...f.permissions, [module]: next } };
    });
  };

  const toggleSchool = (id: string) =>
    setForm((f) => ({
      ...f,
      schoolIds: f.schoolIds.includes(id)
        ? f.schoolIds.filter((s) => s !== id)
        : [...f.schoolIds, id],
    }));

  if (!ready) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            User Access
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create STEM Trainer logins, pick what they can do, and assign their schools.
          </p>
        </div>
        <Button onClick={startAdd} disabled={!canManage} className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          Add user
        </Button>
      </div>

      <div className="mt-6 grid gap-3">
        {usersQ.isLoading && (
          <>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </>
        )}
        {usersQ.isError && (
          <Card className="p-6 text-sm text-destructive">
            Could not load accounts. {(usersQ.error as Error).message}
          </Card>
        )}
        {usersQ.data?.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground">
            No accounts yet. Add your first STEM Trainer.
          </Card>
        )}
        {(usersQ.data ?? []).map((u) => {
          const modules = Object.entries(u.permissions ?? {}).filter(
            ([, actions]) => (actions as string[]).length > 0,
          );
          return (
            <Card key={u.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-semibold">
                      {u.full_name || u.username}
                    </span>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role === "admin" ? "Administrator" : "STEM Trainer"}
                    </Badge>
                    {!u.is_active && <Badge variant="destructive">Disabled</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    @{u.username}
                    {u.email ? ` · ${u.email}` : ""}
                    {u.phone ? ` · ${u.phone}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {u.last_login_at
                      ? `Last signed in ${new Date(u.last_login_at).toLocaleString()} · ${u.login_count} sign-ins`
                      : "Has not signed in yet"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={u.is_active}
                    onCheckedChange={(v) => toggleActiveM.mutate({ id: u.id, isActive: v })}
                    aria-label="Account enabled"
                  />
                  <Button variant="outline" size="sm" onClick={() => startEdit(u)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPwTarget(u)}>
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Remove ${u.full_name || u.username}?`)) deleteM.mutate(u.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {u.role === "admin" ? (
                  <Badge variant="outline" className="gap-1">
                    <ShieldCheck className="h-3 w-3" /> Full access to everything
                  </Badge>
                ) : (
                  modules.map(([m, actions]) => (
                    <Badge key={m} variant="outline">
                      {MODULE_LABELS[m as AppModule]}:{" "}
                      {(actions as AppAction[]).map((a) => ACTION_LABELS[a]).join(", ")}
                    </Badge>
                  ))
                )}
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                Schools:{" "}
                {u.role === "admin" || u.all_schools
                  ? "All schools"
                  : (u.school_ids ?? []).map((id) => schoolName.get(id) ?? "Unknown").join(", ") ||
                    "None assigned"}
              </p>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit user" : "Add user"}</DialogTitle>
            <DialogDescription>
              Trainers only see the modules and schools you allow here.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="u-name">Full name</Label>
                <Input
                  id="u-name"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Riya Sharma"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-username">Username</Label>
                <Input
                  id="u-username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="riya.trainer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-email">Email (optional)</Label>
                <Input
                  id="u-email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-phone">Phone (optional)</Label>
                <Input
                  id="u-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      role: v as AppRole,
                      permissions: v === "trainer" ? TRAINER_PERMISSIONS : {},
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trainer">STEM Trainer</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-pw">{form.id ? "New password (optional)" : "Password"}</Label>
                <Input
                  id="u-pw"
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })
                  }
                  placeholder="At least 6 characters"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
              <span>Account enabled</span>
            </label>

            {form.role === "trainer" && (
              <>
                <div>
                  <Label className="text-sm font-semibold">What they can do</Label>
                  <div className="mt-2 overflow-x-auto rounded-xl border border-border/60">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 text-left font-medium">Module</th>
                          {ACTIONS.map((a) => (
                            <th key={a} className="p-2 text-center font-medium">
                              {ACTION_LABELS[a]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {MODULES.map((m) => (
                          <tr key={m} className="border-t border-border/60">
                            <td className="p-2">{MODULE_LABELS[m]}</td>
                            {ACTIONS.map((a) => (
                              <td key={a} className="p-2 text-center">
                                <Checkbox
                                  checked={(form.permissions[m] ?? []).includes(a)}
                                  onCheckedChange={() => togglePerm(m, a)}
                                  aria-label={`${MODULE_LABELS[m]} ${ACTION_LABELS[a]}`}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold">Schools they can work with</Label>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.allSchools}
                      onCheckedChange={(v) => setForm({ ...form, allSchools: v === true })}
                    />
                    <span>All schools</span>
                  </label>
                  {!form.allSchools && (
                    <div className="mt-2 grid max-h-48 gap-1.5 overflow-y-auto rounded-xl border border-border/60 p-3 sm:grid-cols-2">
                      {schools.length === 0 && (
                        <p className="text-sm text-muted-foreground">No schools added yet.</p>
                      )}
                      {schools.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={form.schoolIds.includes(s.id)}
                            onCheckedChange={() => toggleSchool(s.id)}
                          />
                          <span className="truncate">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (form.username.trim().length < 3) {
                  toast.error("Username must be at least 3 characters.");
                  return;
                }
                if (!form.id && form.password.length < 6) {
                  toast.error("Set a password of at least 6 characters.");
                  return;
                }
                if (form.password && form.password.length < 6) {
                  toast.error("Password must be at least 6 characters.");
                  return;
                }
                saveM.mutate();
              }}
              disabled={saveM.isPending}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              {saveM.isPending ? "Saving..." : form.id ? "Save changes" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwTarget} onOpenChange={(v) => !v && setPwTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {pwTarget?.full_name || pwTarget?.username}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reset-pw">New password</Label>
            <Input
              id="reset-pw"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={newPw.length < 6 || resetM.isPending}
              onClick={() => resetM.mutate()}
            >
              {resetM.isPending ? "Saving..." : "Update password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
