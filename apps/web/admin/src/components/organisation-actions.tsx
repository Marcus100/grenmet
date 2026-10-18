import {
  editOrganisationAction,
  setAppAction,
  setStatusAction,
  unverifyAction,
  verifyAction,
} from "@/app/(console)/organisations/actions";
import { KINDS } from "@/lib/organisation-form";

export interface ActionOrganisation {
  apps: { app_key: string; enabled: boolean }[];
  available_apps: { key: string; label: string }[];
  id: string;
  kind: string;
  name: string;
  slug: string;
  status: string;
  verified_at?: string | null;
}

const FIELD = "rounded-md border bg-background px-2.5 py-1.5";
const BUTTON = "rounded-md border px-3 py-1.5 text-sm hover:bg-muted";
const DANGER =
  "rounded-md border border-destructive px-3 py-1.5 text-destructive text-sm hover:bg-muted";

function Disclosure({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer font-medium text-sm">{label}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function ReasonForm({
  action,
  id,
  label,
  submit,
}: {
  action: (formData: FormData) => Promise<never>;
  id: string;
  label: string;
  submit: string;
}) {
  return (
    <form action={action} className="grid max-w-md gap-3">
      <input name="organisation_id" type="hidden" value={id} />
      <label className="grid gap-1 text-sm">
        {label}
        <textarea
          className={FIELD}
          maxLength={500}
          minLength={3}
          name="reason"
          required
          rows={3}
        />
      </label>
      <p className="text-muted-foreground text-xs">
        The reason is recorded in the organisation&apos;s history.
      </p>
      <div>
        <button className={BUTTON} type="submit">
          {submit}
        </button>
      </div>
    </form>
  );
}

/** Staff actions. Each is a plain form posting to a server action; FastAPI decides. */
export function OrganisationActions({
  organisation,
}: {
  organisation: ActionOrganisation;
}) {
  const verified = Boolean(organisation.verified_at);
  const suspended = organisation.status === "suspended";
  return (
    <section aria-labelledby="actions-heading" className="space-y-3">
      <h2 className="font-medium" id="actions-heading">
        Actions
      </h2>

      {verified ? (
        <Disclosure label="Remove verification">
          <ReasonForm
            action={unverifyAction}
            id={organisation.id}
            label="Reason for removing verification"
            submit="Remove verification"
          />
        </Disclosure>
      ) : (
        <Disclosure label="Verify organisation">
          <ReasonForm
            action={verifyAction}
            id={organisation.id}
            label="What was checked"
            submit="Verify organisation"
          />
        </Disclosure>
      )}

      <Disclosure label="Edit details">
        <form action={editOrganisationAction} className="grid max-w-md gap-3">
          <input name="organisation_id" type="hidden" value={organisation.id} />
          <label className="grid gap-1 text-sm">
            Name
            <input
              className={FIELD}
              defaultValue={organisation.name}
              maxLength={255}
              name="name"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            Slug
            <input
              className={`${FIELD} font-mono`}
              defaultValue={organisation.slug}
              maxLength={100}
              name="slug"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            Kind
            <select
              className={FIELD}
              defaultValue={organisation.kind}
              name="kind"
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          <div>
            <button className={BUTTON} type="submit">
              Save changes
            </button>
          </div>
        </form>
      </Disclosure>

      <Disclosure label={suspended ? "Reactivate" : "Suspend"}>
        <form action={setStatusAction} className="grid max-w-md gap-3">
          <input name="organisation_id" type="hidden" value={organisation.id} />
          <input
            name="status"
            type="hidden"
            value={suspended ? "active" : "suspended"}
          />
          <p className="text-sm">
            {suspended
              ? "Members will be able to act for this organisation again."
              : "Every organisation-scoped request from its members is refused until it is reactivated. Nothing is deleted."}
          </p>
          <div>
            <button className={suspended ? BUTTON : DANGER} type="submit">
              {suspended ? "Confirm reactivate" : "Confirm suspend"}
            </button>
          </div>
        </form>
      </Disclosure>
    </section>
  );
}

function entitlementLabel(enabled: boolean | undefined): string {
  if (enabled === undefined) return "Not set";
  return enabled ? "Enabled" : "Disabled";
}

/** One row per registered app; an app with no row is "Not set". */
export function AppEntitlements({
  organisation,
}: {
  organisation: ActionOrganisation;
}) {
  const state = new Map(
    organisation.apps.map((app) => [app.app_key, app.enabled])
  );
  return (
    <section aria-labelledby="apps-heading" className="space-y-2">
      <h2 className="font-medium" id="apps-heading">
        App access
      </h2>
      <ul className="max-w-xl divide-y rounded-md border text-sm">
        {organisation.available_apps.map((app) => {
          const enabled = state.get(app.key);
          return (
            <li
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              key={app.key}
            >
              <span>
                <span className="font-medium">{app.label}</span>{" "}
                <span className="font-mono text-xs">{app.key}</span>
                {" - "}
                <span className="text-muted-foreground">
                  {entitlementLabel(enabled)}
                </span>
              </span>
              <form action={setAppAction}>
                <input
                  name="organisation_id"
                  type="hidden"
                  value={organisation.id}
                />
                <input name="app_key" type="hidden" value={app.key} />
                <input
                  name="enabled"
                  type="hidden"
                  value={enabled === true ? "false" : "true"}
                />
                <button className={BUTTON} type="submit">
                  {enabled === true ? "Disable" : "Enable"}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
