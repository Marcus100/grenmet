"use client";

async function revokeSession(path: string): Promise<void> {
  try {
    await fetch(path, {
      credentials: "same-origin",
      method: "POST",
    });
  } catch {
    // Always continue to sign-in handoff, even on network failure.
  }
}

export function signOut(signInPath = "/signin"): void {
  if (typeof window === "undefined") return;

  revokeSession("/auth/logout").finally(() => {
    window.location.replace(signInPath);
  });
}

export function signOutEverywhere(signInPath = "/signin"): void {
  if (typeof window === "undefined") return;

  revokeSession("/auth/logout-all").finally(() => {
    window.location.replace(signInPath);
  });
}
