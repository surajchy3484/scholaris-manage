import { useState } from "react";
import { toDisplayablePhotoUrl } from "@/lib/drive.functions";
import type { StudentListRow, ScoreFilters } from "@/lib/student-list";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Eye, Pencil, Trash2 } from "lucide-react";

export function StudentScoreFilters({
  value,
  onChange,
}: {
  value: ScoreFilters;
  onChange: (v: ScoreFilters) => void;
}) {
  const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs">
        Attendance
        <select
          className={selectClass}
          value={value.attendance}
          onChange={(e) =>
            onChange({ ...value, attendance: e.target.value as ScoreFilters["attendance"] })
          }
        >
          <option value="all">All attendance</option>
          <option value="recorded">Recorded</option>
          <option value="missing">Not recorded</option>
          <option value="below75">Below 75%</option>
          <option value="atleast75">75% and above</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        Assessment
        <select
          className={selectClass}
          value={value.exam}
          onChange={(e) => onChange({ ...value, exam: e.target.value as ScoreFilters["exam"] })}
        >
          {["ICA", "IMF", "FCA"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        Score status
        <select
          className={selectClass}
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as ScoreFilters["status"] })}
        >
          <option value="all">All scores</option>
          <option value="recorded">Recorded</option>
          <option value="missing">Not recorded</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        Minimum score
        <Input
          className="h-9 w-28"
          type="number"
          min={0}
          max={100}
          value={value.min}
          onChange={(e) => onChange({ ...value, min: e.target.value })}
        />
      </label>
      <label className="grid gap-1 text-xs">
        Maximum score
        <Input
          className="h-9 w-28"
          type="number"
          min={0}
          max={100}
          value={value.max}
          onChange={(e) => onChange({ ...value, max: e.target.value })}
        />
      </label>
    </div>
  );
}

function StudentThumbnail({ student }: { student: StudentListRow }) {
  const [failed, setFailed] = useState(false);
  const src = toDisplayablePhotoUrl(student.photo_url, 80);
  const initials =
    student.name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {src && !failed ? (
        <img
          src={src}
          alt={student.name}
          width={40}
          height={40}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label={`No photo for ${student.name}`}>{initials}</span>
      )}
    </span>
  );
}

export function StudentListTable({
  rows,
  selectedIds,
  onSelect,
  onView,
  onEdit,
  onDelete,
  loading = false,
}: {
  rows: StudentListRow[];
  selectedIds: string[];
  onSelect: (id: string, checked: boolean) => void;
  onView: (row: StudentListRow) => void;
  onEdit?: (row: StudentListRow) => void;
  onDelete?: (row: StudentListRow) => void;
  loading?: boolean;
}) {
  const selected = new Set(selectedIds);
  return (
    <div
      className="max-h-[65vh] overflow-auto rounded-xl border bg-card"
      tabIndex={0}
      role="region"
      aria-label="Student details"
      aria-busy={loading}
    >
      <table className="w-full min-w-[1050px] text-left text-sm">
        <caption className="sr-only">
          Student details. IMF displays the existing MCA/IMF assessment score.
        </caption>
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            {[
              "Photo",
              "Select",
              "Student ID",
              "Student Name",
              "Class",
              "Division / Section",
              "Roll No.",
              "Attendance",
              "ICA",
              "IMF",
              "FCA",
              "Actions",
            ].map((h) => (
              <th scope="col" className="whitespace-nowrap px-3 py-3 font-medium" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={12} className="p-8 text-center" role="status">
                Loading students…
              </td>
            </tr>
          ) : !rows.length ? (
            <tr>
              <td colSpan={12} className="p-8 text-center text-muted-foreground">
                No students match these filters.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t hover:bg-muted/40 focus-within:bg-muted/40"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('button,input,a,[role="checkbox"]'))
                    return;
                  onView(row);
                }}
                data-state={selected.has(row.id) ? "selected" : undefined}
              >
                <td className="w-16 px-3 py-2">
                  <button
                    type="button"
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Open profile for ${row.name}`}
                    onClick={() => onView(row)}
                  >
                    <StudentThumbnail key={row.photo_url ?? "no-photo"} student={row} />
                  </button>
                </td>
                <td className="px-3 py-2">
                  <Checkbox
                    aria-label={`Select ${row.name}`}
                    checked={selected.has(row.id)}
                    onCheckedChange={(v) => onSelect(row.id, !!v)}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-xs">{row.student_code}</td>
                <td className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    className="rounded text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onView(row)}
                    aria-label={`View profile for ${row.name}`}
                  >
                    {row.name}
                  </button>
                </td>
                <td className="px-3 py-2">{row.class}</td>
                <td className="px-3 py-2">{row.division}</td>
                <td className="px-3 py-2">{row.roll_number}</td>
                <td className="px-3 py-2 tabular-nums">
                  {row.attendance_recorded ? `${row.attendance_pct}%` : "—"}
                </td>
                {[row.ica, row.mca, row.fca].map((v, i) => (
                  <td key={i} className="px-3 py-2 tabular-nums">
                    {v ?? "—"}
                  </td>
                ))}
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`View ${row.name}`}
                      onClick={() => onView(row)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {onEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${row.name}`}
                        onClick={() => onEdit(row)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${row.name}`}
                        onClick={() => onDelete(row)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
