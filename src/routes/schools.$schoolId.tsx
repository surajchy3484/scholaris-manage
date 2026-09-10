import { useMemo, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Search,
  Upload,
  Download,
  Users,
  MapPin,
  FileSpreadsheet,
  FileArchive,
  Pencil,
  ImageOff,
  School as SchoolIcon,
} from "lucide-react";
import { EditSchoolDialog } from "@/components/add-school-dialog";


import { supabase } from "@/integrations/supabase/client";
import type { School, Student, AttendanceRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StudentCard } from "@/components/student-card";
import { StudentDialog, ViewStudentDialog } from "@/components/student-dialog";
import { ImportStudentsDialog } from "@/components/import-students-dialog";
import { AttendancePanel } from "@/components/attendance-panel";
import { AttendanceReports } from "@/components/attendance-reports";
import { exportStudentsToExcel, exportStudentsAsZip } from "@/lib/excel";

export const Route = createFileRoute("/schools/$schoolId")({
  head: () => ({
    meta: [{ title: "School — SchoolRise" }],
  }),
  component: SchoolDetail,
});

function SchoolDetail() {
  const { schoolId } = Route.useParams();
  const qc = useQueryClient();
  const [addStudent, setAddStudent] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [filterDiv, setFilterDiv] = useState("all");
  const [sortBy, setSortBy] = useState<"roll-asc" | "roll-desc" | "name-asc" | "name-desc">("roll-asc");
  const [editSchoolOpen, setEditSchoolOpen] = useState(false);

  const { data: school } = useQuery({
    queryKey: ["school", schoolId],
    queryFn: async (): Promise<School> => {
      const { data, error } = await supabase.from("schools").select("*").eq("id", schoolId).single();

      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["students", schoolId],
    queryFn: async (): Promise<Student[]> => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Student[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students", schoolId] });
      qc.invalidateQueries({ queryKey: ["schools"] });
      toast.success("Student deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeImage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("schools")
        .update({ image_url: null })
        .eq("id", schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["school", schoolId] });
      qc.invalidateQueries({ queryKey: ["schools"] });
      toast.success("School image removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const classes = useMemo(
    () => Array.from(new Set(students.map((s) => s.class))).sort(),
    [students],
  );
  const divisions = useMemo(
    () =>
      Array.from(
        new Set(
          students.filter((s) => filterClass === "all" || s.class === filterClass).map((s) => s.division),
        ),
      ).sort(),
    [students, filterClass],
  );

  const filtered = useMemo(() => {
    const list = students.filter((s) => {
      if (filterClass !== "all" && s.class !== filterClass) return false;
      if (filterDiv !== "all" && s.division !== filterDiv) return false;
      if (q) {
        const t = q.toLowerCase();
        if (
          !s.name.toLowerCase().includes(t) &&
          !s.student_code.toLowerCase().includes(t) &&
          !s.roll_number.toLowerCase().includes(t)
        )
          return false;
      }
      return true;
    });

    const sortRoll = (a: string, b: string) => {
      const an = parseInt(a, 10);
      const bn = parseInt(b, 10);
      const aIsNum = !Number.isNaN(an);
      const bIsNum = !Number.isNaN(bn);
      if (aIsNum && bIsNum) return an - bn;
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      return a.localeCompare(b);
    };

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "roll-asc":
          return sortRoll(a.roll_number, b.roll_number);
        case "roll-desc":
          return sortRoll(b.roll_number, a.roll_number);
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });
  }, [students, filterClass, filterDiv, q, sortBy]);

  async function handleExport(zipFmt: boolean) {
    if (!school) return;
    const { data: recs } = await supabase
      .from("attendance")
      .select("*")
      .eq("school_id", schoolId);
    const records = (recs ?? []) as AttendanceRecord[];
    const rows = students.map((s) => {
      const own = records.filter((r) => r.student_id === s.id);
      const present = own.filter((r) => r.status === "present").length;
      const pct = own.length ? Math.round((present / own.length) * 100) : 0;
      return {
        student_id: s.student_code,
        name: s.name,
        school_name: school.name,
        class: s.class,
        division: s.division,
        roll_number: s.roll_number,
        attendance_percentage: pct,
        photo_url: s.photo_url && /^https?:\/\//.test(s.photo_url) ? s.photo_url : "",
        created_at: s.created_at,
        updated_at: s.updated_at,
      };
    });
    if (zipFmt) {
      await exportStudentsAsZip(school.name, rows, students);
      toast.success("Exported ZIP");
    } else {
      exportStudentsToExcel(school.name, rows);
      toast.success("Exported Excel");
    }
  }

  if (!school) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" />
          All schools
        </Link>
      </Button>

      {/* School hero */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Card className="flex flex-col gap-5 overflow-hidden bg-gradient-to-br from-primary/95 to-primary-glow p-6 text-primary-foreground sm:flex-row sm:items-center">
          <div
            className="relative shrink-0 overflow-hidden rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm"
            style={{ width: 160, height: 160 }}
          >
            {school.image_url ? (
              <img
                src={school.image_url}
                alt={school.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <SchoolIcon className="h-16 w-16 text-primary-foreground/80" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-primary-foreground/70">
              School
            </p>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">{school.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-primary-foreground/85">
              <MapPin className="h-4 w-4" />
              {school.location}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 backdrop-blur-sm">
              <Users className="h-5 w-5" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-primary-foreground/75">
                  Total students
                </div>
                <div className="font-display text-xl font-bold leading-none">{students.length}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditSchoolOpen(true)}
              >
                <Pencil className="h-4 w-4" />
                {school.image_url ? "Change Image" : "Add Image"}
              </Button>
              {school.image_url && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => removeImage.mutate()}
                  disabled={removeImage.isPending}
                >
                  <ImageOff className="h-4 w-4" />
                  Remove Image
                </Button>
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      <EditSchoolDialog
        school={school}
        open={editSchoolOpen}
        onOpenChange={setEditSchoolOpen}
        onSaved={() => qc.invalidateQueries({ queryKey: ["school", schoolId] })}
      />


      <Tabs defaultValue="students" className="space-y-4">
        <TabsList className="flex w-full flex-wrap gap-1 bg-muted p-1 sm:w-auto">
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* STUDENTS */}
        <TabsContent value="students" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setAddStudent(true)}>
              <Plus className="h-4 w-4" />
              Add Student
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport(false)}>
                  <FileSpreadsheet className="h-4 w-4" /> Excel only
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport(true)}>
                  <FileArchive className="h-4 w-4" /> ZIP (Excel + photos)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="relative ml-auto flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, ID, roll..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c} value={c}>
                    Class {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterDiv} onValueChange={setFilterDiv}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All divisions</SelectItem>
                {divisions.map((d) => (
                  <SelectItem key={d} value={d}>
                    Div {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="roll-asc">Roll No. (Low → High)</SelectItem>
                <SelectItem value="roll-desc">Roll No. (High → Low)</SelectItem>
                <SelectItem value="name-asc">Name (A → Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z → A)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 border-dashed p-10 text-center">
              <Users className="h-8 w-8 text-muted-foreground" />
              <h3 className="font-display text-lg font-semibold">No students found</h3>
              <p className="text-sm text-muted-foreground">
                Add students individually or import from Excel/CSV.
              </p>
            </Card>
          ) : (
            <motion.div layout className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => (
                <StudentCard
                  key={s.id}
                  student={s}
                  onView={() => setViewStudent(s)}
                  onEdit={() => setEditStudent(s)}
                  onDelete={() => del.mutate(s.id)}
                />
              ))}
            </motion.div>
          )}
        </TabsContent>

        {/* ATTENDANCE */}
        <TabsContent value="attendance">
          <AttendancePanel schoolId={schoolId} students={students} />
        </TabsContent>

        {/* REPORTS */}
        <TabsContent value="reports">
          <AttendanceReports schoolId={schoolId} students={students} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {addStudent && (
        <StudentDialog
          open={addStudent}
          onOpenChange={setAddStudent}
          mode="add"
          schoolId={schoolId}
          schoolName={school.name}
          schoolCode={school.code}
        />
      )}
      {editStudent && (
        <StudentDialog
          open={!!editStudent}
          onOpenChange={(o) => !o && setEditStudent(null)}
          mode="edit"
          student={editStudent}
        />
      )}
      <ViewStudentDialog
        student={viewStudent}
        open={!!viewStudent}
        onOpenChange={(o) => !o && setViewStudent(null)}
      />
      <ImportStudentsDialog school={school} open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
