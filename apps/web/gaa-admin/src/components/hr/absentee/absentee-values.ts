export interface AbsenteeValues {
  absenceEndTime: string;
  absenceStartTime: string;
  date: string;
  department: string;
  employeeId: string;
  employeeName: string;
  expectedShiftCode: string;
  notes: string;
  reason: string;
}

export const ABSENTEE_REASONS = [
  "Uncertified Sick",
  "Illness on the Job",
  "Illness (family member)",
  "Time Off",
  "Other",
];

export const EMPTY_ABSENTEE: AbsenteeValues = {
  employeeName: "",
  employeeId: "",
  expectedShiftCode: "",
  absenceStartTime: "",
  absenceEndTime: "",
  department: "",
  date: "",
  reason: "Uncertified Sick",
  notes: "",
};
