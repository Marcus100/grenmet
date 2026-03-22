import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { signOut } from "@/lib/auth";

function getErrorDetail(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as {
    detail?: unknown;
    message?: unknown;
    response?: { data?: unknown };
  };

  const responseData = candidate.response?.data;
  let detail: string | null = null;
  if (typeof candidate.detail === "string") {
    detail = candidate.detail;
  } else if (
    typeof responseData === "object" &&
    responseData !== null &&
    typeof (responseData as { detail?: unknown }).detail === "string"
  ) {
    detail = (responseData as { detail?: string }).detail ?? null;
  }

  if (detail) return detail;

  return typeof candidate.message === "string" ? candidate.message : null;
}

function isAuthFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; response?: { status?: number } };
  const status = e.status ?? e.response?.status;

  if (status === 401) return true;
  if (status !== 403) return false;

  const detail = getErrorDetail(error)?.toLowerCase();
  if (!detail) return false;

  return (
    detail.includes("could not validate credentials") ||
    detail.includes("invalid token")
  );
}

function handleAuthFailure(): void {
  signOut();
}

const queryCache = new QueryCache({
  onError: (error) => {
    if (isAuthFailure(error)) handleAuthFailure();
  },
});

const mutationCache = new MutationCache({
  onError: (error) => {
    if (isAuthFailure(error)) handleAuthFailure();
  },
});

export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (isAuthFailure(error)) return false;
        return failureCount < 1;
      },
    },
  },
});
