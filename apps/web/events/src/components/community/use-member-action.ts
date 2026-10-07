"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { type ActionResult, SIGN_IN_REQUIRED } from "@/data/action-result";

/**
 * Runs a server action for the signed-in member. Visitors are sent to sign
 * in and brought back; other failures surface as `error` text.
 */
export function useMemberAction() {
  const router = useRouter();
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function perform<T>(
    call: () => Promise<ActionResult<T>>
  ): Promise<ActionResult<T>> {
    setPending(true);
    setError(null);
    const result = await call();
    setPending(false);
    if (result.ok) {
      return result;
    }
    if (result.error === SIGN_IN_REQUIRED) {
      router.push(`/sign-in?returnTo=${encodeURIComponent(pathname)}`);
    } else {
      setError(result.error);
    }
    return result;
  }

  return { error, pending, perform };
}
