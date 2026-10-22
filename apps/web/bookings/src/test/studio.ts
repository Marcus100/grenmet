import { ResponseError } from "@barrelsgd/api-client";

export const ORG_ID = "11111111-1111-4111-8111-111111111111";
export const PROVIDER_ID = "33333333-3333-4333-8333-333333333333";
export const BOOKING_ID = "22222222-2222-4222-8222-222222222222";

export const session = {
  accessToken: "tok",
  email: "maya@example.com",
  name: "Maya",
};

export function apiError(status: number, data: unknown = {}) {
  return new ResponseError({
    data,
    status,
    statusText: "",
    request: new Request("http://localhost/x"),
    response: new Response(null, { status }),
  });
}
