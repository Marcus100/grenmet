/**
 * Legacy GMS titles retained for existing records. All new staff start with self-service.
 * The suggestion pre-fills the role select; the admin can override it.
 * Note: the Technician "Supervisor" titles are technical designations, not
 * HR-approval roles — they map to staff, not hr-supervisor.
 */
export const GMS_POSITIONS: { title: string; suggestedRole: string }[] = [
  { title: "Manager of Meteorology", suggestedRole: "staff" },
  { title: "Assistant Manager of Meteorology", suggestedRole: "staff" },
  { title: "Forecaster (Senior Supervisor)", suggestedRole: "staff" },
  { title: "Instrument Technician (Supervisor)", suggestedRole: "staff" },
  { title: "Climatology Technician (Supervisor)", suggestedRole: "staff" },
  { title: "Meteorological Observer", suggestedRole: "staff" },
  { title: "Meteorological Cadet", suggestedRole: "staff" },
];

export const BASELINE_ROLE = "staff";

export function suggestedRoleForPosition(position: string): string {
  return (
    GMS_POSITIONS.find((p) => p.title === position)?.suggestedRole ??
    BASELINE_ROLE
  );
}

/** Roles to assign at onboarding: the chosen role plus the staff baseline. */
export function rolesToAssign(chosenRole: string): string[] {
  return chosenRole === BASELINE_ROLE
    ? [BASELINE_ROLE]
    : [BASELINE_ROLE, chosenRole];
}
