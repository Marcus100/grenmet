import {
  balanceInputSchema,
  gradeInputSchema,
  offboardStaffApiV1HrSetupStaffUserIdOffboardPost,
  policyInputSchema,
  readSetupGradesApiV1HrSetupGradesGet,
  readSetupPoliciesApiV1HrSetupPoliciesGet,
  readStaffSetupApiV1HrSetupStaffGet,
  staffInputSchema,
  updateSetupGradeApiV1HrSetupGradesGradeIdPut,
  updateSetupPolicyApiV1HrSetupPoliciesKeyPut,
  updateStaffBalanceApiV1HrSetupStaffUserIdBalancePost,
  updateStaffSetupApiV1HrSetupStaffUserIdPut,
} from "@barrelsgd/api-client";

export const readStaff = () => readStaffSetupApiV1HrSetupStaffGet();
export const readGrades = () => readSetupGradesApiV1HrSetupGradesGet();
export const readPolicies = () => readSetupPoliciesApiV1HrSetupPoliciesGet();
export const saveStaff = (id: string, body: unknown) =>
  updateStaffSetupApiV1HrSetupStaffUserIdPut(id, staffInputSchema.parse(body));
export const saveGrade = (id: string, body: unknown) =>
  updateSetupGradeApiV1HrSetupGradesGradeIdPut(
    id,
    gradeInputSchema.parse(body)
  );
export const savePolicy = (key: string, body: unknown) =>
  updateSetupPolicyApiV1HrSetupPoliciesKeyPut(
    key,
    policyInputSchema.parse(body)
  );
export const offboardStaff = (id: string) =>
  offboardStaffApiV1HrSetupStaffUserIdOffboardPost(id);
export const recordBalance = (id: string, body: unknown) =>
  updateStaffBalanceApiV1HrSetupStaffUserIdBalancePost(
    id,
    balanceInputSchema.parse(body)
  );
