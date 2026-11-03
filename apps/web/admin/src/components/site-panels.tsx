import type { PublicSiteAdmin } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Skeleton } from "@barrelsgd/ui/components/ui/skeleton";
import {
  clearSiteSecretAction,
  createSiteAction,
  updateSiteAction,
} from "@/app/(console)/organisations/site-actions";
import { MAX_SITE_KEY, TURNSTILE_MODES } from "@/lib/site-form";

const FIELD = "rounded-md border bg-background px-2.5 py-1.5";
const BUTTON = "rounded-md border px-3 py-1.5 text-sm hover:bg-muted";
const DANGER =
  "rounded-md border border-destructive px-3 py-1.5 text-destructive text-sm hover:bg-muted";

const MODE_LABELS = {
  inherit: "Inherit (global settings)",
  off: "Off (no bot check)",
  enforce: "Enforce (needs this site's secret)",
} as const;

function acceptedForms(
  site: Pick<PublicSiteAdmin, "accepts_contact" | "accepts_subscriptions">
): string {
  const accepted = [
    site.accepts_contact ? "Contact" : null,
    site.accepts_subscriptions ? "Subscriptions" : null,
  ].filter((item) => item !== null);
  return accepted.length > 0 ? accepted.join(", ") : "None";
}

/** Inputs shared by the create and edit forms. Never given a secret value. */
function SiteFields({ site }: { site?: PublicSiteAdmin }) {
  return (
    <>
      <label className="grid gap-1 text-sm">
        Name
        <input
          className={FIELD}
          defaultValue={site?.name}
          maxLength={255}
          name="name"
          required
        />
      </label>
      <label className="grid gap-1 text-sm">
        Site URL (origin only, for example https://barrels.gd)
        <input
          className={FIELD}
          defaultValue={site?.site_url ?? ""}
          name="site_url"
          type="url"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Contact recipient (inbox for contact messages)
        <input
          className={FIELD}
          defaultValue={site?.contact_recipient ?? ""}
          name="contact_recipient"
          type="email"
        />
      </label>
      <fieldset className="grid gap-1 text-sm">
        <legend>Accepted forms</legend>
        <label className="flex items-center gap-2">
          <input
            defaultChecked={site?.accepts_contact ?? false}
            name="accepts_contact"
            type="checkbox"
          />
          Contact form
        </label>
        <label className="flex items-center gap-2">
          <input
            defaultChecked={site?.accepts_subscriptions ?? false}
            name="accepts_subscriptions"
            type="checkbox"
          />
          Subscriptions
        </label>
      </fieldset>
      <label className="grid gap-1 text-sm">
        Turnstile mode
        <select
          className={FIELD}
          defaultValue={site?.turnstile_mode ?? "inherit"}
          name="turnstile_mode"
        >
          {TURNSTILE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Turnstile site key (public)
        <input
          className={`${FIELD} font-mono`}
          defaultValue={site?.turnstile_site_key ?? ""}
          name="turnstile_site_key"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Turnstile secret (write-only)
        <input
          autoComplete="off"
          className={`${FIELD} font-mono`}
          name="turnstile_secret"
          placeholder={
            site?.turnstile_secret_set ? "A secret is set; type to replace" : ""
          }
          type="password"
        />
      </label>
      <p className="text-muted-foreground text-xs">
        The secret is stored encrypted and never shown again. Leave it empty to
        keep what is stored.
      </p>
    </>
  );
}

function SiteRow({
  organisationId,
  site,
}: {
  organisationId: string;
  site: PublicSiteAdmin;
}) {
  return (
    <li className="space-y-3 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{site.name}</span>
        <span className="font-mono text-xs">{site.key}</span>
        <Badge variant="outline">Turnstile: {site.turnstile_mode}</Badge>
        <Badge
          variant={site.turnstile_secret_set ? "light-success" : "outline"}
        >
          {site.turnstile_secret_set ? "Secret set" : "No secret"}
        </Badge>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        <dt className="text-muted-foreground">Site URL</dt>
        <dd className="break-all">{site.site_url ?? "Not set"}</dd>
        <dt className="text-muted-foreground">Inbox</dt>
        <dd className="break-all">{site.contact_recipient ?? "Not set"}</dd>
        <dt className="text-muted-foreground">Accepts</dt>
        <dd>{acceptedForms(site)}</dd>
      </dl>
      <details>
        <summary className="cursor-pointer font-medium">
          Edit {site.key}
        </summary>
        <form action={updateSiteAction} className="mt-3 grid max-w-md gap-3">
          <input name="organisation_id" type="hidden" value={organisationId} />
          <input name="site_id" type="hidden" value={site.id} />
          <SiteFields site={site} />
          <div>
            <button className={BUTTON} type="submit">
              Save site
            </button>
          </div>
        </form>
        {site.turnstile_secret_set ? (
          <form action={clearSiteSecretAction} className="mt-3">
            <input
              name="organisation_id"
              type="hidden"
              value={organisationId}
            />
            <input name="site_id" type="hidden" value={site.id} />
            <button className={DANGER} type="submit">
              Clear secret
            </button>
          </form>
        ) : null}
      </details>
    </li>
  );
}

export function SitesPanel({
  organisationId,
  sites,
}: {
  organisationId: string;
  sites: PublicSiteAdmin[];
}) {
  return (
    <section aria-labelledby="sites-heading" className="space-y-2">
      <h2 className="font-medium" id="sites-heading">
        Sites ({sites.length})
      </h2>
      {sites.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          No public sites yet. Add one so its contact and subscription forms can
          reach this organisation.
        </p>
      ) : (
        <ul className="max-w-3xl space-y-2">
          {sites.map((site) => (
            <SiteRow
              key={site.id}
              organisationId={organisationId}
              site={site}
            />
          ))}
        </ul>
      )}
      <details className="max-w-3xl rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Add a site
        </summary>
        <form action={createSiteAction} className="mt-3 grid max-w-md gap-3">
          <input name="organisation_id" type="hidden" value={organisationId} />
          <label className="grid gap-1 text-sm">
            Key
            <input
              className={`${FIELD} font-mono`}
              maxLength={MAX_SITE_KEY}
              name="key"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
          </label>
          <p className="text-xs" role="note">
            The key is permanent and cannot be changed later. Use lower-case
            letters, digits and hyphens, up to {MAX_SITE_KEY} characters.
          </p>
          <SiteFields />
          <div>
            <button className={BUTTON} type="submit">
              Create site
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}

export function SitesLoading() {
  return (
    <section
      aria-busy="true"
      aria-labelledby="sites-heading"
      className="space-y-2"
    >
      <h2 className="font-medium" id="sites-heading">
        Sites
      </h2>
      <Skeleton className="h-24 max-w-3xl" />
      <span className="sr-only" role="status">
        Loading sites
      </span>
    </section>
  );
}

export function SitesError() {
  return (
    <section aria-labelledby="sites-heading" className="space-y-2">
      <h2 className="font-medium" id="sites-heading">
        Sites
      </h2>
      <p className="rounded-md border px-3 py-2 text-sm" role="alert">
        Problem: the sites could not be loaded. Reload the page to try again.
      </p>
    </section>
  );
}
