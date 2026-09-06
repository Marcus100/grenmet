import { GoogleConfirm } from "./sign-in";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mfa?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl">Complete Google sign-in</h1>
      <GoogleConfirm requiresTotp={params.mfa === "1"} />
    </main>
  );
}
