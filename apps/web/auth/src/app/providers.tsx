"use client";

import { PostHogProvider } from "@barrelsgd/ui/components/posthog-provider";

export function Providers({
  apiHost,
  apiKey,
  children,
}: {
  apiHost: string;
  apiKey: string;
  children: React.ReactNode;
}) {
  return (
    <PostHogProvider apiHost={apiHost} apiKey={apiKey}>
      {children}
    </PostHogProvider>
  );
}
