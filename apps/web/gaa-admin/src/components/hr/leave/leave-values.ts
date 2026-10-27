export interface LeaveValues {
  daysRequested: string;
  department: string;
  employeeName: string;
  endDate: string;
  leaveAddress: string;
  leaveType: string;
  otherReason: string;
  professionalAppointmentSubtype: string;
  requiresActingAppointment: boolean;
  salaryInAdvance: boolean;
  startDate: string;
  travelFromDate: string;
  travelToDate: string;
}

export const JURY_DUTY_LABEL = "Jury Duty (provisional)";

export const LEAVE_TYPES = [
  "Annual Vacation",
  "Maternity Leave",
  "Professional Appointment",
  "Family Bereavement",
  "Paternity Leave",
  JURY_DUTY_LABEL,
  "Other",
];

export const EMPTY_LEAVE: LeaveValues = {
  employeeName: "",
  department: "",
  daysRequested: "",
  startDate: "",
  endDate: "",
  leaveAddress: "",
  leaveType: "Annual Vacation",
  otherReason: "",
  professionalAppointmentSubtype: "",
  requiresActingAppointment: false,
  salaryInAdvance: false,
  travelFromDate: "",
  travelToDate: "",
};
