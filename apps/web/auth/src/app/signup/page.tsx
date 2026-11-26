import { redirect } from "next/navigation";
import {
  getRequestedAppName,
  getSafeReturnTo,
  readQueryParam,
} from "@/lib/return-to";
import { signInPath } from "@/lib/sign-in-links";

export const dynamic = "force-dynamic";

/**
 * Sign-up and sign-in are one screen ("Sign in or create an account" at `/`):
 * the same emailed code signs a returning person in and creates a new account.
 * Old links to /signup keep working and keep where the person was going.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = getSafeReturnTo(readQueryParam(params.returnTo));
  redirect(
    signInPath("/", {
      app: getRequestedAppName(readQueryParam(params.app), returnTo),
      returnTo,
    })
  );
}
