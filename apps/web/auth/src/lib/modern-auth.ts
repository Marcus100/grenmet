import "server-only";
import {
  authEmailConfirm,
  authEmailRequest,
  authGoogleComplete,
  authGoogleFinish,
  authGoogleStart,
  createClient,
  type EmailConfirm,
  type EmailRequest,
  type GoogleComplete,
  type GoogleFinish,
  type GoogleStart,
} from "@barrelsgd/api-client";
import { authApiFetchResponse } from "@barrelsgd/auth/server";
import { getAuthConfig } from "./auth-config";
import { env } from "./env";

export const modernCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

const transport = createClient({
  transport: async (request) => {
    const config = getAuthConfig();
    const response = await authApiFetchResponse(
      config,
      request.url.replace(API_PREFIX, ""),
      {
        method: request.method,
        body:
          typeof request.body === "string"
            ? JSON.parse(request.body)
            : undefined,
      }
    );
    return {
      data: await response.json(),
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type") ?? undefined,
      headers: response.headers,
      request: new Request(
        config.authApiBaseUrl +
          config.authApiPrefix +
          request.url.replace(API_PREFIX, "")
      ),
      response,
    };
  },
});
export const googleStart = (body: GoogleStart) =>
  authGoogleStart({
    body,
    client: transport,
  }).unwrap();
export const googleComplete = (body: GoogleComplete) =>
  authGoogleComplete({
    body,
    client: transport,
  }).unwrap();
export const googleFinish = (body: GoogleFinish) =>
  authGoogleFinish({
    body,
    client: transport,
  }).unwrap();
export const emailRequest = (body: EmailRequest) =>
  authEmailRequest({
    body,
    client: transport,
  }).unwrap();
export const emailConfirm = (body: EmailConfirm) =>
  authEmailConfirm({
    body,
    client: transport,
  }).unwrap();

const API_PREFIX = /^\/api\/v1/;
