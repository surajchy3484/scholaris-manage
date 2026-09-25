import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/app-access";
import { listMasterPage } from "@/lib/performance.functions";
import { DEFAULT_GRID_REQUEST, type GridRequest, type PageResult } from "@/lib/paging";
export function useDebounced<T>(value: T, delay = 250) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setResult(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return result;
}
export function useMasterPage<T>(
  table: "assessments" | "questions" | "clicker_records",
  filters: { assessmentId?: string; subject?: string; minScore?: number } = {},
) {
  const [request, setRequest] = useState<GridRequest>(DEFAULT_GRID_REQUEST);
  const search = useDebounced(request.search),
    subject = useDebounced(filters.subject ?? "");
  const filterKey = JSON.stringify([filters.assessmentId, subject, filters.minScore]);
  const [previousFilter, setPreviousFilter] = useState(filterKey);
  if (previousFilter !== filterKey) {
    setPreviousFilter(filterKey);
    setRequest((r) => ({ ...r, page: 0 }));
  }
  const args = useMemo(
    () => ({
      ...request,
      search,
      assessmentId: filters.assessmentId,
      minScore: filters.minScore,
      subject,
    }),
    [request, search, filters.assessmentId, filters.minScore, subject],
  );
  const query = useQuery({
    queryKey: [table === "clicker_records" ? "clicker" : table, "page", args],
    queryFn: () =>
      listMasterPage({ data: { token: getAccessToken(), table, ...args } }) as Promise<
        PageResult<T>
      >,
  });
  useEffect(() => {
    if (query.data && request.page > 0 && request.page * request.pageSize >= query.data.total)
      setRequest((r) => ({
        ...r,
        page: Math.max(0, Math.ceil(query.data!.total / r.pageSize) - 1),
      }));
  }, [query.data, request.page, request.pageSize]);
  const remote = useMemo(
    () => ({
      request,
      onChange: setRequest,
      total: query.data?.total ?? 0,
      exportAll: async () => {
        const rows: T[] = [];
        const batch = 250;
        // Export uses the same server filters and ordering, not just the visible page.
        for (let page = 0; ; page++) {
          const result = (await listMasterPage({
            data: { token: getAccessToken(), table, ...args, page, pageSize: batch },
          })) as PageResult<T>;
          rows.push(...result.rows);
          if (result.rows.length < batch || rows.length >= result.total) break;
        }
        return rows;
      },
    }),
    [args, request, table, query.data?.total],
  );
  return { ...query, remote };
}
