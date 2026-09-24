const LOCAL_CLUSTERS_KEY = "schoolrise-local-clusters";
const LOCAL_SCHOOL_CLUSTERS_KEY = "schoolrise-local-school-clusters";

export function isMissingClustersTable(error: { code?: string } | null | undefined) {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

export function isMissingSchoolClusterColumn(
  error: { code?: string; message?: string } | null | undefined,
) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST204" ||
    (message.includes("cluster_name") && message.includes("schema cache"))
  );
}

export function readLocalClusters(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_CLUSTERS_KEY);
    const values = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(values)
      ? values.filter((value): value is string => typeof value === "string" && !!value.trim())
      : [];
  } catch {
    return [];
  }
}

export function saveLocalCluster(name: string) {
  if (typeof window === "undefined") return;
  const next = name.trim();
  if (!next) return;
  const values = [...readLocalClusters(), next].filter(
    (value, index, all) =>
      all.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index,
  );
  window.localStorage.setItem(LOCAL_CLUSTERS_KEY, JSON.stringify(values));
}

export function saveLocalSchoolCluster(schoolId: string, clusterName: string) {
  if (typeof window === "undefined" || !schoolId || !clusterName.trim()) return;
  const values = readLocalSchoolClusters();
  values[schoolId] = clusterName.trim();
  window.localStorage.setItem(LOCAL_SCHOOL_CLUSTERS_KEY, JSON.stringify(values));
}

export function readLocalSchoolClusters(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_SCHOOL_CLUSTERS_KEY);
    const values = raw ? (JSON.parse(raw) as unknown) : {};
    return values && typeof values === "object" && !Array.isArray(values)
      ? Object.fromEntries(
          Object.entries(values).filter(
            ([id, name]) => !!id && typeof name === "string" && !!name.trim(),
          ),
        )
      : {};
  } catch {
    return {};
  }
}
