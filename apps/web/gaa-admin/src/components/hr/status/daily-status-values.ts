import type { StatusReportEntryInput } from "@barrelsgd/api-client";

export type DailyStatusEntry = StatusReportEntryInput & {
  employee_name?: string | null;
};

export interface DailyStatusValues {
  absenteeism: string;
  affectedEfficiency: string;
  affectedExplain: string;
  allReported: string;
  comments: string;
  date: string;
  department: string;
  entries: DailyStatusEntry[];
  equipmentOperational: string;
  equipmentReason: string;
  equipmentRemedy: string;
  incidentExplain: string;
  incidentsSubmitted: string;
  notReportedExplain: string;
  shift: string;
}

export const SHIFT_OPTIONS = ["M", "E", "N"];
export const YES_NO = ["Yes", "No"];

export const EMPTY_DAILY_STATUS: DailyStatusValues = {
  department: "",
  date: "",
  shift: "M",
  entries: [],
  equipmentOperational: "",
  equipmentReason: "",
  equipmentRemedy: "",
  incidentsSubmitted: "",
  incidentExplain: "",
  absenteeism: "",
  allReported: "",
  notReportedExplain: "",
  affectedEfficiency: "No",
  affectedExplain: "",
  comments: "",
};
