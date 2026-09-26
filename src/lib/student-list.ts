import type { StudentReport } from "./exam";
export type StudentListRow = StudentReport & { attendance_recorded: boolean };
export type ScoreFilters = {
  attendance: "all" | "recorded" | "missing" | "below75" | "atleast75";
  exam: "ICA" | "IMF" | "FCA";
  status: "all" | "recorded" | "missing";
  min: string;
  max: string;
};
export const EMPTY_SCORE_FILTERS: ScoreFilters = {
  attendance: "all",
  exam: "ICA",
  status: "all",
  min: "",
  max: "",
};
