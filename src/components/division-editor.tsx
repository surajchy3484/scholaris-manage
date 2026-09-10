import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DivisionDraft } from "@/lib/divisions";

/**
 * Free-text editor for a school's divisions / batches. Whatever is typed here
 * is exactly what trainers see in Session Status — no A–F restriction.
 */
export function DivisionEditor({
  rows,
  onChange,
}: {
  rows: DivisionDraft[];
  onChange: (rows: DivisionDraft[]) => void;
}) {
  const set = (i: number, patch: Partial<DivisionDraft>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label>Divisions / Batches</Label>
        <span className="text-xs text-muted-foreground">
          e.g. A, Batch 1, Morning Batch
        </span>
      </div>

      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
          No divisions yet. Add the names this school actually uses.
        </p>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2">
            <Input
              value={r.name}
              placeholder="Division / batch name"
              onChange={(e) => set(i, { name: e.target.value })}
            />
            <Input
              value={r.class}
              placeholder="Class"
              title="Leave blank to use this division for every class"
              onChange={(e) => set(i, { class: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove division"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { class: "", name: "" }])}
      >
        <Plus className="h-4 w-4" /> Add Division / Batch
      </Button>
      <p className="text-xs text-muted-foreground">
        Leave the Class box blank to offer that division for every class.
      </p>
    </div>
  );
}
