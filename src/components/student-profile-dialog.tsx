import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toDisplayablePhotoUrl } from "@/lib/drive.functions";
import { STATUS_COLORS, type StudentReport } from "@/lib/exam";
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/60 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

export function StudentProfileDialog({
  student,
  open,
  onOpenChange,
}: {
  student: StudentReport | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  chartFallback?: unknown;
}) {
  if (!student) return null;
  const chart = [
    { name: "Attendance", value: student.attendance_pct },
    { name: "ICA", value: student.ica ?? 0 },
    { name: "IMF", value: student.mca ?? 0 },
    { name: "FCA", value: student.fca ?? 0 },
    { name: "Overall", value: student.performance },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Student profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-muted ring-4 ring-accent">
              {student.photo_url ? (
                <img
                  src={toDisplayablePhotoUrl(student.photo_url) ?? ""}
                  alt={student.name}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
                  No Photo
                </div>
              )}
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2 text-sm">
              <Info label="Student ID" value={student.student_code} />
              <Info label="Name" value={student.name} />
              <Info label="Class" value={student.class} />
              <Info label="Division" value={student.division} />
              <Info label="Roll Number" value={student.roll_number} />
              <Info label="Attendance" value={`${student.attendance_pct}%`} />
              <Info label="ICA Score" value={String(student.ica ?? "—")} />
              <Info label="MCA Score" value={String(student.mca ?? "—")} />
              <Info label="FCA Score" value={String(student.fca ?? "—")} />
              <Info label="Overall Performance" value={`${student.performance}%`} />
              <Info
                label="Enrollment Date"
                value={student.enrollment_date ?? student.created_at.slice(0, 10)}
              />
              <Info label="Last Updated" value={student.updated_at.slice(0, 10)} />
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">Performance</h4>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis domain={[0, 100]} fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" name="Score" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Remarks
            </div>
            <p className="mt-1">
              {student.remarks ??
                `Overall performance ${student.performance}% — ${student.status}.`}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate font-medium">{value}</div>
    </div>
  );
}
