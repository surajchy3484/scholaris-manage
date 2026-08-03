import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, FileText, Printer, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportRowsToCsv, exportRowsToExcel, printRows, type Row } from "@/lib/exam-export";

export function ReportTable({
  title,
  rows,
  filename,
  renderCell,
  onRowClick,
  pageSize = 10,
}: {
  title: string;
  rows: Row[];
  filename: string;
  renderCell?: (col: string, value: Row[string], row: Row) => React.ReactNode;
  onRowClick?: (row: Row) => void;
  pageSize?: number;
}) {
  const [q, setQ] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle
      ? rows.filter((r) =>
          Object.values(r).some((v) => String(v).toLowerCase().includes(needle)),
        )
      : rows;
    if (!sortCol) return base;
    return [...base].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, q, sortCol, dir]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (c: string) => {
    if (sortCol === c) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortCol(c);
      setDir("asc");
    }
    setPage(0);
  };

  return (
    <Card className="overflow-hidden border-border/60 p-0 shadow-soft">
      <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Search..."
              className="w-full pl-9 sm:w-56"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => exportRowsToExcel(filename, filtered)}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportRowsToCsv(filename, filtered)}>
            <FileText className="h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!printRows(title, filtered)) toast.error("Allow pop-ups to print or save as PDF.");
            }}
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {cols.map((c) => (
                <TableHead
                  key={c}
                  onClick={() => toggleSort(c)}
                  className="sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap bg-muted/95 font-semibold backdrop-blur"
                >
                  <span className="inline-flex items-center gap-1">
                    {c}
                    {sortCol === c &&
                      (dir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      ))}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.length === 0 ? (
              <TableRow>
                <TableCell colSpan={Math.max(1, cols.length)} className="py-10 text-center text-muted-foreground">
                  No records found.
                </TableCell>
              </TableRow>
            ) : (
              slice.map((r, i) => (
                <TableRow
                  key={i}
                  onClick={() => onRowClick?.(r)}
                  className={onRowClick ? "cursor-pointer" : undefined}
                >
                  {cols.map((c) => (
                    <TableCell key={c} className="whitespace-nowrap">
                      {renderCell ? renderCell(c, r[c], r) : r[c]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <span>
          {filtered.length === 0
            ? "0 records"
            : `${current * pageSize + 1}–${Math.min(filtered.length, (current + 1) * pageSize)} of ${filtered.length}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs">
            Page {current + 1} / {pages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
