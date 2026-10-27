"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { type ActionResult, SIGN_IN_REQUIRED } from "@/data/action-result";
import { reportError } from "@/lib/report-error";

/** Returned in place of a result when the action itself threw (network, crash). */
export interface ThrownFailure {
  readonly error: string;
  readonly keepKey: true;
  readonly ok: false;
}

const GENERIC = "Something went wrong. Try again shortly.";

/**
 * Runs a server action for the signed-in member. Visitors are sent to sign
 * in and brought back; other failures surface as `error` text. A call that
 * throws becomes a failure that keeps its idempotency key (the request may
 * have landed) and always clears `pending`.
 */
export function useMemberAction(thrownMessage: string = GENERIC) {
  const router = useRouter();
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function perform<R extends ActionResult<unknown>>(
    call: () => Promise<R>
  ): Promise<R | ThrownFailure> {
    setPending(true);
    setError(null);
    try {
      const result = await call();
      if (result.ok) {
        return result;
      }
      if (result.error === SIGN_IN_REQUIRED) {
        router.push(`/sign-in?returnTo=${encodeURIComponent(pathname)}`);
      } else {
        setError(result.error);
      }
      return result;
    } catch (thrown) {
      reportError(thrown, "events-member-action");
      setError(thrownMessage);
      return { ok: false, error: thrownMessage, keepKey: true };
    } finally {
      setPending(false);
    }
  }

  return { error, pending, perform };
}
