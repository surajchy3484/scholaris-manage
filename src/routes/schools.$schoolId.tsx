import { useDebounced } from "@/hooks/use-master-page";
import {
  listStudentDetails,
  studentFacets,
  deleteStudentDetails,
  updateStudentGrouping,
} from "@/lib/performance.functions";
import { getAccessToken } from "@/lib/app-access";
import { fetchAllRows } from "@/lib/fetch-all";
import { attendanceTotals } from "@/lib/paging";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Trash2,
  CheckSquare,
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
import { StudentListTable, StudentScoreFilters } from "@/components/student-list";
import { EMPTY_SCORE_FILTERS, type ScoreFilters } from "@/lib/student-list";
import { StudentDialog, ViewStudentDialog } from "@/components/student-dialog";
import { ImportStudentsDialog } from "@/components/import-students-dialog";
import { AttendancePanel } from "@/components/attendance-panel";
import { AttendanceReports } from "@/components/attendance-reports";

import { RequireModule } from "@/components/require-module";
import { useAuth } from "@/lib/auth";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/schools/$schoolId")({
  head: () => ({
    meta: [{ title: "School — SchoolRise" }],
  }),
  component: () => (
    <RequireModule module="students">
      <SchoolDetail />
    </RequireModule>
  ),
});

function SchoolDetail() {
  const { schoolId } = Route.useParams();
  const { can, isAdmin } = useAuth();
  const canAdd = can("students", "add");
  const canEdit = can("students", "edit");
  const canDelete = can("students", "delete");
  const canImport = can("students", "import");
  const canExport = can("students", "export");
  const qc = useQueryClient();
  const [addStudent, setAddStudent] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [filterDiv, setFilterDiv] = useState("all");
  const [sortBy, setSortBy] = useState<"roll-asc" | "roll-desc" | "name-asc" | "name-desc">(
    "roll-asc",
  );
  const [editSchoolOpen, setEditSchoolOpen] = useState(false);
  const [scoreFilters, setScoreFilters] = useState<ScoreFilters>(EMPTY_SCORE_FILTERS);
  const debouncedScores = useDebounced(scoreFilters);
  const scoreArgs = {
    ...debouncedScores,
    min: debouncedScores.min === "" ? null : Number(debouncedScores.min),
    max: debouncedScores.max === "" ? null : Number(debouncedScores.max),
  };
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState("students");
  const [exporting, setExporting] = useState(false);
  const debouncedSearch = useDebounced(q);
  useEffect(
    () => setPage(0),
    [debouncedSearch, filterClass, filterDiv, sortBy, schoolId, debouncedScores],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveClass, setMoveClass] = useState("");
  const [moveDivision, setMoveDivision] = useState("");
  const [moveRoll, setMoveRoll] = useState("");

  const { data: school, error: schoolError } = useQuery({
    queryKey: ["school", schoolId],
    queryFn: async (): Promise<School> => {
      const { data, error } = await supabase
        .from("schools")
        .select("*")
        .eq("id", schoolId)
        .single();

      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const facets = useQuery({
    queryKey: ["students", schoolId, "facets"],
    queryFn: () => studentFacets({ data: { token: getAccessToken(), schoolId } }),
  });
  const pageQuery = useQuery({
    queryKey: [
      "students",
      schoolId,
      "page",
      page,
      debouncedSearch,
      filterClass,
      filterDiv,
      sortBy,
      scoreArgs,
    ],
    queryFn: () =>
      listStudentDetails({
        data: {
          token: getAccessToken(),
          module: "students",
          ...scoreArgs,
          schoolId,
          page,
          pageSize: 50,
          search: debouncedSearch,
          sortKey: sortBy,
          direction: "asc",
          klass: filterClass,
          division: filterDiv,
        },
      }),
  });
  const students = pageQuery.data?.rows ?? [];
  const isLoading =
    pageQuery.isLoading || q !== debouncedSearch || scoreFilters !== debouncedScores;
  const total = pageQuery.data?.total ?? 0;
  useEffect(() => {
    if (pageQuery.data && page > 0 && page * 50 >= total)
      setPage(Math.max(0, Math.ceil(total / 50) - 1));
  }, [pageQuery.data, page, total]);
  const fetchAllStudents = () =>
    fetchAllRows<Student>((from, to) =>
      supabase.from("students").select("*").eq("school_id", schoolId).order("id").range(from, to),
    );
  const attendanceStudents = useQuery({
    queryKey: ["students", schoolId, "attendance-roster"],
    queryFn: fetchAllStudents,
    enabled: tab !== "students",
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await deleteStudentDetails({
        data: { token: getAccessToken(), module: "students", schoolId, ids: [id] },
      });
    },
    onSuccess: (_data, id) => {
      setSelectedIds((current) => current.filter((selectedId) => selectedId !== id));
      qc.invalidateQueries({ queryKey: ["students", schoolId] });
      qc.invalidateQueries({ queryKey: ["schools"] });
      toast.success("Student deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      for (let offset = 0; offset < ids.length; offset += 250) {
        await deleteStudentDetails({
          data: {
            token: getAccessToken(),
            module: "students",
            schoolId,
            ids: ids.slice(offset, offset + 250),
          },
        });
      }
    },
    onSuccess: () => {
      setSelectedIds([]);
      setBulkDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ["students", schoolId] });
      qc.invalidateQueries({ queryKey: ["schools"] });
      toast.success("Selected students deleted");
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["students", schoolId] });
      qc.invalidateQueries({ queryKey: ["schools"] });
    },
  });

  const bulkMove = useMutation({
    mutationFn: async () => {
      const payload: { class?: string; division?: string; roll_number?: string } = {};
      if (moveClass.trim()) payload.class = moveClass.trim();
      if (moveDivision.trim()) payload.division = moveDivision.trim();
      if (moveRoll.trim()) payload.roll_number = moveRoll.trim();
      if (!Object.keys(payload).length) throw new Error("Enter at least one change");
      const ids = [...selectedIds];
      for (let offset = 0; offset < ids.length; offset += 250) {
        await updateStudentGrouping({
          data: {
            token: getAccessToken(),
            schoolId,
            ids: ids.slice(offset, offset + 250),
            values: payload,
          },
        });
      }
    },
    onSuccess: () => {
      setSelectedIds([]);
      setMoveOpen(false);
      setMoveClass("");
      setMoveDivision("");
      setMoveRoll("");
      qc.invalidateQueries({ queryKey: ["students", schoolId] });
      toast.success("Student details updated");
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["students", schoolId] });
      qc.invalidateQueries({ queryKey: ["schools"] });
    },
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
    () => [...new Set((facets.data?.groups ?? []).map((s) => s.class))].sort(),
    [facets.data],
  );
  const divisions = useMemo(
    () =>
      [
        ...new Set(
          (facets.data?.groups ?? [])
            .filter((s) => filterClass === "all" || s.class === filterClass)
            .map((s) => s.division),
        ),
      ].sort(),
    [facets.data, filterClass],
  );
  const filtered = students;

  const [selecting, setSelecting] = useState(false);
  const selectionScope = `${schoolId}|${q}|${filterClass}|${filterDiv}|${JSON.stringify(scoreFilters)}`;
  const scopeRef = useRef(selectionScope);
  scopeRef.current = selectionScope;
  useEffect(() => {
    setSelectedIds([]);
  }, [selectionScope]);
  const allFilteredSelected = total > 0 && selectedIds.length === total;
  async function selectMatching(openDelete = false) {
    const scope = scopeRef.current;
    setSelecting(true);
    try {
      const ids: string[] = [];
      for (let selectedPage = 0; ; selectedPage++) {
        const result = await listStudentDetails({
          data: {
            token: getAccessToken(),
            module: "students",
            ...scoreFilters,
            min: scoreFilters.min === "" ? null : Number(scoreFilters.min),
            max: scoreFilters.max === "" ? null : Number(scoreFilters.max),
            schoolId,
            page: selectedPage,
            pageSize: 250,
            search: q,
            sortKey: sortBy,
            direction: "asc",
            klass: filterClass,
            division: filterDiv,
          },
        });
        ids.push(...result.rows.map((row) => row.id));
        if (result.rows.length < 250 || ids.length >= result.total) break;
      }
      if (scopeRef.current !== scope) return;
      setSelectedIds(ids);
      if (openDelete && ids.length) setBulkDeleteOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to select students");
    } finally {
      setSelecting(false);
    }
  }
  const toggleAll = () => (allFilteredSelected ? setSelectedIds([]) : void selectMatching());

  async function handleExport(zipFmt: boolean) {
    if (!school) return;
    setExporting(true);
    try {
      const [allStudents, records, helpers] = await Promise.all([
        fetchAllStudents(),
        fetchAllRows<{ student_id: string; status: string }>((from, to) =>
          supabase
            .from("attendance")
            .select("student_id,status")
            .eq("school_id", schoolId)
            .order("id")
            .range(from, to),
        ),
        import("@/lib/excel"),
      ]);
      const totals = attendanceTotals(records);
      const rows = allStudents.map((s) => {
        const t = totals.get(s.id);
        const pct = t?.total ? Math.round((t.present / t.total) * 100) : 0;
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
        await helpers.exportStudentsAsZip(school.name, rows, allStudents);
        toast.success("Exported ZIP");
      } else {
        await helpers.exportStudentsToExcel(school.name, rows);
        toast.success("Exported Excel");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (schoolError)
    return (
      <p role="alert" className="p-6 text-destructive">
        Unable to load school: {schoolError.message}
      </p>
    );
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
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
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
                <div className="font-display text-xl font-bold leading-none">
                  {facets.data?.total ?? "…"}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {isAdmin && (
                <Button size="sm" variant="secondary" onClick={() => setEditSchoolOpen(true)}>
                  <Pencil className="h-4 w-4" />
                  {school.image_url ? "Change Image" : "Add Image"}
                </Button>
              )}
              {isAdmin && school.image_url && (
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

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex w-full flex-wrap gap-1 bg-muted p-1 sm:w-auto">
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* STUDENTS */}
        <TabsContent value="students" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setAddStudent(true)} disabled={!canAdd}>
              <Plus className="h-4 w-4" />
              Add Student
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!canImport}>
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={exporting}>
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport(false)} disabled={!canExport}>
                  <FileSpreadsheet className="h-4 w-4" /> Excel only
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport(true)} disabled={!canExport}>
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
            <Select
              value={filterClass}
              onValueChange={(value) => {
                setFilterClass(value);
                setFilterDiv("all");
                setSelectedIds([]);
              }}
            >
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
            <Select
              value={filterDiv}
              onValueChange={(value) => {
                setFilterDiv(value);
                setSelectedIds([]);
              }}
            >
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

          <StudentScoreFilters value={scoreFilters} onChange={setScoreFilters} />
          <Card className="flex flex-wrap items-center gap-3 border-border/60 bg-muted/20 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={allFilteredSelected}
                onCheckedChange={toggleAll}
                disabled={selecting || isLoading}
              />
              <span>{selecting ? "Selecting…" : `Select All (${total})`}</span>
            </label>
            {selectedIds.length > 0 && (
              <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
                <span className="mr-1 text-sm font-semibold text-primary">
                  {selectedIds.length} selected
                </span>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMoveOpen(true)}
                    disabled={!canEdit}
                  >
                    <CheckSquare className="h-4 w-4" /> Change Class/Division
                  </Button>
                )}
                {canDelete && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setBulkDeleteOpen(true)}
                    disabled={bulkDelete.isPending}
                  >
                    <Trash2 className="h-4 w-4" /> Delete Selected
                  </Button>
                )}
              </div>
            )}
            {canDelete && filterClass !== "all" && filterDiv !== "all" && filtered.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={selecting || isLoading}
                onClick={() => void selectMatching(true)}
              >
                Delete all in Class {filterClass} · Div {filterDiv}
              </Button>
            )}
          </Card>

          {(pageQuery.isError || facets.isError) && (
            <p role="alert" className="text-destructive">
              {pageQuery.error?.message ?? facets.error?.message}
            </p>
          )}
          <StudentListTable
            rows={students}
            selectedIds={selectedIds}
            loading={isLoading}
            onView={setViewStudent}
            onEdit={canEdit ? setEditStudent : undefined}
            onDelete={
              canDelete
                ? (row) => {
                    if (window.confirm(`Delete ${row.name}? This cannot be undone.`))
                      del.mutate(row.id);
                  }
                : undefined
            }
            onSelect={(id, checked) =>
              setSelectedIds((current) =>
                checked ? [...new Set([...current, id])] : current.filter((value) => value !== id),
              )
            }
          />
          <div className="flex items-center justify-between gap-3 text-sm">
            <Button
              variant="outline"
              disabled={page === 0 || isLoading}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>
              {total
                ? `${page * 50 + 1}–${Math.min((page + 1) * 50, total)} of ${total}`
                : "0 students"}
            </span>
            <Button
              variant="outline"
              disabled={(page + 1) * 50 >= total || isLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
          {exporting && <p role="status">Preparing the complete school export…</p>}
        </TabsContent>

        {/* ATTENDANCE */}
        <TabsContent value="attendance">
          {attendanceStudents.isPending ? (
            <p role="status">Loading attendance roster…</p>
          ) : attendanceStudents.isError ? (
            <p role="alert">Unable to load attendance roster.</p>
          ) : (
            <AttendancePanel
              key={schoolId}
              schoolId={schoolId}
              students={attendanceStudents.data ?? []}
            />
          )}
        </TabsContent>

        {/* REPORTS */}
        <TabsContent value="reports">
          {attendanceStudents.isPending ? (
            <p role="status">Loading report roster…</p>
          ) : attendanceStudents.isError ? (
            <p role="alert">Unable to load report roster.</p>
          ) : (
            <AttendanceReports schoolId={schoolId} students={attendanceStudents.data ?? []} />
          )}
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

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected students?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete {selectedIds.length} student
              {selectedIds.length === 1 ? "" : "s"}
              {filterClass !== "all" && filterDiv !== "all"
                ? ` from Class ${filterClass} · Division ${filterDiv}`
                : " from this school"}
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkDelete.mutate(selectedIds)}
            >
              {bulkDelete.isPending ? "Deleting…" : "Delete Students"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Class / Division</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Move {selectedIds.length} selected students. Leave a field blank to keep it unchanged.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              placeholder="New class"
              value={moveClass}
              onChange={(e) => setMoveClass(e.target.value)}
            />
            <Input
              placeholder="New division"
              value={moveDivision}
              onChange={(e) => setMoveDivision(e.target.value)}
            />
            <Input
              placeholder="New roll (optional)"
              value={moveRoll}
              onChange={(e) => setMoveRoll(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => bulkMove.mutate()}
              disabled={bulkMove.isPending || selectedIds.length === 0}
            >
              {bulkMove.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
