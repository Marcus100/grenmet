import {
  approveStaffRegistrationApiV1HrSetupStaffUserIdApproveRegistrationPost,
  balanceInputSchema,
  gradeInputSchema,
  importCatalogueApiV1HrSetupCataloguePost,
  offboardStaffApiV1HrSetupStaffUserIdOffboardPost,
  policyInputSchema,
  previewCatalogueApiV1HrSetupCatalogueGet,
  readSetupGradesApiV1HrSetupGradesGet,
  readSetupPoliciesApiV1HrSetupPoliciesGet,
  readStaffSetupApiV1HrSetupStaffGet,
  staffInputSchema,
  updateSetupGradeApiV1HrSetupGradesGradeIdPut,
  updateSetupPolicyApiV1HrSetupPoliciesKeyPut,
  updateStaffBalanceApiV1HrSetupStaffUserIdBalancePost,
  updateStaffSetupApiV1HrSetupStaffUserIdPut,
} from "@barrelsgd/api-client";

export const readStaff = () => readStaffSetupApiV1HrSetupStaffGet({}).unwrap();
export const readGrades = () =>
  readSetupGradesApiV1HrSetupGradesGet({}).unwrap();
export const readPolicies = () =>
  readSetupPoliciesApiV1HrSetupPoliciesGet({}).unwrap();
export const saveStaff = (id: string, body: unknown) =>
  updateStaffSetupApiV1HrSetupStaffUserIdPut({
    path: { user_id: id },
    body: staffInputSchema.parse(body),
  }).unwrap();
export const saveGrade = (id: string, body: unknown) =>
  updateSetupGradeApiV1HrSetupGradesGradeIdPut({
    path: { grade_id: id },
    body: gradeInputSchema.parse(body),
  }).unwrap();
export const savePolicy = (key: string, body: unknown) =>
  updateSetupPolicyApiV1HrSetupPoliciesKeyPut({
    path: { key },
    body: policyInputSchema.parse(body),
  }).unwrap();
export const offboardStaff = (id: string) =>
  offboardStaffApiV1HrSetupStaffUserIdOffboardPost({
    path: { user_id: id },
  }).unwrap();
export const recordBalance = (id: string, body: unknown) =>
  updateStaffBalanceApiV1HrSetupStaffUserIdBalancePost({
    path: { user_id: id },
    body: balanceInputSchema.parse(body),
  }).unwrap();

export const approveRegistration = (id: string) =>
  approveStaffRegistrationApiV1HrSetupStaffUserIdApproveRegistrationPost({
    path: { user_id: id },
  }).unwrap();

export const previewCatalogue = (departmentId: string) =>
  previewCatalogueApiV1HrSetupCatalogueGet({
    query: { department_id: departmentId },
  }).unwrap();
export const importCatalogue = (departmentId: string) =>
  importCatalogueApiV1HrSetupCataloguePost({
    body: { department_id: departmentId },
  }).unwrap();
