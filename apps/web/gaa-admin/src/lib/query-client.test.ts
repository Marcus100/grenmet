import { ResponseError } from "@barrelsgd/api-client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));

import { signOut } from "@/lib/auth";
import { queryClient } from "./query-client";

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

it.each([
  ["Invalid token", true],
  ["Insufficient permission", false],
])("handles Kubb's 403 payload: %s", async (detail, shouldSignOut) => {
  const error = new ResponseError({
    data: { detail },
    status: 403,
    statusText: "Forbidden",
    request: new Request("https://api.test"),
    response: new Response(null, { status: 403 }),
  });
  await expect(
    queryClient.fetchQuery({
      queryKey: [detail],
      queryFn: () => Promise.reject(error),
      retry: false,
    })
  ).rejects.toBe(error);
  expect(signOut).toHaveBeenCalledTimes(shouldSignOut ? 1 : 0);
});
