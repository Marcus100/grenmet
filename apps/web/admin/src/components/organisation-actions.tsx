import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import {
  editOrganisationAction,
  setAppAction,
  setStatusAction,
  unverifyAction,
  verifyAction,
} from "@/app/(console)/organisations/actions";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
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

function Disclosure({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">{label}</summary>
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
        <Textarea
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
        <Button type="submit" variant="outline">
          {submit}
        </Button>
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
            <Input
              defaultValue={organisation.name}
              maxLength={255}
              name="name"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            Slug
            <Input
              className="font-mono"
              defaultValue={organisation.slug}
              maxLength={100}
              name="slug"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            Kind
            <NativeSelect defaultValue={organisation.kind} name="kind">
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </NativeSelect>
          </label>
          <div>
            <Button type="submit" variant="outline">
              Save changes
            </Button>
          </div>
        </form>
      </Disclosure>

      <Disclosure label={suspended ? "Reactivate" : "Suspend"}>
        <div className="grid max-w-md gap-3">
          <p className="text-sm">
            {suspended
              ? "Members will be able to act for this organisation again."
              : "Every organisation-scoped request from its members is refused until it is reactivated. Nothing is deleted."}
          </p>
          <div>
            <ConfirmActionDialog
              action={setStatusAction}
              confirmLabel={
                suspended ? "Reactivate organisation" : "Suspend organisation"
              }
              description={
                suspended
                  ? `${organisation.name} becomes active again and its members can act for it.`
                  : `${organisation.name} is suspended at once. Its members are refused until it is reactivated. Nothing is deleted.`
              }
              destructive={!suspended}
              fields={{
                organisation_id: organisation.id,
                status: suspended ? "active" : "suspended",
              }}
              title={
                suspended
                  ? "Reactivate this organisation?"
                  : "Suspend this organisation?"
              }
              triggerLabel={suspended ? "Reactivate" : "Suspend"}
            />
          </div>
        </div>
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
                <Button size="sm" type="submit" variant="outline">
                  {enabled === true ? "Disable" : "Enable"}
                </Button>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
