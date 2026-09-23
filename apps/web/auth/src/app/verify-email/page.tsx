import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { VerifyEmail } from "./verify-email";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell greeting="Welcome" subtitle="Finish setting up your account.">
      <AuthHeading title="Verify your email">
        {token
          ? "Choose the password you'll use to sign in."
          : "We'll email you a link to verify your address and set a password."}
      </AuthHeading>
      <VerifyEmail token={token ?? ""} />
    </AuthShell>
  );
}
