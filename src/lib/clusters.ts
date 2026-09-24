const LOCAL_CLUSTERS_KEY = "schoolrise-local-clusters";

export function isMissingClustersTable(error: { code?: string } | null | undefined) {
  return error?.code === "PGRST205" || error?.code === "42P01";
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
