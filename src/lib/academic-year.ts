export type YearChoice = { id: string; is_current: boolean };

// The active year is configured by the administrator, never inferred from the date.
export function chooseAcademicYear(
  years: YearChoice[],
  selected?: string | null,
  previousCurrent?: string | null,
) {
  const current = years.find((year) => year.is_current)?.id;
  if (!current) return undefined;
  return previousCurrent === current && years.some((year) => year.id === selected)
    ? selected!
    : current;
}
export function getAcademicYear(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return sessionStorage.getItem("schoolrise:academic-year") || undefined;
}
export function setAcademicYear(year: string) {
  sessionStorage.setItem("schoolrise:academic-year", year);
  window.dispatchEvent(new Event("schoolrise:academic-year"));
}
export function resetAcademicYear() {
  sessionStorage.removeItem("schoolrise:academic-year");
  sessionStorage.removeItem("schoolrise:current-academic-year");
}
