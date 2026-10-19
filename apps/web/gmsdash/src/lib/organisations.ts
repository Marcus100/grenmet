export interface OrganisationStanding {
  entitled: boolean;
  id: string;
  name: string;
  request_status: string | null;
  role: string;
}

/**
 * The organisation a page acts for: the one named in `?org=` when the person
 * belongs to it, otherwise the first entitled one, otherwise the first.
 */
export function chooseOrganisation(
  organisations: readonly OrganisationStanding[],
  requested: string | null
): OrganisationStanding | null {
  return (
    organisations.find((o) => o.id === requested) ??
    organisations.find((o) => o.entitled) ??
    organisations[0] ??
    null
  );
}

/** Whether this role may ask GMS for access on the organisation's behalf. */
export function canRequestAccess(role: string): boolean {
  return role === "owner" || role === "admin";
}

export function firstParam(
  value: string | string[] | undefined
): string | null {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.trim() || null;
}
