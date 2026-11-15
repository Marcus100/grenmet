import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { GoogleConfirm } from "./sign-in";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mfa?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthShell>
      <AuthHeading title="Complete Google sign-in" />
      <GoogleConfirm requiresTotp={params.mfa === "1"} />
    </AuthShell>
  );
}
