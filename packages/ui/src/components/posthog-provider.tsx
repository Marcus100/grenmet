"use client";

import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { Suspense, useEffect } from "react";

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (pathname && ph) {
      let url = window.location.origin + pathname;
      const search = searchParams.toString();
      if (search) url += `?${search}`;
      ph.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams, ph]);

  return null;
}

interface PostHogProviderProps {
  apiHost: string;
  apiKey: string;
  children: React.ReactNode;
}

export function PostHogProvider({
  apiKey,
  apiHost,
  children,
}: PostHogProviderProps) {
  useEffect(() => {
    if (!apiKey) return;
    posthog.init(apiKey, {
      api_host: apiHost,
      defaults: "2026-01-30",
      person_profiles: "identified_only",
      capture_pageview: false,
      capture_pageleave: true,
    });
  }, [apiKey, apiHost]);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}
