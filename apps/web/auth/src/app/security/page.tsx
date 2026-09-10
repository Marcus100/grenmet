import { isAuthApiError } from "@barrelsgd/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadAccess, loadSecurity } from "./actions";
import { SecurityPanel } from "./security-panel";

function handleLoadError(error: unknown): null {
  if (isAuthApiError(error) && error.status === 401)
    redirect("/?session=expired");
  return null;
}
export default async function SecurityPage() {
  const [security, access] = await Promise.all([
    loadSecurity().catch(handleLoadError),
    loadAccess().catch(handleLoadError),
  ]);
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-6 py-10">
      <Link className="underline" href="/">
        Back to account
      </Link>
      <h1 className="font-semibold text-3xl">Account security</h1>
      <p className="text-(--muted)">
        Manage sign-in methods, authenticator protection and sessions.
      </p>
      <section aria-label="Your access" className="space-y-2">
        <h2 className="font-semibold text-xl">Your access</h2>
        {access ? (
          <>
            {access.is_superuser && (
              <p>Administrator access: unrestricted system permissions.</p>
            )}
            <p>Roles: {access.role_names.join(", ") || "No roles assigned"}</p>
            <details>
              <summary>Permission details</summary>
              <ul>
                {access.permission_keys.map((key) => (
                  <li key={key}>{key}</li>
                ))}
              </ul>
            </details>
            <p>Contact your administrator to request or review access.</p>
          </>
        ) : (
          <p role="alert">Access details could not be loaded.</p>
        )}
      </section>
      {security ? (
        <SecurityPanel security={security} />
      ) : (
        <p role="alert">
          Security details could not be loaded. Sign in, then retry this page.
        </p>
      )}
    </main>
  );
}
