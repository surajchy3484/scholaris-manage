import { getAcademicYear } from "./academic-year";
import { getAccessToken } from "./app-access";
import { listMasterPage } from "./performance.functions";
import { DEFAULT_GRID_REQUEST, type GridRequest, type PageResult } from "./paging";
export type MasterTable = "assessments" | "questions" | "clicker_records";
export type MasterPageArgs = GridRequest & {
  assessmentId?: string;
  examType?: string;
  minScore?: number;
  subject: string;
  className: string;
  section: string;
  team: string;
};
export const INITIAL_MASTER_ARGS: MasterPageArgs = {
  ...DEFAULT_GRID_REQUEST,
  subject: "",
  className: "",
  section: "",
  team: "",
};
export function masterPageQueryOptions<T>(table: MasterTable, args: MasterPageArgs) {
  const academicYear = getAcademicYear();
  return {
    queryKey: [table === "clicker_records" ? "clicker" : table, "page", args, academicYear],
    queryFn: () =>
      listMasterPage({
        data: { token: getAccessToken(), academicYear, table, ...args },
      }) as Promise<PageResult<T>>,
  };
}

export function initialMasterPageArgs(table: MasterTable): MasterPageArgs {
  return {
    ...INITIAL_MASTER_ARGS,
    ...(table === "questions"
      ? { examType: "" }
      : table === "clicker_records"
        ? { assessmentId: "all" }
        : {}),
  };
}
