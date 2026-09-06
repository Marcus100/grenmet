import { VerifyEmail } from "./verify-email";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl">Verify your email</h1>
      <VerifyEmail token={token ?? ""} />
    </main>
  );
}
