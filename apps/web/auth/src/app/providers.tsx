"use client";

import dynamic from "next/dynamic";

const PostHogProvider = dynamic(
  () =>
    import("@grenmet/ui/components/posthog-provider").then((m) => ({
      default: m.PostHogProvider,
    })),
  { ssr: false }
);

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
