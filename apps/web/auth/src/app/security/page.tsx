import Link from "next/link";
import { loadSecurity } from "./actions";
import { SecurityPanel } from "./security-panel";

export default async function SecurityPage() {
  const security = await loadSecurity().catch(() => null);
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-6 py-10">
      <Link className="underline" href="/">
        Back to account
      </Link>
      <h1 className="font-semibold text-3xl">Account security</h1>
      <p className="text-(--muted)">
        Manage sign-in methods, authenticator protection and sessions.
      </p>
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
