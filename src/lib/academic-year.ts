export const DEFAULT_ACADEMIC_YEAR = "2026";

export function getAcademicYear(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const stored = sessionStorage.getItem("schoolrise:academic-year");
  return stored === "2026-27" ? DEFAULT_ACADEMIC_YEAR : stored || DEFAULT_ACADEMIC_YEAR;
}
export function setAcademicYear(year: string) {
  sessionStorage.setItem("schoolrise:academic-year", year);
  window.dispatchEvent(new Event("schoolrise:academic-year"));
}
