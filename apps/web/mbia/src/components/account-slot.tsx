"use client";

import dynamic from "next/dynamic";

// Sign-in is off until MBIA_SSO_CLIENT_SECRET is set. Loading the account
// button (and its popover) on demand keeps it out of every page's first-load
// JavaScript while it is disabled. Once enabled, it renders as before.
const AccountButton = dynamic(() =>
  import("@barrelsgd/ui/components/account-button").then((m) => m.AccountButton)
);

export function AccountSlot({ appLabel }: { readonly appLabel: string }) {
  return <AccountButton appLabel={appLabel} />;
}
