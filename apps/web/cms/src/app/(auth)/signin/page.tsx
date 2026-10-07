// Single sign-on (ADR-0017): /auth/start hands off to auth.barrels.gd.
export const dynamic = "force-dynamic";

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ sign_in?: string }>;
}) {
  const { sign_in: signIn } = await searchParams;
  return (
    <main>
      <h1>GMS content</h1>
      <p>Use your existing GMS staff account to write and review articles.</p>
      {signIn === "expired" ? (
        <p role="status">That sign-in link expired. Try again.</p>
      ) : null}
      <a href="/auth/start?returnTo=%2Fadmin">Sign in with GMS</a>
      <p>
        Access requires active GMS employment or a FastAPI administrator
        account.
      </p>
    </main>
  );
}
