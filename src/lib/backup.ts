import { supabase } from "@/integrations/supabase/client";
import { saveAs } from "file-saver";

export async function backupDatabase() {
  const [schools, students, attendance] = await Promise.all([
    supabase.from("schools").select("*"),
    supabase.from("students").select("*"),
    supabase.from("attendance").select("*"),
  ]);
  if (schools.error || students.error || attendance.error) {
    throw new Error("Failed to read database");
  }
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    schools: schools.data,
    students: students.data,
    attendance: attendance.data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  saveAs(blob, `school-app-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export async function restoreDatabase(file: File) {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!payload.schools || !payload.students) throw new Error("Invalid backup file");

  // Wipe existing data (attendance -> students -> schools cascades handled by FK)
  await supabase.from("attendance").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("students").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("schools").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  if (payload.schools.length) {
    const { error } = await supabase.from("schools").insert(payload.schools);
    if (error) throw error;
  }
  if (payload.students?.length) {
    const { error } = await supabase.from("students").insert(payload.students);
    if (error) throw error;
  }
  if (payload.attendance?.length) {
    const { error } = await supabase.from("attendance").insert(payload.attendance);
    if (error) throw error;
  }
}
