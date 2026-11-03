// Organization-wide centre total confirmed by the user; distinct from cluster-group counts.
export const TOTAL_REAP_CENTRES = 6;
/** User-defined organizational structure; Kalwa Centre is not a sixth cluster. */
export const REAP_CLUSTERS = [
  "Shahapur Cluster",
  "Kalwa Cluster",
  "Chembur Cluster",
  "Manmad Cluster",
  "Palghar Cluster",
] as const;
export const REAP_CENTRE = "Kalwa Centre (REAP Centre)";
export const ORGANIZATION_GROUPS = [...REAP_CLUSTERS, REAP_CENTRE];
export function normalizeOrganizationGroup(value: string) {
  const name = value.trim();
  const key = name.toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ");
  if (/^kalwa cent(?:er|re)s?(?: \(reap cent(?:er|re)s?\))?$/.test(key)) return REAP_CENTRE;
  return REAP_CLUSTERS.find((cluster) => cluster.toLowerCase() === key) ?? name;
}
export function schoolOrganizationGroup(school: {
  name: string;
  location?: string;
  cluster_name?: string | null;
}) {
  const value = `${school.name} ${school.location ?? ""}`.toLowerCase();
  const stored = normalizeOrganizationGroup(school.cluster_name ?? "");
  // Preserve the established location corrections from School Dashboard.
  if (["talasari", "uplat", "nagari", "ashagad"].some((name) => value.includes(name)))
    return "Palghar Cluster";
  if (value.includes("manmad")) return "Manmad Cluster";
  if (stored) return stored;
  if (/cent(?:er|re)/.test(value) && value.includes("kalwa")) return REAP_CENTRE;
  if (value.includes("kalwa")) return "Kalwa Cluster";
  if (["chembur", "govandi", "mankhurd"].some((name) => value.includes(name)))
    return "Chembur Cluster";
  if (["shahapur", "bamne", "dhasai", "khadavali"].some((name) => value.includes(name)))
    return "Shahapur Cluster";
  return "Other / Unassigned";
}
/** Groups whose name identifies them as centres (not clusters). */
export function isCentreGroup(name: string) {
  return /cent(?:er|re)/.test(name.toLowerCase());
}

export function countGroups(names: Iterable<string>) {
  const groups = new Set(
    [...names].map((name) => name.trim()).filter((name) => !!name && name !== "Other / Unassigned"),
  );
  const list = [...groups];
  return {
    clusters: list.filter((name) => !isCentreGroup(name)).length,
    centres: list.filter((name) => isCentreGroup(name)).length,
  };
}

export function countOrganizationGroups(schools: { group_name: string }[]) {
  return countGroups(schools.map((s) => s.group_name));
}
