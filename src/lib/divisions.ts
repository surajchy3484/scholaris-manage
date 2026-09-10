import { supabase } from "@/integrations/supabase/client";

/**
 * Divisions / batches are fully administrator-defined. They are configured per
 * school on the dashboard and may optionally be scoped to a single class
 * (`class = ""` means the value applies to every class of that school).
 * Names are stored and displayed EXACTLY as typed — never normalised.
 */
export type SchoolDivision = {
  id: string;
  school_id: string;
  class: string;
  name: string;
  sort_order: number;
};

/** Placeholder shown only when a school has no divisions configured yet. */
export const DIVISION_EXAMPLES = ["A", "B", "C"];

export async function fetchSchoolDivisions(schoolId: string): Promise<SchoolDivision[]> {
  const { data, error } = await supabase
    .from("school_divisions")
    .select("id, school_id, class, name, sort_order")
    .eq("school_id", schoolId)
    .order("class")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as SchoolDivision[];
}

export type DivisionDraft = { class: string; name: string };

/** Replaces the whole division list of a school in one round trip. */
export async function saveSchoolDivisions(schoolId: string, rows: DivisionDraft[]) {
  const clean: DivisionDraft[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const name = r.name.trim();
    const klass = r.class.trim();
    if (!name) continue;
    const key = `${klass}||${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ class: klass, name });
  }

  const { error: delErr } = await supabase
    .from("school_divisions")
    .delete()
    .eq("school_id", schoolId);
  if (delErr) throw new Error(delErr.message);

  if (clean.length === 0) return;
  const { error } = await supabase.from("school_divisions").insert(
    clean.map((r, i) => ({
      school_id: schoolId,
      class: r.class,
      name: r.name,
      sort_order: i,
    })),
  );
  if (error) throw new Error(error.message);
}

/**
 * Division names to show for a class: the class-specific list when one exists,
 * otherwise the school-wide list.
 */
export function divisionsForClass(all: SchoolDivision[], klass: string | null): string[] {
  const forClass = all.filter((d) => klass !== null && d.class === klass).map((d) => d.name);
  if (forClass.length > 0) return forClass;
  return all.filter((d) => d.class === "").map((d) => d.name);
}
