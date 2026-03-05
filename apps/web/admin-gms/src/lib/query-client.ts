import {
  QueryCache,
  QueryClient,
  MutationCache,
} from "@tanstack/react-query";
import { signOut } from "@/lib/auth";

function is401(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; response?: { status?: number } };
  return e.status === 401 || e.response?.status === 401;
}

function handle401(): void {
  signOut();
}

const queryCache = new QueryCache({
  onError: (error) => {
    if (is401(error)) handle401();
  },
});

const mutationCache = new MutationCache({
  onError: (error) => {
    if (is401(error)) handle401();
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
        if (is401(error)) return false;
        return failureCount < 1;
      },
    },
  },
});
