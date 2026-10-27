export interface ShiftValues {
  dateReturnShift: string;
  dateShiftRequested: string;
  department: string;
  exchangeEmployee: string;
  reason: string;
  requestingEmployee: string;
}

export const EMPTY_SHIFT: ShiftValues = {
  department: "",
  requestingEmployee: "",
  exchangeEmployee: "",
  dateShiftRequested: "",
  dateReturnShift: "",
  reason: "",
};
