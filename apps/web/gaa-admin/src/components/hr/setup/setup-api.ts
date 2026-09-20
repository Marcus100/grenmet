import {
  balanceInputSchema,
  gradeInputSchema,
  hrApproveStaffRegistration,
  hrGetSetupGrades,
  hrGetSetupPolicies,
  hrGetStaffSetup,
  hrImportCatalogue,
  hrOffboardStaff,
  hrPreviewCatalogue,
  hrUpdateSetupGrade,
  hrUpdateSetupPolicy,
  hrUpdateStaffBalance,
  hrUpdateStaffSetup,
  policyInputSchema,
  staffInputSchema,
} from "@barrelsgd/api-client";

export const readStaff = () => hrGetStaffSetup({}).unwrap();
export const readGrades = () => hrGetSetupGrades({}).unwrap();
export const readPolicies = () => hrGetSetupPolicies({}).unwrap();
export const saveStaff = (id: string, body: unknown) =>
  hrUpdateStaffSetup({
    path: { user_id: id },
    body: staffInputSchema.parse(body),
  }).unwrap();
export const saveGrade = (id: string, body: unknown) =>
  hrUpdateSetupGrade({
    path: { grade_id: id },
    body: gradeInputSchema.parse(body),
  }).unwrap();
export const savePolicy = (key: string, body: unknown) =>
  hrUpdateSetupPolicy({
    path: { key },
    body: policyInputSchema.parse(body),
  }).unwrap();
export const offboardStaff = (id: string) =>
  hrOffboardStaff({
    path: { user_id: id },
  }).unwrap();
export const recordBalance = (id: string, body: unknown) =>
  hrUpdateStaffBalance({
    path: { user_id: id },
    body: balanceInputSchema.parse(body),
  }).unwrap();

export const approveRegistration = (id: string) =>
  hrApproveStaffRegistration({
    path: { user_id: id },
  }).unwrap();

export const previewCatalogue = (departmentId: string) =>
  hrPreviewCatalogue({
    query: { department_id: departmentId },
  }).unwrap();
export const importCatalogue = (departmentId: string) =>
  hrImportCatalogue({
    body: { department_id: departmentId },
  }).unwrap();
