import type { Metadata } from "next";
import Link from "next/link";
import { getAccessStatus, listMyOrganisations } from "@/lib/api";
import {
  canRequestAccess,
  chooseOrganisation,
  firstParam,
} from "@/lib/organisations";
import { requireSession } from "@/lib/session";
import { requestAccessAction } from "./actions";

export const metadata: Metadata = {
  title: "Access",
  description: "Whether your organisation can use the GMS Dashboard.",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const NOTICES: Record<string, string> = {
  duplicate: "A request for this organisation is already waiting for GMS.",
  error: "That organisation could not be found.",
  forbidden: "Only an owner or admin of the organisation can ask for access.",
  requested: "Request sent. GMS will review it.",
};

export default async function AccessPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await requireSession("/access");
  const organisations = await listMyOrganisations(session.accessToken);
  const organisation = chooseOrganisation(
    organisations,
    firstParam(params.org)
  );
  const notice = NOTICES[firstParam(params.notice) ?? ""];

  if (!organisation) {
    return (
      <section className="space-y-2">
        <h1 className="font-semibold text-2xl">Access</h1>
        <p className="max-w-2xl text-muted-foreground">
          You are not a member of an organisation yet. Ask an organisation owner
          to invite you; access is requested per organisation.
        </p>
      </section>
    );
  }

  const access = await getAccessStatus(session.accessToken, organisation.id);
  const request = access.request;
  const canAsk = !access.entitled && request?.status !== "pending";
  const mayRequest = canRequestAccess(organisation.role);

  return (
    <section className="space-y-4">
      <h1 className="font-semibold text-2xl">Access</h1>
      {notice ? (
        <p
          className="rounded-md border bg-muted px-3 py-2 text-sm"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      {organisations.length > 1 ? (
        <ul className="flex flex-wrap gap-2 text-sm">
          {organisations.map((o) => (
            <li key={o.id}>
              <Link
                aria-current={o.id === organisation.id ? "page" : undefined}
                className={`rounded-md border px-2.5 py-1 hover:bg-muted ${
                  o.id === organisation.id ? "bg-muted font-medium" : ""
                }`}
                href={`/access?org=${encodeURIComponent(o.id)}`}
              >
                {o.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-2 rounded-md border p-4">
        <h2 className="font-medium">{organisation.name}</h2>
        {access.entitled ? (
          <p className="text-sm">
            The GMS Dashboard is enabled for this organisation.{" "}
            <Link
              className="underline underline-offset-4"
              href={`/meteogram?org=${encodeURIComponent(organisation.id)}`}
            >
              Open the meteogram
            </Link>
            .
          </p>
        ) : (
          <p className="text-sm">
            The GMS Dashboard is not enabled for this organisation yet.
          </p>
        )}
        {request ? (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Latest request</dt>
            <dd>
              {request.status} (sent{" "}
              {new Date(request.created_at).toLocaleDateString("en-GB")})
            </dd>
            {request.decision_note ? (
              <>
                <dt className="text-muted-foreground">GMS note</dt>
                <dd>{request.decision_note}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </div>

      {canAsk && mayRequest ? (
        <form action={requestAccessAction} className="max-w-xl space-y-2">
          <input name="organisation" type="hidden" value={organisation.id} />
          <label className="block space-y-1 text-sm">
            <span className="block">What will you use it for? (optional)</span>
            <textarea
              className="w-full rounded-md border bg-background px-2 py-1.5"
              maxLength={500}
              name="note"
              rows={3}
            />
          </label>
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm"
            type="submit"
          >
            Request access
          </button>
        </form>
      ) : null}
      {canAsk && !mayRequest ? (
        <p className="text-muted-foreground text-sm">
          Ask an owner or admin of {organisation.name} to request access.
        </p>
      ) : null}
    </section>
  );
}
