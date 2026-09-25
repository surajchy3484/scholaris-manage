import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Printer,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Row } from "@/lib/exam-export";
import type { GridRequest } from "@/lib/paging";
import type { Dispatch, SetStateAction } from "react";

export type GridColumn<T> = {
  key: string;
  label: string;
  /** Raw value used for search, sorting and exports. */
  value: (row: T) => string | number;
  /** Optional rich cell renderer. */
  render?: (row: T) => ReactNode;
  className?: string;
};

const PAGE_SIZES = [25, 50, 100, 250];

/**
 * Shared professional data table: sticky header, sticky first data column,
 * horizontal scroll, global search, sortable columns, row selection and
 * Excel / CSV / PDF export. Used by Assessment, Question and Clicker modules.
 */
export function DataGrid<T>({
  title,
  description,
  rows,
  columns,
  getId,
  loading,
  toolbar,
  filters,
  selectedIds,
  onSelectedChange,
  onRowClick,
  filename,
  emptyMessage = "No records yet.",
  remote,
}: {
  title: string;
  description?: string;
  rows: T[];
  columns: GridColumn<T>[];
  getId: (row: T) => string;
  loading?: boolean;
  toolbar?: ReactNode;
  filters?: ReactNode;
  selectedIds?: string[];
  onSelectedChange?: (ids: string[]) => void;
  onRowClick?: (row: T) => void;
  filename: string;
  emptyMessage?: string;
  remote?: {
    request: GridRequest;
    onChange: Dispatch<SetStateAction<GridRequest>>;
    total: number;
    exportAll: () => Promise<T[]>;
  };
}) {
  const [localQ, localSetQ] = useState("");
  const [localSort, localSetSort] = useState<string | null>(null);
  const [localDir, localSetDir] = useState<"asc" | "desc">("asc");
  const [localPage, localSetPage] = useState(0);
  const [localSize, localSetSize] = useState(25);
  const [exporting, setExporting] = useState(false);
  const q = remote?.request.search ?? localQ,
    sortKey = remote?.request.sortKey ?? localSort,
    dir = remote?.request.direction ?? localDir;
  const page = remote?.request.page ?? localPage,
    pageSize = remote?.request.pageSize ?? localSize;
  const setQ = (v: string) =>
    remote ? remote.onChange((r) => ({ ...r, search: v, page: 0 })) : localSetQ(v);
  const setSortKey = (v: string) =>
    remote ? remote.onChange((r) => ({ ...r, sortKey: v, page: 0 })) : localSetSort(v);
  const setDir = (v: "asc" | "desc") =>
    remote ? remote.onChange((r) => ({ ...r, direction: v, page: 0 })) : localSetDir(v);
  const setPage = (v: number) =>
    remote ? remote.onChange((r) => ({ ...r, page: v })) : localSetPage(v);
  const setPageSize = (v: number) =>
    remote ? remote.onChange((r) => ({ ...r, pageSize: v, page: 0 })) : localSetSize(v);

  const selectable = !!onSelectedChange;
  const selected = selectedIds ?? [];

  const filtered = useMemo(() => {
    if (remote) return rows;
    const needle = q.trim().toLowerCase();
    const base = needle
      ? rows.filter((r) => columns.some((c) => String(c.value(r)).toLowerCase().includes(needle)))
      : rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return base;
    return [...base].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, columns, q, sortKey, dir, remote]);

  const total = remote?.total ?? filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = remote
    ? filtered
    : filtered.slice(current * pageSize, current * pageSize + pageSize);
  async function runExport(format: "excel" | "csv" | "pdf") {
    const popup = format === "pdf" ? window.open("", "_blank", "width=1100,height=800") : null;
    if (format === "pdf" && !popup) {
      toast.error("Allow pop-ups to print or save as PDF.");
      return;
    }
    if (popup) popup.document.body.textContent = "Preparing the complete report…";
    setExporting(true);
    try {
      const source = remote ? await remote.exportAll() : filtered;
      const exportRows: Row[] = source.map((r) =>
        Object.fromEntries(
          columns.filter((c) => c.key !== "actions").map((c) => [c.label, c.value(r)]),
        ),
      );
      const helpers = await import("@/lib/exam-export");
      if (format === "excel") await helpers.exportRowsToExcel(filename, exportRows);
      else if (format === "csv") await helpers.exportRowsToCsv(filename, exportRows);
      else helpers.printRows(title, exportRows, popup ?? undefined);
    } catch (e) {
      popup?.close();
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const toggleSort = (key: string) => {
    if (key === "actions") return;
    if (sortKey === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir("asc");
    }
    setPage(0);
  };

  const allOnPageSelected = slice.length > 0 && slice.every((r) => selected.includes(getId(r)));

  return (
    <Card className="overflow-hidden border-border/60 p-0 shadow-soft">
      <div className="space-y-3 border-b border-border/60 bg-muted/30 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold">{title}</h3>
            {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Search all columns..."
              className="w-full pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filters}
            <Button
              variant="outline"
              size="sm"
              disabled={exporting || loading}
              onClick={() => runExport("excel")}
            >
              <Download className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting || loading}
              onClick={() => runExport("csv")}
            >
              <FileText className="h-4 w-4" /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting || loading}
              onClick={() => runExport("pdf")}
            >
              <Printer className="h-4 w-4" /> PDF
            </Button>
          </div>
        </div>
      </div>

      {exporting && (
        <p role="status" className="px-4 py-2 text-sm">
          Preparing all matching records for export…
        </p>
      )}
      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {selectable && (
                  <th className="sticky left-0 top-0 z-30 w-10 bg-muted/95 px-3 py-2.5 backdrop-blur">
                    <Checkbox
                      aria-label="Select all on page"
                      checked={allOnPageSelected}
                      onCheckedChange={(c) => {
                        const ids = slice.map(getId);
                        onSelectedChange?.(
                          c
                            ? [...new Set([...selected, ...ids])]
                            : selected.filter((id) => !ids.includes(id)),
                        );
                      }}
                    />
                  </th>
                )}
                {columns.map((c, idx) => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`sticky top-0 cursor-pointer select-none whitespace-nowrap bg-muted/95 px-3 py-2.5 text-left font-semibold backdrop-blur transition-colors hover:bg-muted ${
                      idx === 0 && !selectable ? "left-0 z-30" : "z-20"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {sortKey === c.key &&
                        (dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="py-12 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                slice.map((r) => {
                  const id = getId(r);
                  return (
                    <tr
                      key={id}
                      onClick={() => onRowClick?.(r)}
                      tabIndex={onRowClick ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          onRowClick(r);
                        }
                      }}
                      className={`border-t border-border/60 transition-colors ${
                        onRowClick
                          ? "cursor-pointer hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none active:bg-accent"
                          : "hover:bg-muted/40"
                      } ${selected.includes(id) ? "bg-primary/5" : ""}`}
                    >
                      {selectable && (
                        <td
                          className="sticky left-0 z-10 w-10 bg-background px-3 py-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            aria-label="Select row"
                            checked={selected.includes(id)}
                            onCheckedChange={(c) =>
                              onSelectedChange?.(
                                c ? [...selected, id] : selected.filter((x) => x !== id),
                              )
                            }
                          />
                        </td>
                      )}
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={`whitespace-nowrap px-3 py-2 ${c.className ?? ""}`}
                        >
                          {c.render ? c.render(r) : c.value(r)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          {total === 0
            ? "0 records"
            : `${current * pageSize + 1}–${Math.min(total, (current + 1) * pageSize)} of ${total}`}
          {selected.length > 0 ? ` · ${selected.length} selected` : ""}
        </span>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(0);
            }}
          >
            <SelectTrigger className="h-9 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            disabled={loading || current === 0}
            onClick={() => setPage(current - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs">
            {current + 1} / {pages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={loading || current >= pages - 1}
            onClick={() => setPage(current + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
