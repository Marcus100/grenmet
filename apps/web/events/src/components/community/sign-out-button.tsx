"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await fetch("/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <Button disabled={pending} onClick={signOut} type="button" variant="ghost">
      Sign out
    </Button>
  );
}
