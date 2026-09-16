import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, Search, School as SchoolIcon, ArrowUpDown, Users } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { School } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddSchoolDialog } from "@/components/add-school-dialog";
import { fetchAllRows } from "@/lib/fetch-all";
import { SchoolCard } from "@/components/school-card";
import { RequireModule } from "@/components/require-module";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — SchoolRise" },
      { name: "description", content: "All your schools in one place." },
    ],
  }),
  component: () => (
    <RequireModule module="dashboard">
      <Dashboard />
    </RequireModule>
  ),
});

type SchoolWithCount = School & { student_count: number };

async function fetchSchools(): Promise<SchoolWithCount[]> {
  const { data: schools, error } = await supabase
    .from("schools")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  // PostgREST returns at most 1000 rows per request — page through the table so
  // the totals stay correct for large datasets.
  const students = await fetchAllRows<{ school_id: string }>((from, to) =>
    supabase.from("students").select("school_id").range(from, to),
  );
  const counts = new Map<string, number>();
  students.forEach((s) => {
    counts.set(s.school_id, (counts.get(s.school_id) ?? 0) + 1);
  });
  return (schools ?? []).map((s) => ({ ...s, student_count: counts.get(s.id) ?? 0 }));
}

function Dashboard() {
  const { canSeeSchool, can, ready } = useAuth();
  const canAddSchool = can("schools", "add");
  const canManageSchool = can("schools", "edit") || can("schools", "delete");
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "name" | "students">("newest");
  const qc = useQueryClient();

  const { data: allSchools = [], isLoading: loadingSchools } = useQuery({
    queryKey: ["schools"],
    queryFn: fetchSchools,
  });

  // Trainers only see the schools assigned to them.
  const isLoading = loadingSchools || !ready;
  const data = ready ? allSchools.filter((s) => canSeeSchool(s.id)) : [];

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schools").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schools"] });
      toast.success("School deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = data
    .filter(
      (s) =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.location.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "students") return b.student_count - a.student_count;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const totalStudents = data.reduce((n, s) => n + s.student_count, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Hero stats */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8 grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Card className="relative overflow-hidden border-none bg-gradient-to-br from-primary to-primary-glow p-5 text-primary-foreground shadow-elegant sm:p-6">
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-primary-foreground/80">
              <SchoolIcon className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Total Schools</span>
            </div>
            <div className="mt-3 font-display text-5xl font-bold sm:text-6xl">{data.length}</div>
            <p className="mt-1 text-sm text-primary-foreground/80">Active campuses</p>
          </div>
        </Card>

        <Card className="relative overflow-hidden border-none bg-gradient-to-br from-[oklch(0.62_0.24_305)] to-[oklch(0.58_0.22_265)] p-5 text-primary-foreground shadow-elegant sm:p-6">
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-primary-foreground/80">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Total Students</span>
            </div>
            <div className="mt-3 font-display text-5xl font-bold sm:text-6xl">
              {totalStudents.toLocaleString()}
            </div>
            <p className="mt-1 text-sm text-primary-foreground/80">Across all campuses</p>
          </div>
        </Card>

        {canAddSchool && (
        <Card className="flex flex-col justify-between gap-4 border-warm/40 bg-warm/40 p-5 shadow-soft sm:p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-warm-foreground/70">
              Ready to grow?
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-warm-foreground">
              Add a new school
            </h2>
            <p className="mt-1 text-sm text-warm-foreground/80">
              Unlimited campuses. Each with its own students &amp; attendance.
            </p>
          </div>
          <Button size="lg" onClick={() => setAddOpen(true)} className="w-full shadow-elegant sm:w-auto sm:self-start">
            <Plus className="h-4 w-4" />
            Add School
          </Button>
        </Card>
        )}
      </motion.section>


      {/* Controls */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl font-bold">Your Schools</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search schools..."
              className="w-full pl-9 sm:w-64"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="w-full sm:w-44">
              <ArrowUpDown className="h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="name">Name (A–Z)</SelectItem>
              <SelectItem value="students">Most students</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed p-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-accent">
            <Users className="h-6 w-6 text-accent-foreground" />
          </div>
          <h3 className="font-display text-lg font-semibold">No schools yet</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            {canAddSchool
              ? "Add your first school to start managing students and attendance."
              : "No schools have been assigned to you yet. Ask an administrator for access."}
          </p>
          {canAddSchool && (
            <Button onClick={() => setAddOpen(true)} className="mt-1">
              <Plus className="h-4 w-4" />
              Add School
            </Button>
          )}
        </Card>
      ) : (
        <motion.div
          layout
          className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <SchoolCard
                school={s}
                onDelete={() => del.mutate(s.id)}
                onUpdated={() => qc.invalidateQueries({ queryKey: ["schools"] })}
                canManage={canManageSchool}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      <AddSchoolDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
