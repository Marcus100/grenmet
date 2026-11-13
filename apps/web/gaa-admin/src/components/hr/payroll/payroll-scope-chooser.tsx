import type { OrganisationPublic } from "@barrelsgd/api-client";
import { PayrollEmpty } from "./payroll-states";

/** Shown when the person belongs to several organisations and none is chosen. */
export function PayrollChooseOrganisation({
  basePath,
  organisations,
}: {
  basePath: string;
  organisations: OrganisationPublic[];
}) {
  return (
    <section aria-label="Choose an organisation" className="space-y-3">
      <p className="text-sm">
        Choose the organisation whose payroll you want to see.
      </p>
      <ul className="space-y-2">
        {organisations.map((organisation) => (
          <li key={organisation.id}>
            <a
              className="text-info underline"
              href={`${basePath}?org=${encodeURIComponent(organisation.id)}`}
            >
              {organisation.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PayrollNoOrganisation() {
  return (
    <PayrollEmpty>
      You do not belong to an organisation that uses payroll yet.
    </PayrollEmpty>
  );
}
