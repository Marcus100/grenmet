"use client";

import { createFunnel } from "@barrelsgd/ui/lib/funnel-analytics";
import { useEffect } from "react";
import { SIGN_IN_COMPLETED_HASH } from "@/lib/sign-in-completed";

const funnel = createFunnel("account");

/**
 * Records `sign_in_completed` once when the single sign-on callback has
 * redirected here with the marker hash, then removes the hash from the URL.
 */
export function SignInCompletedMarker() {
  useEffect(() => {
    if (window.location.hash !== `#${SIGN_IN_COMPLETED_HASH}`) {
      return;
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`
    );
    funnel.capture("sign_in_completed");
  }, []);
  return null;
}
