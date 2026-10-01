import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { listAcademicYears } from "@/lib/academic.functions";
import { getAcademicYear, setAcademicYear } from "@/lib/academic-year";
import { getAccessToken } from "@/lib/app-access";
export function AcademicYearSelect() {
  const years = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => listAcademicYears({ data: { token: getAccessToken() } }),
    retry: false,
  });
  const selected = getAcademicYear() ?? years.data?.find((y) => y.is_current)?.id ?? "";
  useEffect(() => {
    if (selected) sessionStorage.setItem("schoolrise:academic-year", selected);
  }, [selected]);
  return (
    <label className="grid gap-1 px-3 py-2 text-xs">
      Academic Year
      <select
        className="rounded border bg-background p-2"
        aria-label="Academic Year"
        value={selected}
        onChange={(e) => {
          setAcademicYear(e.target.value);
        }}
      >
        {!years.data?.length && <option value="">Year setup required</option>}
        {years.data?.map((y) => (
          <option key={y.id} value={y.id}>
            {y.name}
            {y.is_current ? " (Current)" : ""}
          </option>
        ))}
      </select>
      {years.error && <span role="alert">Academic Year setup required</span>}
    </label>
  );
}
