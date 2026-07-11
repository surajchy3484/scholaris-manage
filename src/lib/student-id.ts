// Generate a unique, readable student ID
// Format: STU-<school-prefix>-<yyyymm>-<random>
export function generateStudentCode(schoolName: string): string {
  const prefix = schoolName
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `STU-${prefix}-${ym}-${rand}`;
}
