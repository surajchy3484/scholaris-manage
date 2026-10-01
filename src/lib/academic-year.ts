export function getAcademicYear(): string | undefined {
  return typeof window === "undefined"
    ? undefined
    : sessionStorage.getItem("schoolrise:academic-year") || undefined;
}
export function setAcademicYear(year: string) {
  sessionStorage.setItem("schoolrise:academic-year", year);
  window.dispatchEvent(new Event("schoolrise:academic-year"));
}
