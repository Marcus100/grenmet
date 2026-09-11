import { buildSharedSignInUrl } from "@barrelsgd/auth/server";
import { getEnv } from "../../../env";
import { getAuthConfig } from "../../../lib/auth-config";
// Authentication destinations come from the deployed runtime environment.
export const dynamic = "force-dynamic";

export default function SignIn() {
  const url = buildSharedSignInUrl(getAuthConfig(), {
    origin: getEnv().CMS_URL,
    returnTo: "/admin",
  });
  return (
    <main>
      <h1>GMS content</h1>
      <p>Use your existing GMS staff account to write and review articles.</p>
      <a href={url}>Sign in with GMS</a>
      <p>
        Access requires active GMS employment or a FastAPI administrator
        account.
      </p>
    </main>
  );
}
