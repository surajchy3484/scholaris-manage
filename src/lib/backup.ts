import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "./fetch-all";
import type { School, Student } from "./types";
import FileSaver from "file-saver";

const { saveAs } = FileSaver;

export async function backupDatabase() {
  const [schools, students, attendance] = await Promise.all([
    fetchAllRows<School>((from, to) =>
      supabase.from("schools").select("*").order("id").range(from, to),
    ),
    fetchAllRows<Student>((from, to) =>
      supabase.from("students").select("*").order("id").range(from, to),
    ),
    fetchAllRows<
      import("@/integrations/supabase/types").Database["public"]["Tables"]["attendance"]["Row"]
    >((from, to) => supabase.from("attendance").select("*").order("id").range(from, to)),
  ]);
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    schools,
    students,
    attendance,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  saveAs(blob, `school-app-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export async function restoreDatabase(file: File) {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!payload.schools || !payload.students) throw new Error("Invalid backup file");

  // Insert missing primary keys only. Existing rows and relationships are never overwritten.
  // Parent tables precede children; retries are safe after a partially completed restore.
  for (const table of ["schools", "students", "attendance"] as const) {
    const rows = payload[table] ?? [];
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row.id !== "string"))
      throw new Error(`Invalid ${table} backup rows`);
  }
  for (const table of ["schools", "students", "attendance"] as const) {
    const rows = payload[table] ?? [];
    for (let offset = 0; offset < rows.length; offset += 250) {
      const { error } = await supabase.from(table).upsert(rows.slice(offset, offset + 250), {
        onConflict: "id",
        ignoreDuplicates: true,
      });
      if (error)
        throw new Error(
          `Restore stopped at ${table} batch ${offset / 250 + 1}: ${error.message}. Existing records were preserved; earlier batches may have been added.`,
        );
    }
  }
}
