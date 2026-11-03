export const COVERAGE_CLASSES = ["5", "6", "7", "8", "9"] as const;
export type CoverageThresholds = { almost_all: number; partial: number };
export const DEFAULT_COVERAGE_THRESHOLDS: CoverageThresholds = { almost_all: 80, partial: 50 };
export type CoverageMetric = {
  id: string;
  class: string;
  unit: string;
  session_name: string;
  topic: string;
  eligible: number;
  completed: number;
  pending: number;
  not_recorded: number;
};
export type CoverageDetail = {
  id: string;
  school_id: string;
  status: string;
  missing_divisions: number;
  completion_updated_at: string | null;
  divisions: {
    division: string;
    status: string;
    updated_at: string | null;
    updated_by: string | null;
  }[];
};
export function coveragePercentage(row: CoverageMetric) {
  return row.eligible ? (row.completed / row.eligible) * 100 : null;
}
export function coverageCategory(row: CoverageMetric, thresholds = DEFAULT_COVERAGE_THRESHOLDS) {
  const percent = coveragePercentage(row);
  if (percent === null) return "N/A";
  if (row.completed === row.eligible) return "Fully Covered";
  if (percent >= thresholds.almost_all) return "Almost All Schools";
  if (percent >= thresholds.partial) return "Partially Covered";
  if (percent > 0) return "Low Coverage";
  return "Not Started";
}
