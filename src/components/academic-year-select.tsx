import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { listAcademicYears } from "@/lib/academic.functions";
import { chooseAcademicYear, getAcademicYear, setAcademicYear } from "@/lib/academic-year";
import { getAccessToken } from "@/lib/app-access";
import { useAuth } from "@/lib/auth";

function useYears() {
  return useQuery({
    queryKey: ["academic-years"],
    queryFn: () => listAcademicYears({ data: { token: getAccessToken() } }),
    retry: false,
  });
}
// Resolve stale/retired selections before any report or editor starts a query.
export function AcademicYearBoundary({ children }: { children: ReactNode }) {
  const years = useYears();
  const [ready, setReady] = useState(false);
  const current = years.data?.find((year) => year.is_current)?.id;
  const selected =
    years.data &&
    chooseAcademicYear(
      years.data,
      getAcademicYear(),
      typeof window === "undefined"
        ? null
        : sessionStorage.getItem("schoolrise:current-academic-year"),
    );
  useEffect(() => {
    if (!selected || !current) return;
    sessionStorage.setItem("schoolrise:current-academic-year", current);
    if (getAcademicYear() !== selected) setAcademicYear(selected);
    setReady(true);
  }, [selected, current]);
  if (years.error)
    return (
      <p role="alert" className="p-6">
        {years.error.message} <button onClick={() => void years.refetch()}>Retry</button>
      </p>
    );
  if (years.data && !current)
    return (
      <p role="alert" className="p-6">
        Select an active academic year in the database setup.
      </p>
    );
  if (!years.data || !ready || selected !== getAcademicYear())
    return <p className="p-6">Loading current academic year…</p>;
  return children;
}
export function AcademicYearSelect() {
  const years = useYears();
  const navigate = useNavigate();
  const { can } = useAuth();
  const selected = getAcademicYear() ?? years.data?.find((y) => y.is_current)?.id ?? "";
  return (
    <label className="grid gap-1 px-3 py-2 text-xs">
      Academic Year
      <select
        className="rounded border bg-background p-2"
        aria-label="Academic Year"
        value={selected}
        onChange={(e) => {
          if (e.target.value === "__history__") {
            void navigate({ to: "/academic-years", search: { view: "history" } });
          } else setAcademicYear(e.target.value);
        }}
      >
        {years.data?.map((y) => (
          <option key={y.id} value={y.id}>
            {y.name}
            {y.is_current ? " (Current)" : ""}
          </option>
        ))}
        {(years.data?.length ?? 0) > 1 && can("exam_report", "view") && (
          <option value="__history__">All Years / Progress History</option>
        )}
      </select>
      {years.error && <span role="alert">Academic Year setup required</span>}
    </label>
  );
}
